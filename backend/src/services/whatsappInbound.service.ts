import { company } from "../config/company";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { redis } from "../config/redis";
import { MENU_OPTIONS, type Intent } from "../utils/whatsappIntent";
import {
  buildAddressText,
  buildContactText,
  buildInvoicesText,
  buildMenuBody,
  buildPaymentText,
  buildPendingText,
  NO_BILLS_TEXT,
  NOTHING_PENDING_TEXT,
} from "../utils/whatsappReplies";
import {
  dispatchInbound,
  extractInboundMessages,
  type InboundDeps,
  type InboundMessage,
} from "../utils/whatsappWebhook";
import { findCustomerName, findLastHandlingStaff, loadBills } from "./whatsappCustomer.service";
import {
  sendWhatsAppContacts,
  sendWhatsAppMenu,
  sendWhatsAppText,
  type WhatsAppContact,
} from "./whatsapp.service";

/** How many bills the "My invoices" answer lists. */
const INVOICES_SHOWN = 5;
/** Upper bound on bills read when adding up what a customer owes. */
const PENDING_SCAN_LIMIT = 50;

async function sendMenu(to: string, intent: Intent, customerName: string | undefined): Promise<void> {
  await sendWhatsAppMenu(to, {
    header: company.name,
    body: buildMenuBody({
      customerName,
      companyName: company.name,
      tagline: company.tagline,
      unknown: intent === "unknown",
    }),
    button: "View options",
    sectionTitle: "How can we help?",
    rows: MENU_OPTIONS.map(({ id, title, description }) => ({ id, title, description })),
  });
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

    case "invoices": {
      // One extra row tells us whether there are more than we show.
      const bills = await loadBills(to, { limit: INVOICES_SHOWN + 1 });
      if (bills.length === 0) {
        await sendWhatsAppText(to, NO_BILLS_TEXT);
        return sendWhatsAppContacts(to, defaultContacts(), company.legalName);
      }
      const shown = bills.slice(0, INVOICES_SHOWN);
      return sendWhatsAppText(
        to,
        buildInvoicesText(shown, {
          links: company.whatsappBot.includeInvoiceLinks,
          baseUrl: env.CLIENT_URL,
          hasMore: bills.length > INVOICES_SHOWN,
        }),
      );
    }

    case "pending": {
      const due = await loadBills(to, { onlyDue: true, limit: PENDING_SCAN_LIMIT });
      return sendWhatsAppText(to, due.length > 0 ? buildPendingText(due) : NOTHING_PENDING_TEXT);
    }

    case "payment": {
      const due = await loadBills(to, { onlyDue: true, limit: PENDING_SCAN_LIMIT });
      const dueTotal = due.reduce((sum, bill) => sum + bill.payment.balanceDue, 0);
      return sendWhatsAppText(to, buildPaymentText(company.payment, Math.round(dueTotal * 100) / 100));
    }

    case "contact": {
      const bills = await loadBills(to, { limit: 1 });
      const staff = await findLastHandlingStaff(bills);
      if (staff) {
        await sendWhatsAppText(to, buildContactText(staff.name, bills[0]?.number));
        return sendWhatsAppContacts(to, [{ name: staff.name, phone: staff.phone }], company.legalName);
      }
      // Customer has no bill (or the staff member can't be shared): our main number.
      await sendWhatsAppText(to, buildContactText(null));
      return sendWhatsAppContacts(to, defaultContacts(), company.legalName);
    }

    case "address":
      return sendWhatsAppText(
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
  async reply(message, intent) {
    try {
      await answer(message, intent);
    } catch (err) {
      // A lookup problem on our side shouldn't leave the customer in silence.
      logger.error({ err, messageId: message.id, intent }, "WhatsApp answer failed; sending fallback");
      await sendWhatsAppText(
        message.from,
        `Sorry, we couldn't get that for you right now. Please try again in a few minutes or call us on ${company.contactNumber}.`,
      );
    }
  },
};

/**
 * Handles a verified webhook payload: answers customers who message our
 * WhatsApp number. Runs after the HTTP response has been sent, so it logs
 * rather than throws for per-message problems.
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
      logger.info({ messageId: result.id, outcome: result.outcome, intent: result.intent }, "WhatsApp inbound handled");
    }
  }
}
