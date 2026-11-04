import { redis } from "../config/redis";
import { logger } from "../config/logger";
import { AUTOMATION_TYPES, WhatsappAutomation, type AutomationType } from "../models/WhatsappAutomation.model";
import { WhatsappConversation } from "../models/WhatsappConversation.model";
import { WhatsappMessage } from "../models/WhatsappMessage.model";
import { WhatsappQuickReply } from "../models/WhatsappQuickReply.model";
import { WhatsappSettings } from "../models/WhatsappSettings.model";
import { ApiError } from "../utils/ApiError";
import { DEFAULT_HOURS, isWithinHours, matchKeyword, type BusinessHours, type KeywordMatch } from "../utils/whatsappAutomation";
import type { InboundMessage } from "../utils/whatsappWebhook";
import { sendWhatsAppText } from "./whatsapp.service";
import { isBotPausedFor, recordOutbound } from "./whatsappChat.service";
import { deliverSaved } from "./whatsappQuickReply.service";

/**
 * Automatic replies. They run before the built-in menu bot: a keyword rule
 * answers the message itself; a welcome or away message goes out and, for a
 * plain greeting, replaces the menu. A person chatting with the customer
 * silences all of it, like the menu bot.
 */

const AWAY_COOLDOWN_SECONDS = 12 * 60 * 60;
const SETTINGS_KEY = "main";

export interface AutomationReply {
  kind: "text" | "saved";
  text?: string;
  savedId?: string;
}

export interface AutomationInput {
  name: string;
  type: AutomationType;
  enabled: boolean;
  keywords: string[];
  match: KeywordMatch;
  reply: AutomationReply;
}

type Row = {
  _id: unknown;
  name: string;
  type: string;
  enabled?: boolean | null;
  keywords?: string[] | null;
  match?: string | null;
  reply?: { kind?: string | null; text?: string | null; savedId?: unknown } | null;
  timesUsed?: number | null;
  lastUsedAt?: Date | null;
};

function toDto(a: Row, savedTitle?: string) {
  return {
    id: String(a._id),
    name: a.name,
    type: a.type as AutomationType,
    enabled: a.enabled !== false,
    keywords: a.keywords ?? [],
    match: (a.match === "exact" ? "exact" : "contains") as KeywordMatch,
    reply: { kind: a.reply?.kind === "saved" ? "saved" : "text", text: a.reply?.text ?? "", savedId: a.reply?.savedId ? String(a.reply.savedId) : "", savedTitle: savedTitle ?? "" },
    timesUsed: a.timesUsed ?? 0,
    lastUsedAt: a.lastUsedAt ?? null,
  };
}

export async function listAutomations() {
  const rows = await WhatsappAutomation.find().sort({ type: 1, createdAt: 1 }).lean();
  const savedIds = rows.map((r) => r.reply?.savedId).filter(Boolean);
  const saved = savedIds.length > 0 ? await WhatsappQuickReply.find({ _id: { $in: savedIds } }).select("title").lean() : [];
  const titles = new Map(saved.map((s) => [String(s._id), s.title]));
  return rows.map((r) => toDto(r, r.reply?.savedId ? titles.get(String(r.reply.savedId)) : undefined));
}

async function validate(input: AutomationInput, ignoreId?: string): Promise<void> {
  if (!AUTOMATION_TYPES.includes(input.type)) throw ApiError.badRequest("Unknown automation type");

  if (input.type === "keyword" && input.keywords.filter((k) => k.trim()).length === 0) {
    throw ApiError.badRequest("Add at least one keyword");
  }
  if (input.reply.kind === "text" && !input.reply.text?.trim()) throw ApiError.badRequest("Write the reply");
  if (input.reply.kind === "saved") {
    if (!input.reply.savedId || !(await WhatsappQuickReply.exists({ _id: input.reply.savedId }))) {
      throw ApiError.badRequest("Choose a saved message to send");
    }
  }
  // One welcome and one away message is all that makes sense.
  if (input.type !== "keyword") {
    const clash = await WhatsappAutomation.findOne({ type: input.type, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }).select("_id").lean();
    if (clash) throw ApiError.conflict(`There is already a ${input.type} message. Edit that one instead.`);
  }
}

function toDoc(input: AutomationInput) {
  return {
    name: input.name,
    type: input.type,
    enabled: input.enabled,
    keywords: input.type === "keyword" ? input.keywords.map((k) => k.trim()).filter(Boolean) : [],
    match: input.match,
    reply:
      input.reply.kind === "saved"
        ? { kind: "saved" as const, text: "", savedId: input.reply.savedId }
        : { kind: "text" as const, text: (input.reply.text ?? "").trim() },
  };
}

export async function createAutomation(input: AutomationInput, userId: string) {
  await validate(input);
  if ((await WhatsappAutomation.estimatedDocumentCount()) >= 100) throw ApiError.conflict("You can have at most 100 automations");
  const row = await WhatsappAutomation.create({ ...toDoc(input), createdBy: userId });
  return toDto(row);
}

export async function updateAutomation(id: string, input: AutomationInput) {
  await validate(input, id);
  const row = await WhatsappAutomation.findByIdAndUpdate(id, { $set: toDoc(input) }, { returnDocument: "after" }).lean();
  if (!row) throw ApiError.notFound("Automation not found");
  return toDto(row);
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
  const result = await WhatsappAutomation.updateOne({ _id: id }, { $set: { enabled } });
  if (result.matchedCount === 0) throw ApiError.notFound("Automation not found");
}

export async function deleteAutomation(id: string): Promise<void> {
  const result = await WhatsappAutomation.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw ApiError.notFound("Automation not found");
}

// ---------------------------------------------------------------------------
// Business hours
// ---------------------------------------------------------------------------

export async function getBusinessHours(): Promise<BusinessHours> {
  const settings = await WhatsappSettings.findOne({ key: SETTINGS_KEY }).select("hours").lean();
  const hours = settings?.hours as BusinessHours | undefined;
  return hours && Array.isArray(hours.days) && hours.days.length === 7 ? hours : DEFAULT_HOURS;
}

export async function setBusinessHours(hours: BusinessHours, userId: string): Promise<void> {
  await WhatsappSettings.updateOne({ key: SETTINGS_KEY }, { $set: { hours, updatedBy: userId } }, { upsert: true });
}

// ---------------------------------------------------------------------------
// Running them
// ---------------------------------------------------------------------------

async function sendReply(waId: string, reply: NonNullable<Row["reply"]>): Promise<void> {
  if (reply.kind === "saved" && reply.savedId) {
    await deliverSaved(waId, String(reply.savedId), { source: "bot" });
    return;
  }
  const text = reply.text ?? "";
  const waMessageId = await sendWhatsAppText(waId, text);
  await recordOutbound({ waId, waMessageId, text, source: "bot" });
}

async function bump(id: unknown): Promise<void> {
  await WhatsappAutomation.updateOne({ _id: id }, { $inc: { timesUsed: 1 }, $set: { lastUsedAt: new Date() } });
}

/**
 * Looks for an automation that answers this message and sends it. Resolves true
 * when the message is fully handled (the built-in menu should then stay quiet).
 * Never throws: a broken automation must not stop the normal bot from answering.
 */
export async function runAutomations(message: InboundMessage, intent: string): Promise<boolean> {
  try {
    if (await isBotPausedFor(message.from)) return false;

    const rules = await WhatsappAutomation.find({ enabled: true }).lean();
    if (rules.length === 0) return false;
    const simple = intent === "greeting" || intent === "unknown";

    // 1) Keywords: the first rule that matches answers.
    if (message.text) {
      const keywordRules = rules.filter((r) => r.type === "keyword");
      const index = matchKeyword(message.text, keywordRules.map((r) => ({ keywords: r.keywords ?? [], match: r.match === "exact" ? "exact" : "contains" })));
      const hit = index >= 0 ? keywordRules[index] : undefined;
      if (hit?.reply) {
        await sendReply(message.from, hit.reply);
        await bump(hit._id);
        return true;
      }
    }

    // 2) Welcome: the customer's first ever message.
    const welcome = rules.find((r) => r.type === "welcome");
    if (welcome?.reply) {
      const conversation = await WhatsappConversation.findOne({ waId: message.from }).select("_id").lean();
      const inbound = conversation ? await WhatsappMessage.countDocuments({ conversation: conversation._id, direction: "in" }) : 0;
      if (inbound === 1) {
        await sendReply(message.from, welcome.reply);
        await bump(welcome._id);
        return simple;
      }
    }

    // 3) Away: outside business hours, once every 12 hours per customer.
    const away = rules.find((r) => r.type === "away");
    if (away?.reply && !isWithinHours(new Date(), await getBusinessHours())) {
      const first = (await redis.set(`wa:auto:away:${message.from}`, "1", "EX", AWAY_COOLDOWN_SECONDS, "NX")) === "OK";
      if (first) {
        await sendReply(message.from, away.reply);
        await bump(away._id);
        return simple;
      }
    }
    return false;
  } catch (err) {
    logger.error({ err, messageId: message.id }, "WhatsApp automation failed; falling back to the normal bot");
    return false;
  }
}
