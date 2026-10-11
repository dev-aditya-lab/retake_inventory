import { Types } from "mongoose";
import { Customer } from "../models/Customer.model";
import { User } from "../models/User.model";
import { WhatsappAlert } from "../models/WhatsappAlert.model";
import { WhatsappConversation, type WhatsappConversationDoc } from "../models/WhatsappConversation.model";
import { WhatsappMessage } from "../models/WhatsappMessage.model";
import { ApiError } from "../utils/ApiError";
import { isDuplicateKeyError } from "../utils/mongoErrors";
import { phoneKey } from "../utils/phone";
import { escapeRegex } from "../utils/regex";
import {
  BOT_PAUSE_MS,
  describeInbound,
  fromUnixSeconds,
  isBotPaused,
  isReplyWindowOpen,
  isReportedStatus,
  MAX_TEXT_LENGTH,
  previewOf,
  replyWindowClosesAt,
  statusesItMayReplace,
} from "../utils/whatsappChat";
import type { EchoMessage, InboundMessage, StatusEvent } from "../utils/whatsappWebhook";
import { sendWhatsAppText } from "./whatsapp.service";

/**
 * The in-app chat: stores every customer message and every reply (ours, the
 * bot's, or the Business app's), and lets staff read and answer them.
 * Webhook-facing writes are idempotent (keyed on WhatsApp's message id) because
 * Meta redelivers.
 */

type MessageSource = "customer" | "app" | "bot" | "business_app";

async function ensureConversation(waId: string, profileName?: string): Promise<WhatsappConversationDoc> {
  const update = {
    $setOnInsert: { waId },
    ...(profileName ? { $set: { profileName } } : {}),
  };
  try {
    const conversation = await WhatsappConversation.findOneAndUpdate({ waId }, update, {
      upsert: true,
      returnDocument: "after",
    });
    if (conversation) return conversation;
  } catch (err) {
    // Two webhooks for a brand-new customer raced to create the thread.
    if (!isDuplicateKeyError(err)) throw err;
  }
  const existing = await WhatsappConversation.findOne({ waId });
  if (!existing) throw new Error(`Could not create a conversation for ${waId}`);
  return existing;
}

// ---------------------------------------------------------------------------
// Written by the webhook
// ---------------------------------------------------------------------------

/**
 * Stores an incoming customer message. Resolves true when it is new, false when
 * Meta redelivered one we already have (so callers don't answer it twice).
 */
export async function recordInbound(message: InboundMessage, options: { needsHuman: boolean }): Promise<boolean> {
  const conversation = await ensureConversation(message.from, message.profileName);
  const at = fromUnixSeconds(message.timestamp);
  const text = describeInbound(message);

  const result = await WhatsappMessage.updateOne(
    { waMessageId: message.id },
    {
      $setOnInsert: {
        conversation: conversation._id,
        waMessageId: message.id,
        direction: "in",
        type: message.type,
        text,
        status: "received",
        source: "customer",
        timestamp: at,
      },
    },
    { upsert: true },
  );
  if (result.upsertedCount === 0) return false;

  await WhatsappConversation.updateOne(
    { _id: conversation._id },
    {
      $max: { lastMessageAt: at, lastInboundAt: at },
      $set: {
        lastMessagePreview: previewOf(text),
        lastDirection: "in",
        ...(options.needsHuman ? { needsHuman: true } : {}),
      },
      $inc: { unreadCount: 1 },
    },
  );
  return true;
}

export interface OutboundRecord {
  /** The customer's WhatsApp id. */
  waId: string;
  /** WhatsApp's id for the message we sent, when the API gave one. */
  waMessageId?: string;
  text: string;
  source: Exclude<MessageSource, "customer">;
  sentBy?: string;
  type?: string;
  at?: Date;
}

/** Stores a message we (or the Business app) sent, so the thread reads as a whole conversation. */
export async function recordOutbound(record: OutboundRecord): Promise<void> {
  const conversation = await ensureConversation(record.waId);
  const at = record.at ?? new Date();

  const fields = {
    conversation: conversation._id,
    type: record.type ?? "text",
    text: record.text,
    source: record.source,
    timestamp: at,
    ...(record.sentBy ? { sentBy: new Types.ObjectId(record.sentBy) } : {}),
  };

  if (record.waMessageId) {
    // A delivery receipt can beat this write; the upsert merges with the stub it left.
    await WhatsappMessage.updateOne(
      { waMessageId: record.waMessageId },
      { $set: fields, $setOnInsert: { waMessageId: record.waMessageId, direction: "out", status: "sent" } },
      { upsert: true },
    );
  } else {
    await WhatsappMessage.create({ ...fields, direction: "out", status: "sent" });
  }

  await WhatsappConversation.updateOne(
    { _id: conversation._id },
    { $max: { lastMessageAt: at }, $set: { lastMessagePreview: previewOf(record.text), lastDirection: "out" } },
  );
}

/** A delivery receipt for a message we sent: moves its ticks forward, never back. */
export async function recordStatus(event: StatusEvent): Promise<void> {
  if (!isReportedStatus(event.status)) return; // e.g. "deleted", "warning": nothing to show

  const result = await WhatsappMessage.updateOne(
    { waMessageId: event.id, status: { $in: statusesItMayReplace(event.status) } },
    { $set: { status: event.status, ...(event.error ? { error: event.error } : {}) } },
  );
  if (result.matchedCount > 0) return;

  // Either already further along (fine), or we haven't stored the message yet:
  // leave a stub that recordOutbound() will fill in.
  const conversation = await ensureConversation(event.recipientId);
  await WhatsappMessage.updateOne(
    { waMessageId: event.id },
    {
      $setOnInsert: {
        conversation: conversation._id,
        waMessageId: event.id,
        direction: "out",
        type: "text",
        text: "",
        source: "bot",
        status: event.status,
        ...(event.error ? { error: event.error } : {}),
        timestamp: fromUnixSeconds(event.timestamp),
      },
    },
    { upsert: true },
  );
}

/** Something typed in the WhatsApp Business app on our own number. */
export async function recordEcho(echo: EchoMessage): Promise<void> {
  await recordOutbound({
    waId: echo.to,
    waMessageId: echo.id,
    text: describeInbound({ type: echo.type, text: echo.text }),
    source: "business_app",
    type: echo.type,
    at: fromUnixSeconds(echo.timestamp),
  });
}

/** True while a staff member is handling this customer's chat. */
export async function isBotPausedFor(waId: string): Promise<boolean> {
  const conversation = await WhatsappConversation.findOne({ waId }).select("botPausedUntil").lean();
  return isBotPaused(conversation?.botPausedUntil);
}

// ---------------------------------------------------------------------------
// Read and written by staff
// ---------------------------------------------------------------------------

export interface ListChatsFilters {
  search?: string;
  filter: "all" | "unread" | "needs_reply";
  page: number;
  limit: number;
}

export async function listConversations({ search, filter, page, limit }: ListChatsFilters) {
  const query: Record<string, unknown> = {};
  if (filter === "unread") query.unreadCount = { $gt: 0 };
  if (filter === "needs_reply") query.needsHuman = true;

  if (search) {
    const pattern = escapeRegex(search);
    const digits = search.replace(/\D/g, "");
    // Customers matched by their directory name are found through their phone.
    const byName = await Customer.find({ name: { $regex: pattern, $options: "i" } })
      .select("phoneKey")
      .limit(50)
      .lean();
    query.$or = [
      { profileName: { $regex: pattern, $options: "i" } },
      ...(digits.length >= 3 ? [{ waId: { $regex: escapeRegex(digits) } }] : []),
      ...(byName.length > 0 ? [{ waId: { $in: byName.map((c) => c.phoneKey) } }] : []),
    ];
  }

  const [conversations, total] = await Promise.all([
    WhatsappConversation.find(query)
      .sort({ lastMessageAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WhatsappConversation.countDocuments(query),
  ]);

  const customers = await Customer.find({ phoneKey: { $in: conversations.map((c) => c.waId) } })
    .select("phoneKey name")
    .lean();
  const nameByPhone = new Map(customers.map((c) => [c.phoneKey, c.name]));
  const now = new Date();

  return {
    items: conversations.map((c) => ({
      id: String(c._id),
      waId: c.waId,
      name: nameByPhone.get(c.waId) ?? c.profileName ?? "",
      isCustomer: nameByPhone.has(c.waId),
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview ?? "",
      lastDirection: c.lastDirection ?? null,
      unreadCount: c.unreadCount ?? 0,
      needsHuman: !!c.needsHuman,
      windowOpen: isReplyWindowOpen(c.lastInboundAt, now),
    })),
    total,
    page,
    limit,
  };
}

export const THREAD_PAGE = 50;

/** The newest `limit` messages of a chat, oldest first. Asking for more is how earlier history is loaded. */
export async function getThread(id: string, limit: number = THREAD_PAGE) {
  const conversation = await WhatsappConversation.findById(id).lean();
  if (!conversation) throw ApiError.notFound("Chat not found");

  const rows = await WhatsappMessage.find({ conversation: conversation._id })
    .sort({ timestamp: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  const senderIds = [...new Set(page.map((m) => (m.sentBy ? String(m.sentBy) : "")).filter(Boolean))];
  const senders = senderIds.length > 0 ? await User.find({ _id: { $in: senderIds } }).select("name").lean() : [];
  const senderName = new Map(senders.map((u) => [String(u._id), u.name]));

  const key = phoneKey(conversation.waId);
  const customer = key ? await Customer.findOne({ phoneKey: key }).select("name company").lean() : null;
  const now = new Date();

  return {
    conversation: {
      id: String(conversation._id),
      waId: conversation.waId,
      name: customer?.name ?? conversation.profileName ?? "",
      company: customer?.company ?? "",
      isCustomer: !!customer,
      needsHuman: !!conversation.needsHuman,
      windowOpen: isReplyWindowOpen(conversation.lastInboundAt, now),
      windowClosesAt: replyWindowClosesAt(conversation.lastInboundAt),
    },
    messages: page.map((m) => ({
      id: String(m._id),
      direction: m.direction,
      type: m.type ?? "text",
      text: m.text ?? "",
      status: m.status ?? "sent",
      error: m.error ?? null,
      source: m.source ?? "customer",
      sentByName: m.sentBy ? (senderName.get(String(m.sentBy)) ?? null) : null,
      timestamp: m.timestamp,
    })),
    hasMore,
  };
}

export async function markRead(id: string): Promise<void> {
  await WhatsappConversation.updateOne({ _id: id }, { $set: { unreadCount: 0 } });
}

/**
 * A staff member answers from the app. Free text is only allowed inside the
 * 24-hour window WhatsApp gives after the customer's last message; a person has
 * now taken over, so the bot is paused for a few hours.
 */
export async function sendReply(userId: string, id: string, rawText: string) {
  const text = rawText.trim();
  if (!text) throw ApiError.badRequest("Type a message first");
  if (text.length > MAX_TEXT_LENGTH) throw ApiError.badRequest(`Messages can be at most ${MAX_TEXT_LENGTH} characters`);

  const conversation = await WhatsappConversation.findById(id);
  if (!conversation) throw ApiError.notFound("Chat not found");
  if (!isReplyWindowOpen(conversation.lastInboundAt)) {
    throw ApiError.conflict("The 24-hour reply window has closed. The customer needs to message us first.");
  }

  const waMessageId = await sendWhatsAppText(conversation.waId, text);
  await recordOutbound({ waId: conversation.waId, waMessageId, text, source: "app", sentBy: userId });

  await WhatsappConversation.updateOne(
    { _id: conversation._id },
    { $set: { needsHuman: false, unreadCount: 0, botPausedUntil: new Date(Date.now() + BOT_PAUSE_MS) } },
  );
}

export async function getSummary(includeAlerts: boolean) {
  const [unreadChats, needsReply, openAlerts] = await Promise.all([
    WhatsappConversation.countDocuments({ unreadCount: { $gt: 0 } }),
    WhatsappConversation.countDocuments({ needsHuman: true }),
    includeAlerts
      ? WhatsappAlert.countDocuments({ acknowledgedAt: { $exists: false }, severity: { $ne: "info" } })
      : Promise.resolve(0),
  ]);
  return { unreadChats, needsReply, openAlerts };
}
