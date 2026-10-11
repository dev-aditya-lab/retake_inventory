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
}

const payloadSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z.object({ phone_number_id: z.string().optional() }).optional(),
                messages: z
                  .array(
                    z.object({
                      id: z.string(),
                      from: z.string(),
                      type: z.string(),
                      text: z.object({ body: z.string() }).optional(),
                      interactive: z
                        .object({
                          list_reply: z.object({ id: z.string() }).optional(),
                          button_reply: z.object({ id: z.string() }).optional(),
                        })
                        .optional(),
                    }),
                  )
                  .optional(),
              }),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

/**
 * Flattens a webhook payload into the customer messages it carries. Delivery
 * receipts (`statuses`), template updates and anything malformed come back as
 * an empty list.
 */
export function extractInboundMessages(body: unknown): InboundMessage[] {
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success || parsed.data.object !== "whatsapp_business_account") return [];

  const messages: InboundMessage[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      for (const m of change.value.messages ?? []) {
        messages.push({
          id: m.id,
          from: m.from,
          type: m.type,
          phoneNumberId: change.value.metadata?.phone_number_id,
          text: m.text?.body,
          replyId: m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id,
        });
      }
    }
  }
  return messages;
}

/** Message types that are not a customer actually writing to us. */
const NON_CONVERSATIONAL_TYPES = new Set(["reaction", "system", "unsupported", "request_welcome"]);

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

export type InboundOutcome = "replied" | "ignored" | "duplicate" | "cooldown" | "rate_limited" | "failed";

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
    if (NON_CONVERSATIONAL_TYPES.has(message.type)) {
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
