import type { PaymentMethod } from "./cart";

/**
 * unpaid = nothing received; partial = an advance/part-payment received, the rest owing;
 * paid = nothing owing; refund_due = the customer has paid more than is now payable
 * (bill cancelled, returned or cut down) and money should be handed back.
 */
export type PaymentStatus = "unpaid" | "partial" | "paid" | "refund_due";

/** Filters for a bills list. "due" = anything still owing. */
export type PaymentFilter = "due" | "overdue" | "unpaid" | "partial" | "paid" | "refund_due";

/** Worked out by the server for every bill — screens never redo the maths. */
export interface PaymentSummary {
  /** Bill total less credit notes; 0 once cancelled. */
  payable: number;
  /** Net money received (payments minus refunds). */
  amountPaid: number;
  /** Still to collect. */
  balanceDue: number;
  /** Still to hand back to the customer. */
  refundDue: number;
  paymentStatus: PaymentStatus;
  /** ISO instant of midnight (India) on the due day. */
  dueDate: string | null;
  /** The due day has passed and money is still owing. */
  overdue: boolean;
}

export interface PaymentEntry {
  _id: string;
  kind: "payment" | "refund";
  amount: number;
  method: PaymentMethod;
  receivedAt: string;
  note?: string;
}

/** Money still to collect across a set of bills. */
export interface DueSummary {
  dueAmount: number;
  dueCount: number;
  overdueAmount: number;
  overdueCount: number;
}

export const PAYMENT_FILTER_OPTIONS: { value: PaymentFilter | ""; label: string }[] = [
  { value: "", label: "Any payment" },
  { value: "due", label: "Money due" },
  { value: "overdue", label: "Overdue" },
  { value: "unpaid", label: "Nothing paid" },
  { value: "partial", label: "Part paid" },
  { value: "paid", label: "Fully paid" },
  { value: "refund_due", label: "Refund due" },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  cheque: "Cheque",
  upi: "UPI",
  bank_transfer: "Bank transfer",
};
