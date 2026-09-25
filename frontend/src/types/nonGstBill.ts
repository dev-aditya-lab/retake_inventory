import type { InvoiceCustomer } from "./invoice";
import type { PaymentEntry, PaymentSummary } from "./payment";

/** paid = a normal sale; void = cancelled (stock returned, kept on record). */
export type NonGstBillStatus = "paid" | "void";

/** Which price list the bill was made at. No tax is added either way. */
export type PriceList = "b2b" | "retail";

export interface NonGstBillItem {
  product: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** A bill with no GST — its own collection, number series and section. Never part of any GST return. */
export interface NonGstBill {
  _id: string;
  billNumber: string;
  billingDate: string;
  /** No GSTIN — a non-GST bill isn't a tax document. */
  customer: Omit<InvoiceCustomer, "gstin">;
  priceList: PriceList;
  items: NonGstBillItem[];
  otherCharges: number;
  subtotal: number;
  grandTotal: number;
  amountInWords: string;
  /** Method of the first payment (old single "how was it paid" value). */
  paymentMethod?: string;
  /** Every payment and refund on the bill, oldest first. */
  payments?: PaymentEntry[];
  amountPaid?: number;
  dueDate?: string;
  /** Paid / balance due / status, worked out by the server. */
  payment?: PaymentSummary;
  status: NonGstBillStatus;
  note?: string;
  createdBy: string;
  whatsappSentAt?: string;
  emailSentAt?: string;
  editedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** A row on the Non-GST bills page — the list endpoint returns a slimmed-down bill. */
export interface NonGstBillListItem {
  _id: string;
  billNumber: string;
  billingDate: string;
  customer: Omit<InvoiceCustomer, "gstin">;
  priceList: PriceList;
  /** Total units across all lines. */
  itemCount: number;
  grandTotal: number;
  paymentMethod?: string;
  payment: PaymentSummary;
  status: NonGstBillStatus;
  whatsappSentAt?: string;
  editedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}
