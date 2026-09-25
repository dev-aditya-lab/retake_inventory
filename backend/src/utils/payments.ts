import { round2 } from "./gst";
import { ApiError } from "./ApiError";
import { istDayKey, parseIstDay } from "./istDate";
import { PAYMENT_METHODS, type PaymentKind, type PaymentMethodValue } from "../models/paymentSchemas";

// Everything about "how much of this bill has been paid" lives here, as pure
// functions shared by GST invoices and non-GST bills.
//
// The balance is never stored — it is always worked out:
//     payable  = bill total − credit notes (0 once the bill is cancelled)
//     balance  = payable − money received (payments − refunds)
// so it stays right when a bill is edited, returned or cancelled.

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Less than half a paisa is rounding noise, not money. */
const EPSILON = 0.005;
/** A sanity cap on entries per bill (a bill is settled in a handful of payments). */
export const MAX_PAYMENTS_PER_BILL = 100;

export type PaymentStatus =
  | "unpaid" // nothing received, something owed
  | "partial" // some received, some still owed
  | "paid" // nothing owed
  | "refund_due"; // the customer has paid more than is now payable (bill cancelled, returned, or cut down)

export interface PaymentEntryLike {
  kind: PaymentKind;
  amount: number;
}

/** Money in: payments minus refunds. */
export function netReceived(entries: readonly PaymentEntryLike[]): number {
  return round2(entries.reduce((sum, entry) => sum + (entry.kind === "refund" ? -entry.amount : entry.amount), 0));
}

/** The parts of a bill (either kind) the payment maths reads. */
export interface PayableLike {
  grandTotal: number;
  /** GST invoices only: value returned by credit notes. */
  creditedTotal?: number | null;
  status?: string | null;
  /** Net money received so far. */
  amountPaid?: number | null;
  /** Midnight India time of the day the balance is expected by. */
  dueDate?: Date | null;
}

/** What the customer owes for the bill at most: total less returns, nothing if cancelled. */
export function amountPayable(bill: PayableLike): number {
  if (bill.status === "void") return 0;
  return Math.max(0, round2(bill.grandTotal - (bill.creditedTotal ?? 0)));
}

export interface PaymentSummary {
  payable: number;
  amountPaid: number;
  /** Still to collect from the customer (0 or more). */
  balanceDue: number;
  /** Still to hand back to the customer (0 or more). */
  refundDue: number;
  paymentStatus: PaymentStatus;
  dueDate: Date | null;
  /** The due day has passed and money is still owed. */
  overdue: boolean;
}

export function summarizePayment(bill: PayableLike, now: Date = new Date()): PaymentSummary {
  const payable = amountPayable(bill);
  const amountPaid = round2(bill.amountPaid ?? 0);
  const balance = round2(payable - amountPaid);
  const balanceDue = balance > EPSILON ? balance : 0;
  const refundDue = balance < -EPSILON ? round2(-balance) : 0;
  const dueDate = bill.dueDate ?? null;

  const paymentStatus: PaymentStatus =
    balanceDue > 0 ? (amountPaid > EPSILON ? "partial" : "unpaid") : refundDue > 0 ? "refund_due" : "paid";

  // Overdue from the day AFTER the due date (dueDate is midnight at the start of the due day).
  const overdue = balanceDue > 0 && dueDate !== null && now.getTime() >= dueDate.getTime() + DAY_MS;

  return { payable, amountPaid, balanceDue, refundDue, paymentStatus, dueDate, overdue };
}

// ---------------------------------------------------------------------------
// Recording a payment
// ---------------------------------------------------------------------------

export interface NewPaymentInput {
  kind?: PaymentKind;
  amount: number;
  method: PaymentMethodValue;
  /** When the money changed hands; defaults to now. */
  receivedAt?: Date;
  note?: string;
}

export interface ValidatedPayment {
  kind: PaymentKind;
  amount: number;
  method: PaymentMethodValue;
  receivedAt: Date;
  note: string;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Checks a new entry against the bill and returns it cleaned up, or throws a
 * message a cashier can act on. Rules: no paying more than is due (record any
 * extra as a note instead), refunds only up to what's actually owed back, no
 * dates in the future, and payments can't be added to a cancelled bill.
 */
export function validateNewPayment(
  bill: PayableLike & { payments?: readonly unknown[] },
  input: NewPaymentInput,
  now: Date = new Date(),
): ValidatedPayment {
  const kind: PaymentKind = input.kind ?? "payment";
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw ApiError.badRequest("Enter an amount greater than zero");
  if (!PAYMENT_METHODS.includes(input.method)) throw ApiError.badRequest("Choose how it was paid");
  if ((bill.payments?.length ?? 0) >= MAX_PAYMENTS_PER_BILL) {
    throw ApiError.badRequest(`A bill can have at most ${MAX_PAYMENTS_PER_BILL} payment entries`);
  }

  const receivedAt = input.receivedAt ?? now;
  if (Number.isNaN(receivedAt.getTime())) throw ApiError.badRequest("That payment date isn't valid");
  // A minute of slack for clocks that differ slightly between phone and server.
  if (receivedAt.getTime() > now.getTime() + 60_000) throw ApiError.badRequest("The payment date can't be in the future");

  const summary = summarizePayment(bill, now);
  if (kind === "payment") {
    if (bill.status === "void") throw ApiError.badRequest("This bill was cancelled — it can't take a payment. Record a refund if money was paid.");
    if (summary.balanceDue <= 0) throw ApiError.badRequest("Nothing is due on this bill");
    if (amount > summary.balanceDue + EPSILON) {
      throw ApiError.badRequest(`Only ${rupees(summary.balanceDue)} is due on this bill — you can't record more than that`);
    }
  } else {
    if (summary.refundDue <= 0) throw ApiError.badRequest("There's nothing to refund on this bill — the customer hasn't paid more than they owe");
    if (amount > summary.refundDue + EPSILON) {
      throw ApiError.badRequest(`You can refund at most ${rupees(summary.refundDue)} on this bill`);
    }
  }

  return { kind, amount, method: input.method, receivedAt, note: input.note?.trim() ?? "" };
}

// ---------------------------------------------------------------------------
// The opening payment, made at the counter when the bill is created
// ---------------------------------------------------------------------------

export interface OpeningPaymentInput {
  /** The bill total. */
  total: number;
  /** Money handed over now. Left out = paid in full; 0 = all on credit. */
  amountReceived?: number | null;
  method?: PaymentMethodValue | null;
  /** "YYYY-MM-DD" the balance is expected by; only kept when something is left to pay. */
  dueDay?: string | null;
  userId: string;
  now?: Date;
}

export interface OpeningPayment {
  payments: (ValidatedPayment & { recordedBy: string })[];
  amountPaid: number;
  paymentMethod?: PaymentMethodValue;
  dueDate?: Date;
}

/**
 * What a new bill starts with: the payments array, running total and due date.
 * Paid in full (the default), an advance / part-payment, or nothing yet.
 */
export function buildOpeningPayment(input: OpeningPaymentInput): OpeningPayment {
  const now = input.now ?? new Date();
  const total = round2(input.total);
  const received = round2(input.amountReceived ?? total);

  if (!Number.isFinite(received) || received < 0) throw ApiError.badRequest("The amount received can't be negative");
  if (received > total + EPSILON) {
    throw ApiError.badRequest(`The amount received can't be more than the bill total (${rupees(total)})`);
  }
  if (received > 0 && !input.method) throw ApiError.badRequest("Choose how the money was paid");

  const balance = round2(total - received);
  let dueDate: Date | undefined;
  if (balance > EPSILON && input.dueDay) {
    const parsed = parseIstDay(input.dueDay);
    if (!parsed) throw ApiError.badRequest("That due date isn't a real date");
    if (input.dueDay < istDayKey(now)) throw ApiError.badRequest("The due date can't be in the past");
    dueDate = parsed;
  }

  const payments =
    received > 0
      ? [
          {
            kind: "payment" as const,
            amount: received,
            method: input.method!,
            receivedAt: now,
            note: balance > EPSILON ? "Advance / part-payment at billing" : "Paid at billing",
            recordedBy: input.userId,
          },
        ]
      : [];

  return { payments, amountPaid: received, paymentMethod: received > 0 ? input.method! : undefined, dueDate };
}

// ---------------------------------------------------------------------------
// Keeping a bill document in step
// ---------------------------------------------------------------------------

interface PaymentEntryDoc extends PaymentEntryLike {
  /** Present on saved entries (used to remove one). */
  _id?: unknown;
  method: string;
  receivedAt: Date;
}

/** The bits of a bill document that payment changes touch (both models fit this shape). */
export interface PaymentTracked extends PayableLike {
  amountPaid: number;
  paymentMethod?: string | null;
  payments: PaymentEntryDoc[];
}

/**
 * Re-derives what is stored alongside `payments`: the net amount received, and
 * `paymentMethod` — the method of the first payment, kept so exports and older
 * readers still have a single "how was it paid" value.
 */
export function syncPaymentTotals(bill: PaymentTracked): void {
  bill.amountPaid = netReceived(bill.payments);
  const first = [...bill.payments]
    .filter((entry) => entry.kind === "payment")
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())[0];
  bill.paymentMethod = first?.method ?? undefined;
}

// ---------------------------------------------------------------------------
// Database expressions (the same rules, for filtering and summing in MongoDB)
// ---------------------------------------------------------------------------

/** Far in the future, standing in for "no due date" inside comparisons. */
const NO_DUE_DATE = new Date("9999-12-31T00:00:00.000Z");
const RECEIVED = { $ifNull: ["$amountPaid", 0] };

/** amountPayable(), as an aggregation expression. */
export const PAYABLE_EXPR = {
  $cond: [
    { $eq: ["$status", "void"] },
    0,
    { $max: [0, { $subtract: ["$grandTotal", { $ifNull: ["$creditedTotal", 0] }] }] },
  ],
};

/** payable − received, rounded to paise: positive = customer owes, negative = we owe a refund. */
export const BALANCE_EXPR = { $round: [{ $subtract: [PAYABLE_EXPR, RECEIVED] }, 2] };

/** What the customer still owes (never negative) — sum this for "money to collect". */
export const BALANCE_DUE_EXPR = { $max: [0, BALANCE_EXPR] };

export const PAYMENT_FILTERS = ["due", "unpaid", "partial", "paid", "overdue", "refund_due"] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

/** "Overdue" as a condition: still owed, and the due day is over (see summarizePayment). */
export function overdueCondition(now: Date) {
  return {
    $and: [{ $gt: [BALANCE_EXPR, 0] }, { $lt: [{ $ifNull: ["$dueDate", NO_DUE_DATE] }, new Date(now.getTime() - DAY_MS)] }],
  };
}

/** A MongoDB filter for a payment status, to merge into a bill query. */
export function paymentFilterQuery(filter: PaymentFilter, now: Date = new Date()): Record<string, unknown> {
  switch (filter) {
    case "due":
      return { $expr: { $gt: [BALANCE_EXPR, 0] } };
    case "unpaid":
      return { $expr: { $and: [{ $gt: [BALANCE_EXPR, 0] }, { $lte: [RECEIVED, 0] }] } };
    case "partial":
      return { $expr: { $and: [{ $gt: [BALANCE_EXPR, 0] }, { $gt: [RECEIVED, 0] }] } };
    case "paid":
      return { $expr: { $and: [{ $eq: [BALANCE_EXPR, 0] }, { $ne: ["$status", "void"] }] } };
    case "overdue":
      return { $expr: overdueCondition(now) };
    case "refund_due":
      return { $expr: { $lt: [BALANCE_EXPR, 0] } };
  }
}
