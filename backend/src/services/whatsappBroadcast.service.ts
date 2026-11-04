import { Types } from "mongoose";
import { redis } from "../config/redis";
import { logger } from "../config/logger";
import { Customer } from "../models/Customer.model";
import { WhatsappBroadcast, type BroadcastStatus } from "../models/WhatsappBroadcast.model";
import { WhatsappBroadcastRecipient } from "../models/WhatsappBroadcastRecipient.model";
import { WhatsappConversation } from "../models/WhatsappConversation.model";
import { ApiError } from "../utils/ApiError";
import {
  countsFromStatuses,
  dedupeAudience,
  MAX_BROADCAST_RECIPIENTS,
  SEND_GAP_MS,
  valuesFor,
  type AudienceEntry,
  type BroadcastCounts,
  type Recipient,
} from "../utils/whatsappBroadcast";
import { statusesItMayReplace } from "../utils/whatsappChat";
import {
  buildTemplateComponents,
  renderTemplateText,
  TemplateValueError,
  type TemplateValues,
} from "../utils/whatsappTemplates";
import type { StatusEvent } from "../utils/whatsappWebhook";
import { sendWhatsAppTemplate } from "./whatsapp.service";
import { recordOutbound } from "./whatsappChat.service";
import { getSendableTemplate } from "./whatsappTemplate.service";
import { isWhatsappEnabled } from "./whatsappSettings.service";

/**
 * Broadcasts: a template to a chosen group, sent one at a time at a gentle pace.
 * The sender runs inside the server and keeps going after a restart (see
 * resumeBroadcasts). Marketing templates should only go to people who agreed to
 * hear from the shop; anyone who replies STOP is skipped from then on.
 */

export interface AudienceInput {
  allCustomers: boolean;
  customerTags: string[];
  labels: string[];
  numbers: string[];
}

const LOCK_SECONDS = 90;
/** After this many failures in a row (a revoked token, a blocked account) the broadcast stops instead of burning through the list. */
const MAX_CONSECUTIVE_FAILURES = 8;

// ---------------------------------------------------------------------------
// Who gets it
// ---------------------------------------------------------------------------

async function collectAudience(audience: AudienceInput): Promise<{ recipients: Recipient[]; optedOut: number }> {
  const entries: AudienceEntry[] = [];

  if (audience.allCustomers || audience.customerTags.length > 0) {
    const customers = await Customer.find(audience.allCustomers ? {} : { tags: { $in: audience.customerTags } })
      .select("name phone")
      .limit(MAX_BROADCAST_RECIPIENTS + 1)
      .lean();
    for (const c of customers) entries.push({ phone: c.phone, name: c.name });
  }

  if (audience.labels.length > 0) {
    const chats = await WhatsappConversation.find({ labels: { $in: audience.labels } })
      .select("waId profileName")
      .limit(MAX_BROADCAST_RECIPIENTS + 1)
      .lean();
    for (const c of chats) entries.push({ phone: c.waId, name: c.profileName });
  }

  for (const number of audience.numbers) entries.push({ phone: number });

  const unique = dedupeAudience(entries);
  const stopped = await WhatsappConversation.find({ waId: { $in: unique.map((r) => r.waId) }, optedOut: true }).select("waId").lean();
  const stoppedIds = new Set(stopped.map((c) => c.waId));

  return { recipients: unique.filter((r) => !stoppedIds.has(r.waId)), optedOut: stoppedIds.size };
}

export async function previewAudience(audience: AudienceInput) {
  const { recipients, optedOut } = await collectAudience(audience);
  return { count: recipients.length, optedOut, tooMany: recipients.length > MAX_BROADCAST_RECIPIENTS, limit: MAX_BROADCAST_RECIPIENTS, sample: recipients.slice(0, 5) };
}

// ---------------------------------------------------------------------------
// Creating and running
// ---------------------------------------------------------------------------

export interface CreateBroadcastInput {
  name: string;
  templateId: string;
  values: TemplateValues;
  nameVariable?: number;
  audience: AudienceInput;
  /** Start sending right away (otherwise it stays a draft). */
  start: boolean;
}

export async function createBroadcast(input: CreateBroadcastInput, userId: string): Promise<string> {
  const template = await getSendableTemplate(input.templateId);

  if (input.nameVariable !== undefined && input.nameVariable >= template.bodyVariables.length) {
    throw ApiError.badRequest("The chosen name variable doesn't exist in this template");
  }
  // Check the values now, with a sample name, so a mistake is caught before anyone is messaged.
  try {
    buildTemplateComponents(template, valuesFor(input.values, input.nameVariable, "Sample"));
  } catch (err) {
    if (err instanceof TemplateValueError) throw ApiError.badRequest(err.message);
    throw err;
  }

  const { recipients, optedOut } = await collectAudience(input.audience);
  if (recipients.length === 0) throw ApiError.badRequest("Nobody to send to. Choose customers, labels or numbers.");
  if (recipients.length > MAX_BROADCAST_RECIPIENTS) {
    throw ApiError.badRequest(`That is ${recipients.length} people. A broadcast can go to at most ${MAX_BROADCAST_RECIPIENTS}. Narrow the audience.`);
  }

  const broadcast = await WhatsappBroadcast.create({
    name: input.name,
    templateId: input.templateId,
    templateName: template.name,
    language: template.language,
    values: input.values,
    nameVariable: input.nameVariable,
    audience: input.audience,
    status: input.start ? "sending" : "draft",
    total: recipients.length,
    optedOutSkipped: optedOut,
    startedAt: input.start ? new Date() : undefined,
    createdBy: userId,
  });
  await WhatsappBroadcastRecipient.insertMany(recipients.map((r) => ({ broadcast: broadcast._id, waId: r.waId, name: r.name })));

  if (input.start) void runBroadcast(String(broadcast._id));
  return String(broadcast._id);
}

export async function startBroadcast(id: string): Promise<void> {
  const broadcast = await WhatsappBroadcast.findById(id);
  if (!broadcast) throw ApiError.notFound("Broadcast not found");
  if (broadcast.status !== "draft") throw ApiError.conflict("Only a draft can be started");
  broadcast.status = "sending";
  broadcast.startedAt = new Date();
  await broadcast.save();
  void runBroadcast(id);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function finish(id: string, status: BroadcastStatus, error?: string): Promise<void> {
  await WhatsappBroadcast.updateOne({ _id: id, status: "sending" }, { $set: { status, completedAt: new Date(), ...(error ? { error } : {}) } });
}

/** Sends the queued recipients, one by one. Safe to call twice: a lock keeps a single runner per broadcast. */
export async function runBroadcast(id: string): Promise<void> {
  const lockKey = `wa:broadcast:lock:${id}`;
  if ((await redis.set(lockKey, "1", "EX", LOCK_SECONDS, "NX")) !== "OK") return;

  try {
    const broadcast = await WhatsappBroadcast.findById(id).lean();
    if (!broadcast || broadcast.status !== "sending") return;
    const template = await getSendableTemplate(String(broadcast.templateId));
    const values = (broadcast.values ?? {}) as TemplateValues;
    let failuresInARow = 0;

    for (;;) {
      const current = await WhatsappBroadcast.findById(id).select("status").lean();
      if (current?.status !== "sending") return; // cancelled meanwhile
      if (!(await isWhatsappEnabled())) {
        await finish(id, "failed", "The WhatsApp service was turned off while sending");
        return;
      }

      const batch = await WhatsappBroadcastRecipient.find({ broadcast: id, status: "queued" }).sort({ _id: 1 }).limit(20).lean();
      if (batch.length === 0) {
        await finish(id, "completed");
        return;
      }

      for (const person of batch) {
        await redis.expire(lockKey, LOCK_SECONDS);
        const personValues = valuesFor(values, broadcast.nameVariable ?? undefined, person.name);
        try {
          const waMessageId = await sendWhatsAppTemplate(person.waId, template.name, template.language, buildTemplateComponents(template, personValues));
          await WhatsappBroadcastRecipient.updateOne({ _id: person._id }, { $set: { status: "sent", waMessageId, sentAt: new Date() } });
          failuresInARow = 0;
          try {
            await recordOutbound({
              waId: person.waId,
              waMessageId,
              text: renderTemplateText(template, personValues),
              source: "broadcast",
              type: "template",
            });
          } catch (err) {
            // The message is sent; only the chat history missed it.
            logger.warn({ err }, "Could not record a broadcast message in its chat");
          }
        } catch (err) {
          failuresInARow += 1;
          const reason = err instanceof Error ? err.message : "Could not send";
          await WhatsappBroadcastRecipient.updateOne({ _id: person._id }, { $set: { status: "failed", error: reason.slice(0, 300) } });
          if (failuresInARow >= MAX_CONSECUTIVE_FAILURES) {
            await finish(id, "failed", `Stopped after ${MAX_CONSECUTIVE_FAILURES} failures in a row: ${reason.slice(0, 200)}`);
            return;
          }
        }
        await sleep(SEND_GAP_MS);
      }
    }
  } catch (err) {
    logger.error({ err, id }, "Broadcast run failed");
    await finish(id, "failed", err instanceof Error ? err.message.slice(0, 200) : "Unexpected error").catch(() => undefined);
  } finally {
    await redis.del(lockKey).catch(() => undefined);
  }
}

/** Called once at startup: carries on with any broadcast that was mid-send when the server stopped. */
export async function resumeBroadcasts(): Promise<void> {
  const running = await WhatsappBroadcast.find({ status: "sending" }).select("_id").lean();
  for (const b of running) void runBroadcast(String(b._id));
  if (running.length > 0) logger.info({ count: running.length }, "Resumed WhatsApp broadcasts");
}

export async function cancelBroadcast(id: string): Promise<void> {
  const result = await WhatsappBroadcast.updateOne({ _id: id, status: { $in: ["draft", "sending"] } }, { $set: { status: "cancelled", completedAt: new Date() } });
  if (result.matchedCount === 0 && !(await WhatsappBroadcast.exists({ _id: id }))) throw ApiError.notFound("Broadcast not found");
}

export async function deleteBroadcast(id: string): Promise<void> {
  const broadcast = await WhatsappBroadcast.findById(id).select("status").lean();
  if (!broadcast) throw ApiError.notFound("Broadcast not found");
  if (broadcast.status === "sending") throw ApiError.conflict("Cancel the broadcast before deleting it");
  await WhatsappBroadcastRecipient.deleteMany({ broadcast: id });
  await WhatsappBroadcast.deleteOne({ _id: id });
}

// ---------------------------------------------------------------------------
// Delivery receipts
// ---------------------------------------------------------------------------

/** A delivery receipt for a message that was part of a broadcast: moves its recipient forward, never back. */
export async function applyBroadcastStatus(event: StatusEvent): Promise<void> {
  if (event.status !== "sent" && event.status !== "delivered" && event.status !== "read" && event.status !== "failed") return;
  await WhatsappBroadcastRecipient.updateOne(
    { waMessageId: event.id, status: { $in: statusesItMayReplace(event.status).filter((s): s is "sent" | "delivered" | "read" => s !== "received" && s !== "failed") } },
    { $set: { status: event.status, ...(event.error ? { error: event.error } : {}) } },
  );
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function countsFor(ids: string[]): Promise<Map<string, BroadcastCounts>> {
  if (ids.length === 0) return new Map();
  const rows = await WhatsappBroadcastRecipient.aggregate<{ _id: { b: unknown; s: string }; n: number }>([
    { $match: { broadcast: { $in: ids.map((id) => new Types.ObjectId(id)) } } },
    { $group: { _id: { b: "$broadcast", s: "$status" }, n: { $sum: 1 } } },
  ]);
  const grouped = new Map<string, { status: string; n: number }[]>();
  for (const r of rows) {
    const key = String(r._id.b);
    grouped.set(key, [...(grouped.get(key) ?? []), { status: r._id.s, n: r.n }]);
  }
  return new Map(ids.map((id) => [id, countsFromStatuses(grouped.get(id) ?? [])]));
}

type BroadcastRow = {
  _id: unknown;
  name: string;
  templateName: string;
  language: string;
  status: string;
  error?: string | null;
  total?: number | null;
  optedOutSkipped?: number | null;
  nameVariable?: number | null;
  audience?: { allCustomers?: boolean | null; customerTags?: string[] | null; labels?: string[] | null; numbers?: string[] | null } | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
};

function toDto(b: BroadcastRow, counts: BroadcastCounts) {
  return {
    id: String(b._id),
    name: b.name,
    templateName: b.templateName,
    language: b.language,
    status: b.status,
    error: b.error ?? "",
    optedOutSkipped: b.optedOutSkipped ?? 0,
    audience: {
      allCustomers: !!b.audience?.allCustomers,
      customerTags: b.audience?.customerTags ?? [],
      labels: b.audience?.labels ?? [],
      numbers: (b.audience?.numbers ?? []).length,
    },
    counts,
    startedAt: b.startedAt ?? null,
    completedAt: b.completedAt ?? null,
    createdAt: b.createdAt ?? null,
  };
}

export async function listBroadcasts() {
  const rows = await WhatsappBroadcast.find().sort({ createdAt: -1 }).limit(100).lean();
  const counts = await countsFor(rows.map((r) => String(r._id)));
  return rows.map((r) => toDto(r, counts.get(String(r._id)) ?? countsFromStatuses([])));
}

export async function getBroadcast(id: string, options: { status?: string; page: number; limit: number }) {
  const broadcast = await WhatsappBroadcast.findById(id).lean();
  if (!broadcast) throw ApiError.notFound("Broadcast not found");

  const filter: Record<string, unknown> = { broadcast: id };
  if (options.status) filter.status = options.status;

  const [counts, recipients, total] = await Promise.all([
    countsFor([id]),
    WhatsappBroadcastRecipient.find(filter).sort({ _id: 1 }).skip((options.page - 1) * options.limit).limit(options.limit).lean(),
    WhatsappBroadcastRecipient.countDocuments(filter),
  ]);

  return {
    ...toDto(broadcast, counts.get(id) ?? countsFromStatuses([])),
    recipients: {
      items: recipients.map((r) => ({ waId: r.waId, name: r.name ?? "", status: r.status, error: r.error ?? "", sentAt: r.sentAt ?? null })),
      total,
      page: options.page,
      limit: options.limit,
    },
  };
}
