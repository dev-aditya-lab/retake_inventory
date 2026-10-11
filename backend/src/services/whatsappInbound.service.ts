import { company } from "../config/company";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { redis } from "../config/redis";
import { detectIntent, MENU_OPTIONS, type Intent } from "../utils/whatsappIntent";
import {
  buildAddressText,
  buildContactText,
  buildInvoicesText,
  buildMenuBody,
  buildPaymentText,
  buildPendingText,
  HUMAN_REQUESTED_TEXT,
  NO_BILLS_TEXT,
  NOTHING_PENDING_TEXT,
} from "../utils/whatsappReplies";
import {
  dispatchInbound,
  extractChanges,
  extractEchoes,
  extractInboundMessages,
  extractStatuses,
  isConversational,
  type InboundDeps,
  type InboundMessage,
} from "../utils/whatsappWebhook";
import { isBotPausedFor, recordEcho, recordInbound, recordOutbound, recordStatus } from "./whatsappChat.service";
import { findCustomerName, findLastHandlingStaff, loadBills } from "./whatsappCustomer.service";
import { recordChange } from "./whatsappHealth.service";
import { sendWhatsAppContacts, sendWhatsAppMenu, sendWhatsAppText, type WhatsAppContact } from "./whatsapp.service";

/** How many bills the "My invoices" answer lists. */
const INVOICES_SHOWN = 5;
/** Upper bound on bills read when adding up what a customer owes. */
const PENDING_SCAN_LIMIT = 50;

/** Webhook fields that carry chat traffic, handled by the chat store rather than the health log. */
const CHAT_FIELDS = new Set(["messages", "message_echoes", "smb_message_echoes"]);

// ---------------------------------------------------------------------------
// Bot answers (each one is also written to the chat thread, so staff can see what the customer was told)
// ---------------------------------------------------------------------------

async function remember(to: string, waMessageId: string | undefined, text: string, type = "text"): Promise<void> {
  try {
    await recordOutbound({ waId: to, waMessageId, text, source: "bot", type });
  } catch (err) {
    // The customer already has the message; a thread-history hiccup must not turn that into a failure.
    logger.error({ err }, "Could not record a bot message in the chat thread");
  }
}

async function say(to: string, text: string): Promise<void> {
  await remember(to, await sendWhatsAppText(to, text), text);
}

async function sayContacts(to: string, contacts: WhatsAppContact[]): Promise<void> {
  const id = await sendWhatsAppContacts(to, contacts, company.legalName);
  await remember(to, id, `[Contact card: ${contacts.map((c) => c.name).join(", ")}]`, "contacts");
}

async function sendMenu(to: string, intent: Intent, customerName: string | undefined): Promise<void> {
  const body = buildMenuBody({
    customerName,
    companyName: company.name,
    tagline: company.tagline,
    unknown: intent === "unknown",
  });
  const id = await sendWhatsAppMenu(to, {
    header: company.name,
    body,
    button: "View options",
    sectionTitle: "How can we help?",
    rows: MENU_OPTIONS.map(({ id: rowId, title, description }) => ({ id: rowId, title, description })),
  });
  await remember(to, id, `${body}\n[Options menu sent]`, "interactive");
}

/** Our default contact card(s), used when no staff member can be tied to the customer. */
function defaultContacts(): WhatsAppContact[] {
  return company.whatsappContacts.map((contact) => ({ ...contact }));
}

async function answer(message: InboundMessage, intent: Intent): Promise<void> {
  const to = message.from;

  switch (intent) {
    case "greeting":
    case "menu":
    case "unknown":
      return sendMenu(to, intent, await findCustomerName(to));

    case "human":
      // Already flagged for the team when the message was stored.
      return say(to, HUMAN_REQUESTED_TEXT);

    case "invoices": {
      // One extra row tells us whether there are more than we show.
      const bills = await loadBills(to, { limit: INVOICES_SHOWN + 1 });
      if (bills.length === 0) {
        await say(to, NO_BILLS_TEXT);
        return sayContacts(to, defaultContacts());
      }
      return say(
        to,
        buildInvoicesText(bills.slice(0, INVOICES_SHOWN), {
          links: company.whatsappBot.includeInvoiceLinks,
          baseUrl: env.CLIENT_URL,
          hasMore: bills.length > INVOICES_SHOWN,
        }),
      );
    }

    case "pending": {
      const due = await loadBills(to, { onlyDue: true, limit: PENDING_SCAN_LIMIT });
      return say(to, due.length > 0 ? buildPendingText(due) : NOTHING_PENDING_TEXT);
    }

    case "payment": {
      const due = await loadBills(to, { onlyDue: true, limit: PENDING_SCAN_LIMIT });
      const dueTotal = due.reduce((sum, bill) => sum + bill.payment.balanceDue, 0);
      return say(to, buildPaymentText(company.payment, Math.round(dueTotal * 100) / 100));
    }

    case "contact": {
      const bills = await loadBills(to, { limit: 1 });
      const staff = await findLastHandlingStaff(bills);
      if (staff) {
        await say(to, buildContactText(staff.name, bills[0]?.number));
        return sayContacts(to, [{ name: staff.name, phone: staff.phone }]);
      }
      // Customer has no bill (or the staff member can't be shared): our main number.
      await say(to, buildContactText(null));
      return sayContacts(to, defaultContacts());
    }

    case "address":
      return say(
        to,
        buildAddressText({
          legalName: company.legalName,
          address: company.address,
          pincode: company.pincode,
          contactNumber: company.contactNumber,
        }),
      );
  }
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
  async hit(key, windowSeconds) {
    // INCR + EXPIRE in one script so a crash between them can't leave a counter
    // with no expiry (which would block that customer for good).
    const count = await redis.eval(
      "local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return n",
      1,
      key,
      windowSeconds,
    );
    return Number(count);
  },
  isPaused: isBotPausedFor,
  async reply(message, intent) {
    try {
      await answer(message, intent);
    } catch (err) {
      // A lookup problem on our side shouldn't leave the customer in silence.
      logger.error({ err, messageId: message.id, intent }, "WhatsApp answer failed; sending fallback");
      await say(
        message.from,
        `Sorry, we couldn't get that for you right now. Please try again in a few minutes or call us on ${company.contactNumber}.`,
      );
    }
  },
};

// ---------------------------------------------------------------------------
// The two stages of handling a verified webhook
// ---------------------------------------------------------------------------

/**
 * Stage 1, run before Meta is answered: store everything the webhook carries
 * (messages, delivery receipts, echoes, account events). Rejects if storage
 * fails, so the controller answers 5xx and Meta redelivers; every write is
 * idempotent, so redelivery is safe.
 *
 * Resolves the customer messages that are new, for the bot to answer.
 */
export async function ingestWebhook(body: unknown): Promise<InboundMessage[]> {
  // Chat only works for the number configured in env; a message to another
  // number on the same Meta app would be filed (and answered) from the wrong sender.
  const ownNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const all = extractInboundMessages(body);
  const ours = all.filter((m) => ownNumberId !== undefined && m.phoneNumberId === ownNumberId);
  if (ours.length !== all.length) {
    const foreign = [...new Set(all.filter((m) => !ours.includes(m)).map((m) => m.phoneNumberId ?? "unknown"))];
    logger.warn({ foreign }, "WhatsApp webhook: ignoring messages sent to a different phone number id");
  }

  const fresh: InboundMessage[] = [];
  for (const message of ours) {
    if (!isConversational(message.type)) continue;
    const intent = detectIntent({ text: message.text, replyId: message.replyId });
    // Free text we can't answer, or an explicit request for a person: the team should look.
    const isNew = await recordInbound(message, { needsHuman: intent === "unknown" || intent === "human" });
    if (isNew) fresh.push(message);
  }

  for (const status of extractStatuses(body)) {
    await recordStatus(status);
  }

  for (const echo of extractEchoes(body)) {
    if (ownNumberId !== undefined && echo.phoneNumberId === ownNumberId) await recordEcho(echo);
  }

  for (const change of extractChanges(body)) {
    if (!CHAT_FIELDS.has(change.field)) await recordChange(change.field, change.value, change.entryId);
  }

  return fresh;
}

/**
 * Stage 2, run after Meta has been answered: send the automatic replies.
 * Logs rather than throws for per-message problems.
 */
export async function answerInbound(messages: InboundMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const results = await dispatchInbound(messages, deps);
  for (const result of results) {
    if (result.outcome === "failed") {
      logger.error({ err: result.error, messageId: result.id }, "WhatsApp auto-reply failed");
    } else {
      logger.info({ messageId: result.id, outcome: result.outcome, intent: result.intent }, "WhatsApp inbound handled");
    }
  }
}
