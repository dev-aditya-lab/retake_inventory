import type { MessageStatus } from "../models/WhatsappMessage.model";
import type { InboundMessage } from "./whatsappWebhook";

/**
 * Pure rules for the in-app chat. Nothing here touches the database.
 */

/** WhatsApp lets a business send free-text only within 24h of the customer's last message. */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** After a staff reply the bot stays quiet (for greetings / small talk) this long. */
export const BOT_PAUSE_MS = 4 * 60 * 60 * 1000;
/** WhatsApp's own limit on a text message body. */
export const MAX_TEXT_LENGTH = 4096;

export function replyWindowClosesAt(lastInboundAt: Date | null | undefined): Date | null {
  return lastInboundAt ? new Date(lastInboundAt.getTime() + REPLY_WINDOW_MS) : null;
}

export function isReplyWindowOpen(lastInboundAt: Date | null | undefined, now: Date = new Date()): boolean {
  const closes = replyWindowClosesAt(lastInboundAt);
  return closes !== null && now.getTime() < closes.getTime();
}

export function isBotPaused(botPausedUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return !!botPausedUntil && botPausedUntil.getTime() > now.getTime();
}

/** The delivery states Meta reports on our outgoing messages. */
export const REPORTED_STATUSES = ["sent", "delivered", "read", "failed"] as const;
export type ReportedStatus = (typeof REPORTED_STATUSES)[number];

export function isReportedStatus(value: string): value is ReportedStatus {
  return (REPORTED_STATUSES as readonly string[]).includes(value);
}

/**
 * Receipts can arrive out of order ("read" before "delivered"), so a status only
 * overwrites one that is further back. Returns the current statuses `incoming`
 * is allowed to replace.
 */
export function statusesItMayReplace(incoming: ReportedStatus): MessageStatus[] {
  switch (incoming) {
    case "sent":
      return [];
    case "delivered":
      return ["sent"];
    case "read":
      return ["sent", "delivered"];
    case "failed":
      return ["sent"];
  }
}

export function previewOf(value: string, max = 80): string {
  const single = value.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

const PLACEHOLDERS: Record<string, string> = {
  image: "[Photo]",
  video: "[Video]",
  audio: "[Voice note]",
  voice: "[Voice note]",
  document: "[Document]",
  sticker: "[Sticker]",
  location: "[Location]",
  contacts: "[Contact card]",
  order: "[Order]",
};

/** What to store and show for an incoming message: its text, or a placeholder for what the app can't show yet. */
export function describeInbound(message: Pick<InboundMessage, "type" | "text" | "replyTitle">): string {
  if (message.text) return message.text;
  if (message.replyTitle) return `Chose: ${message.replyTitle}`;
  return PLACEHOLDERS[message.type] ?? `[${message.type} message]`;
}

/** Unix seconds (as Meta sends them, a string) to a Date, falling back to `now`. */
export function fromUnixSeconds(value: string | undefined, now: Date = new Date()): Date {
  const seconds = value ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : now;
}
