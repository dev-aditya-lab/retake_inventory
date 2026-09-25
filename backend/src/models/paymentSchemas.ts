import { Schema, Types } from "mongoose";

// Payment tracking shared by GST invoices and non-GST bills. It is deliberately
// NOT part of the tax data: money arriving in parts never changes a tax invoice
// (the whole GST is due on the invoice itself — advances on goods carry no tax),
// so GSTR-1 / GSTR-3B and credit notes never read anything in here.

export const PAYMENT_METHODS = ["cash", "cheque", "upi", "bank_transfer"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

// payment — money received from the customer (an advance, a part-payment, or the rest).
// refund  — money given back (a cancelled or returned bill that had been paid).
export const PAYMENT_KINDS = ["payment", "refund"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const paymentEntrySchema = new Schema(
  {
    kind: { type: String, enum: PAYMENT_KINDS, default: "payment", required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    // When the money actually changed hands (can be earlier than when it was recorded).
    receivedAt: { type: Date, required: true },
    note: { type: String, default: "" },
    recordedBy: { type: Types.ObjectId, ref: "User" },
  },
  // Each entry gets its own _id (so one can be removed); recordedAt is when it was typed in.
  { timestamps: { createdAt: "recordedAt", updatedAt: false } },
);

/** Fields a bill carries to track what has been paid. Spread into the invoice and non-GST bill schemas. */
export const paymentFields = {
  payments: { type: [paymentEntrySchema], default: [] },
  // Net money in: payments minus refunds. Kept in step by the payment code (and only by it).
  amountPaid: { type: Number, default: 0 },
  // The day the balance is expected by (midnight India time). Optional.
  dueDate: { type: Date },
};
