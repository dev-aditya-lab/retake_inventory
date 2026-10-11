import { company } from "../config/company";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { redis } from "../config/redis";
import { dispatchInbound, extractInboundMessages, type InboundDeps } from "../utils/whatsappWebhook";
import { sendWhatsAppContacts, sendWhatsAppText } from "./whatsapp.service";

function buildGreeting(): string {
  return [
    `Hello, and thank you for contacting ${company.name}!`,
    company.tagline,
    "",
    "Our contact details are below. Tap a card to save the number or message us.",
    "",
    `Address: ${company.address}`,
    `Website: ${company.website}`,
  ].join("\n");
}

const deps: InboundDeps = {
  async claim(key, ttlSeconds) {
    // SET NX EX is one atomic command: two webhook deliveries racing for the
    // same key can't both win.
    return (await redis.set(key, "1", "EX", ttlSeconds, "NX")) === "OK";
  },
  async release(key) {
    await redis.del(key);
  },
  async reply(to) {
    await sendWhatsAppText(to, buildGreeting());
    await sendWhatsAppContacts(to, company.whatsappContacts, company.legalName);
  },
};

/**
 * Handles a verified webhook payload: when a customer messages our WhatsApp
 * number, reply with the company's contact cards. Runs after the HTTP response
 * has been sent, so it logs rather than throws for per-message problems.
 */
export async function processWhatsAppWebhook(body: unknown): Promise<void> {
  const all = extractInboundMessages(body);
  if (all.length === 0) return; // delivery receipts, template updates, etc.

  // We can only answer from the number configured in env; a message to another
  // number on the same Meta app would be answered from the wrong sender.
  const ownNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const ours = all.filter((m) => ownNumberId !== undefined && m.phoneNumberId === ownNumberId);
  if (ours.length !== all.length) {
    const foreign = [...new Set(all.filter((m) => !ours.includes(m)).map((m) => m.phoneNumberId ?? "unknown"))];
    logger.warn({ foreign }, "WhatsApp webhook: ignoring messages sent to a different phone number id");
  }

  const results = await dispatchInbound(ours, deps);
  for (const result of results) {
    if (result.outcome === "failed") {
      logger.error({ err: result.error, messageId: result.id }, "WhatsApp auto-reply failed");
    } else {
      logger.info({ messageId: result.id, outcome: result.outcome }, "WhatsApp inbound handled");
    }
  }
}
