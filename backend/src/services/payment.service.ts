import mongoose, { type ClientSession, type PipelineStage } from "mongoose";
import { logger } from "../config/logger";
import { Invoice } from "../models/Invoice.model";
import { NonGstBill } from "../models/NonGstBill.model";
import type { PaymentMethodValue } from "../models/paymentSchemas";
import { ApiError } from "../utils/ApiError";
import { round2 } from "../utils/gst";
import { istDayKey, parseIstDay } from "../utils/istDate";
import {
  BALANCE_DUE_EXPR,
  overdueCondition,
  summarizePayment,
  syncPaymentTotals,
  validateNewPayment,
  type NewPaymentInput,
  type PaymentTracked,
} from "../utils/payments";

// Recording money against a bill — the same rules for GST invoices and non-GST
// bills, each kept in its own collection. Nothing here reads or writes tax data.

/** A bill document (either kind) as the payment code sees it. */
interface PayableDoc extends PaymentTracked {
  billingDate: Date;
  payments: PaymentTracked["payments"] & {
    push(...items: unknown[]): number;
    pull(...ids: unknown[]): unknown;
  };
  set(path: string, value: unknown): unknown;
  save(options?: { session?: ClientSession }): Promise<unknown>;
}

interface BillStore {
  /** What to call a missing bill, e.g. `invoice "RTK-…"`. */
  describe(number: string): string;
  find(number: string, session?: ClientSession): Promise<PayableDoc | null>;
}

const invoiceStore: BillStore = {
  describe: (number) => `invoice "${number}"`,
  find: async (number, session) => {
    const query = Invoice.findOne({ invoiceNumber: number });
    return (session ? await query.session(session) : await query) as unknown as PayableDoc | null;
  },
};

const nonGstStore: BillStore = {
  describe: (number) => `bill "${number}"`,
  find: async (number, session) => {
    const query = NonGstBill.findOne({ billNumber: number });
    return (session ? await query.session(session) : await query) as unknown as PayableDoc | null;
  },
};

export interface RecordPaymentInput extends Omit<NewPaymentInput, "receivedAt"> {
  receivedAt?: Date;
}

/** Runs `change` on the bill inside a transaction, so two staff recording at once can't overpay it. */
async function changeBill(store: BillStore, number: string, change: (bill: PayableDoc) => void): Promise<void> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const bill = await store.find(number, session);
      if (!bill) throw ApiError.notFound(`No ${store.describe(number)} found`);
      change(bill);
      await bill.save({ session });
    });
  } finally {
    await session.endSession();
  }
}

function makePaymentOps(store: BillStore) {
  return {
    /** Adds a payment (advance, part-payment, the rest) or a refund. */
    async record(number: string, userId: string, input: RecordPaymentInput): Promise<void> {
      await changeBill(store, number, (bill) => {
        const entry = validateNewPayment(bill, input);
        bill.payments.push({ ...entry, recordedBy: userId });
        syncPaymentTotals(bill);
      });
    },

    /** Removes an entry typed in by mistake. The record's totals are recalculated. */
    async remove(number: string, paymentId: string): Promise<void> {
      await changeBill(store, number, (bill) => {
        const entry = bill.payments.find((payment) => String(payment._id) === paymentId);
        if (!entry) throw ApiError.notFound("That payment entry wasn't found");
        bill.payments.pull(entry._id);
        syncPaymentTotals(bill);
      });
    },

    /** Sets (or, with null, clears) the day the balance is expected by. */
    async setDueDate(number: string, day: string | null): Promise<void> {
      await changeBill(store, number, (bill) => {
        if (day === null) {
          bill.set("dueDate", undefined);
          return;
        }
        const due = parseIstDay(day);
        if (!due) throw ApiError.badRequest("That due date isn't a real date");
        if (bill.status === "void") throw ApiError.badRequest("A cancelled bill has nothing to pay, so it has no due date");
        if (day < istDayKey(bill.billingDate)) throw ApiError.badRequest("The due date can't be before the bill's date");
        bill.set("dueDate", due);
      });
    },
  };
}

export const invoicePayments = makePaymentOps(invoiceStore);
export const nonGstPayments = makePaymentOps(nonGstStore);

// ---------------------------------------------------------------------------
// Money still to collect
// ---------------------------------------------------------------------------

export interface DueSummary {
  dueAmount: number;
  dueCount: number;
  overdueAmount: number;
  overdueCount: number;
}

interface AggregatableModel {
  aggregate<R>(pipeline: PipelineStage[]): PromiseLike<R[]>;
}

/**
 * How much is still owed across the bills matching `match` (cancelled bills
 * never count), and how much of it is past its due date.
 */
export async function dueSummary(model: AggregatableModel, match: Record<string, unknown> = {}, now = new Date()): Promise<DueSummary> {
  const overdue = overdueCondition(now);
  const [row] = await model.aggregate<{ dueAmount: number; dueCount: number; overdueAmount: number; overdueCount: number }>([
    { $match: { ...match, status: { $ne: "void" } } },
    { $addFields: { _balanceDue: BALANCE_DUE_EXPR } },
    { $match: { _balanceDue: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        dueAmount: { $sum: "$_balanceDue" },
        dueCount: { $sum: 1 },
        overdueAmount: { $sum: { $cond: [overdue, "$_balanceDue", 0] } },
        overdueCount: { $sum: { $cond: [overdue, 1, 0] } },
      },
    },
  ]);
  return {
    dueAmount: round2(row?.dueAmount ?? 0),
    dueCount: row?.dueCount ?? 0,
    overdueAmount: round2(row?.overdueAmount ?? 0),
    overdueCount: row?.overdueCount ?? 0,
  };
}

/** What every bill response carries so screens never redo the maths. */
export function paymentSummaryOf(bill: Parameters<typeof summarizePayment>[0]) {
  return summarizePayment(bill);
}

// ---------------------------------------------------------------------------
// One-time backfill (see migrations): bills made before payments were tracked
// were all paid in full at the counter.
// ---------------------------------------------------------------------------

interface LegacyBill {
  _id: unknown;
  grandTotal: number;
  creditedTotal?: number | null;
  status?: string | null;
  paymentMethod?: string | null;
  billingDate: Date;
  updatedAt?: Date;
}

async function backfill(model: {
  find(filter: Record<string, unknown>): { lean(): { cursor(): AsyncIterable<LegacyBill> } };
  bulkWrite(ops: unknown[]): Promise<unknown>;
}): Promise<number> {
  let count = 0;
  let batch: unknown[] = [];
  const flush = async () => {
    if (batch.length > 0) await model.bulkWrite(batch);
    batch = [];
  };

  for await (const bill of model.find({ payments: { $exists: false } }).lean().cursor()) {
    const method = (bill.paymentMethod as PaymentMethodValue | null) ?? "cash";
    const payments: Record<string, unknown>[] = [];
    // A cancelled bill never collected money (the old system had no notion of a refund).
    if (bill.status !== "void") {
      payments.push({ kind: "payment", amount: bill.grandTotal, method, receivedAt: bill.billingDate, note: "Paid at billing (before payment tracking)" });
      // Goods returned on a credit note went back with their money.
      if ((bill.creditedTotal ?? 0) > 0) {
        payments.push({ kind: "refund", amount: bill.creditedTotal, method, receivedAt: bill.updatedAt ?? bill.billingDate, note: "Returned goods (credit note)" });
      }
    }
    const amountPaid = round2(payments.reduce((sum, p) => sum + (p.kind === "refund" ? -(p.amount as number) : (p.amount as number)), 0));
    batch.push({ updateOne: { filter: { _id: bill._id }, update: { $set: { payments, amountPaid } } } });
    count++;
    if (batch.length >= 500) await flush();
  }
  await flush();
  return count;
}

export async function backfillPayments(): Promise<number> {
  const invoices = await backfill(Invoice as unknown as Parameters<typeof backfill>[0]);
  const bills = await backfill(NonGstBill as unknown as Parameters<typeof backfill>[0]);
  logger.info(`Payment backfill: ${invoices} invoice(s) and ${bills} non-GST bill(s) marked as paid in full at billing`);
  return invoices + bills;
}
