import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { detectIntent, type Intent } from "./whatsappIntent";

/**
 * Pure helpers for Meta's WhatsApp Cloud API webhook. Nothing in here touches
 * env, Redis or the network, so all of it is unit-testable; the wiring lives in
 * services/whatsappInbound.service.ts.
 */

/** Constant-time string comparison (for the verify token). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks Meta's `X-Hub-Signature-256` header ("sha256=<hex>") — an HMAC-SHA256
 * of the exact raw request body keyed with the app secret. Without this check
 * anyone who finds the URL could make our number message arbitrary people.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !header) return false;
  const [scheme, signature] = header.split("=");
  if (scheme !== "sha256" || !signature) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex"); // malformed hex -> short buffer -> length mismatch
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// ---------------------------------------------------------------------------
// Reading a webhook payload
// ---------------------------------------------------------------------------

export interface InboundMessage {
  /** WhatsApp message id (wamid...), unique per message. */
  id: string;
  /** The customer's WhatsApp id: digits only, with country code. */
  from: string;
  /** text, interactive, image, audio, button, reaction, ... */
  type: string;
  /** Which of our numbers received it. */
  phoneNumberId: string | undefined;
  /** Body of a text message. */
  text?: string;
  /** Id of the list row / button the customer tapped. */
  replyId?: string;
  /** Visible title of the row / button the customer tapped. */
  replyTitle?: string;
  /** The name on the customer's own WhatsApp profile. */
  profileName?: string;
  /** Unix seconds, as Meta sends it. */
  timestamp?: string;
}

export interface StatusEvent {
  /** Id of the message we sent. */
  id: string;
  status: string;
  /** The customer the message went to. */
  recipientId: string;
  timestamp?: string;
  /** Meta's reason when status is "failed". */
  error?: string;
}

export interface EchoMessage {
  id: string;
  /** The customer (the other party). */
  to: string;
  type: string;
  text?: string;
  timestamp?: string;
  phoneNumberId: string | undefined;
}

export interface WebhookChange {
  field: string;
  value: unknown;
  entryId?: string;
}

const textBody = z.object({ body: z.string() });
const reply = z.object({ id: z.string(), title: z.string().optional() });

const messageValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().optional() }).optional(),
  contacts: z
    .array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() }))
    .optional(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        from: z.string(),
        type: z.string(),
        timestamp: z.string().optional(),
        text: textBody.optional(),
        interactive: z.object({ list_reply: reply.optional(), button_reply: reply.optional() }).optional(),
      }),
    )
    .optional(),
  statuses: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        recipient_id: z.string(),
        timestamp: z.string().optional(),
        errors: z
          .array(
            z.object({
              code: z.union([z.string(), z.number()]).optional(),
              title: z.string().optional(),
              message: z.string().optional(),
              error_data: z.object({ details: z.string().optional() }).optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  message_echoes: z
    .array(
      z.object({
        id: z.string(),
        to: z.string(),
        type: z.string(),
        timestamp: z.string().optional(),
        text: textBody.optional(),
      }),
    )
    .optional(),
});

const envelopeSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z.array(z.object({ field: z.string(), value: z.unknown() })).default([]),
      }),
    )
    .default([]),
});

/** Every `{field, value}` change in the payload, untouched. Empty for anything that isn't a WhatsApp Business payload. */
export function extractChanges(body: unknown): WebhookChange[] {
  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success || parsed.data.object !== "whatsapp_business_account") return [];
  return parsed.data.entry.flatMap((entry) =>
    entry.changes.map((change) => ({ field: change.field, value: change.value, entryId: entry.id })),
  );
}

/** The `value` objects that carry messages / statuses / echoes, ignoring any that don't parse. */
function messageValues(body: unknown) {
  return extractChanges(body).flatMap((change) => {
    const parsed = messageValueSchema.safeParse(change.value);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Flattens a webhook payload into the customer messages it carries. Delivery
 * receipts (`statuses`), template updates and anything malformed come back as
 * an empty list.
 */
export function extractInboundMessages(body: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const value of messageValues(body)) {
    const names = new Map<string, string>();
    for (const contact of value.contacts ?? []) {
      if (contact.wa_id && contact.profile?.name) names.set(contact.wa_id, contact.profile.name);
    }

    for (const m of value.messages ?? []) {
      const picked = m.interactive?.list_reply ?? m.interactive?.button_reply;
      messages.push({
        id: m.id,
        from: m.from,
        type: m.type,
        phoneNumberId: value.metadata?.phone_number_id,
        text: m.text?.body,
        replyId: picked?.id,
        replyTitle: picked?.title,
        profileName: names.get(m.from),
        timestamp: m.timestamp,
      });
    }
  }
  return messages;
}

/** Delivery receipts (sent / delivered / read / failed) for messages we sent. */
export function extractStatuses(body: unknown): StatusEvent[] {
  const statuses: StatusEvent[] = [];
  for (const value of messageValues(body)) {
    for (const s of value.statuses ?? []) {
      const first = s.errors?.[0];
      const error = first ? [first.title ?? first.message, first.error_data?.details].filter(Boolean).join(": ") : undefined;
      statuses.push({
        id: s.id,
        status: s.status,
        recipientId: s.recipient_id,
        timestamp: s.timestamp,
        error: error || undefined,
      });
    }
  }
  return statuses;
}

/** Messages typed in the WhatsApp Business app on our own number (only when coexistence is switched on). */
export function extractEchoes(body: unknown): EchoMessage[] {
  const echoes: EchoMessage[] = [];
  for (const value of messageValues(body)) {
    for (const e of value.message_echoes ?? []) {
      echoes.push({
        id: e.id,
        to: e.to,
        type: e.type,
        text: e.text?.body,
        timestamp: e.timestamp,
        phoneNumberId: value.metadata?.phone_number_id,
      });
    }
  }
  return echoes;
}

// ---------------------------------------------------------------------------
// Deciding what the bot answers
// ---------------------------------------------------------------------------

/** Message types that are not a customer actually writing to us. */
const NON_CONVERSATIONAL_TYPES = new Set(["reaction", "system", "unsupported", "request_welcome"]);

export function isConversational(type: string): boolean {
  return !NON_CONVERSATIONAL_TYPES.has(type);
}

/** Meta can deliver the same message more than once; remember ids this long. */
export const DEDUPE_TTL_SECONDS = 24 * 60 * 60;
/**
 * Safety valve against loops (another bot, a stuck script): a customer can
 * trigger at most this many replies per window.
 */
export const RATE_LIMIT_MESSAGES = 30;
export const RATE_WINDOW_SECONDS = 60 * 60;
/**
 * Something we can't understand ("ok", "thanks", a photo) gets the options menu
 * at most once per this window, so casual chat isn't answered with a menu each time.
 */
export const UNKNOWN_COOLDOWN_SECONDS = 30 * 60;

export type InboundOutcome = "replied" | "ignored" | "duplicate" | "cooldown" | "paused" | "rate_limited" | "failed";

export interface InboundResult {
  id: string;
  outcome: InboundOutcome;
  intent?: Intent;
  error?: unknown;
}

export interface InboundDeps {
  /** Atomically takes `key` for `ttlSeconds`; resolves false if it is already taken. */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  release(key: string): Promise<void>;
  /** Atomically counts one hit against `key` for a window of `windowSeconds`; resolves the new count. */
  hit(key: string, windowSeconds: number): Promise<number>;
  /** True while a staff member is handling this customer's chat, so the bot should keep out of small talk. */
  isPaused(waId: string): Promise<boolean>;
  /** Sends the answer for `intent` to the customer. */
  reply(message: InboundMessage, intent: Intent): Promise<void>;
}

/**
 * Decides, per inbound message, what to answer. A Redis failure rejects the
 * whole call (fail closed: better silent than looping); a send failure only
 * marks that message `failed` and frees its keys so the customer's next
 * message can try again.
 */
export async function dispatchInbound(messages: InboundMessage[], deps: InboundDeps): Promise<InboundResult[]> {
  const results: InboundResult[] = [];

  for (const message of messages) {
    if (!isConversational(message.type)) {
      results.push({ id: message.id, outcome: "ignored" });
      continue;
    }

    const messageKey = `wa:in:msg:${message.id}`;
    if (!(await deps.claim(messageKey, DEDUPE_TTL_SECONDS))) {
      results.push({ id: message.id, outcome: "duplicate" });
      continue;
    }

    const hits = await deps.hit(`wa:in:rate:${message.from}`, RATE_WINDOW_SECONDS);
    if (hits > RATE_LIMIT_MESSAGES) {
      results.push({ id: message.id, outcome: "rate_limited" });
      continue;
    }

    const intent = detectIntent({ text: message.text, replyId: message.replyId });

    // A person is chatting with this customer: don't interrupt with the menu
    // for hellos and small talk. Explicit requests are still answered.
    if ((intent === "greeting" || intent === "unknown") && (await deps.isPaused(message.from))) {
      results.push({ id: message.id, outcome: "paused", intent });
      continue;
    }

    const claimed: string[] = [messageKey];
    if (intent === "unknown") {
      const unknownKey = `wa:in:unknown:${message.from}`;
      if (!(await deps.claim(unknownKey, UNKNOWN_COOLDOWN_SECONDS))) {
        results.push({ id: message.id, outcome: "cooldown", intent });
        continue;
      }
      claimed.push(unknownKey);
    }

    try {
      await deps.reply(message, intent);
      results.push({ id: message.id, outcome: "replied", intent });
    } catch (error) {
      await Promise.allSettled(claimed.map((key) => deps.release(key)));
      results.push({ id: message.id, outcome: "failed", intent, error });
    }
  }

  return results;
}
