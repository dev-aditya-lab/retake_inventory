import { redis } from "../config/redis";
import { Invoice } from "../models/Invoice.model";
import { CreditNote } from "../models/CreditNote.model";
import { NonGstBill } from "../models/NonGstBill.model";
import { dateKeyIST } from "../utils/istDate";
import { documentSequence, formatDocumentNumber, isGstValidDocumentNumber } from "../utils/invoiceNumber";
import { escapeRegex } from "../utils/regex";

export type DocumentKind = "invoice" | "credit-note" | "non-gst-bill";

// Spans a full day plus buffer past midnight rollover.
const SEQUENCE_TTL_SECONDS = 60 * 60 * 48;

// "v2" keeps these counters apart from the old RTK-INV-… ones. The non-GST
// series has a counter of its own, so it can never move a GST number.
const COUNTER_KEY: Record<DocumentKind, (dateKey: string) => string> = {
  invoice: (dateKey) => `invoice:seq:v2:${dateKey}`,
  "credit-note": (dateKey) => `creditnote:seq:${dateKey}`,
  "non-gst-bill": (dateKey) => `nongstbill:seq:${dateKey}`,
};

async function highestIssued(kind: DocumentKind, series: string): Promise<number> {
  const pattern = new RegExp(`^${escapeRegex(series)}\\d+$`);
  let latest: string | undefined;
  if (kind === "invoice") {
    latest = (await Invoice.findOne({ invoiceNumber: pattern }).sort({ invoiceNumber: -1 }).select("invoiceNumber"))?.invoiceNumber;
  } else if (kind === "credit-note") {
    latest = (await CreditNote.findOne({ noteNumber: pattern }).sort({ noteNumber: -1 }).select("noteNumber"))?.noteNumber;
  } else {
    latest = (await NonGstBill.findOne({ billNumber: pattern }).sort({ billNumber: -1 }).select("billNumber"))?.billNumber;
  }
  return latest ? documentSequence(latest) : 0;
}

/**
 * Atomically issues the next {prefix}-YYMMDD-NNNN number for today (India
 * date). If the counter is fresh — the day's first document, or Redis lost
 * the key — it resumes after the highest number already saved, so a Redis
 * restart can never hand out a number twice.
 */
export async function nextDocumentNumber(kind: DocumentKind, prefix: string, now = new Date()): Promise<string> {
  const dateKey = dateKeyIST(now);
  const key = COUNTER_KEY[kind](dateKey);

  let seq = await redis.incr(key);
  if (seq === 1) {
    const highest = await highestIssued(kind, `${prefix}-${dateKey}-`);
    if (highest > 0) seq = await redis.incrby(key, highest);
  }
  await redis.expire(key, SEQUENCE_TTL_SECONDS);

  const number = formatDocumentNumber(prefix, dateKey, seq);
  // The 16-character cap is a GST rule; non-GST bills aren't reported to the portal.
  if (kind !== "non-gst-bill" && !isGstValidDocumentNumber(number)) {
    throw new Error(`Document number ${number} is longer than GST's 16-character limit — shorten the prefix in config/company.ts`);
  }
  return number;
}
