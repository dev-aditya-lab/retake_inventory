export interface InvoiceItem {
  product: string;
  name: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceGst {
  enabled: boolean;
  type?: "CGST_SGST" | "IGST";
  percentage: number;
  amount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
}

/** "void" = cancelled by an admin (stock returned, excluded from reports). */
export type InvoiceStatus = "paid" | "void";

export interface InvoiceCustomer {
  name: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  billingDate: string;
  customer: InvoiceCustomer;
  customerRef?: string;
  items: InvoiceItem[];
  gst: InvoiceGst;
  otherCharges: number;
  subtotal: number;
  grandTotal: number;
  amountInWords: string;
  paymentMethod: string;
  status: InvoiceStatus;
  note?: string;
  createdBy: string;
  whatsappSentAt?: string;
  editedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** A row on the Sales page — the list endpoint returns a slimmed-down invoice. */
export interface InvoiceListItem {
  _id: string;
  invoiceNumber: string;
  billingDate: string;
  customer: InvoiceCustomer;
  customerRef?: string;
  /** Total units across all lines. */
  itemCount: number;
  grandTotal: number;
  paymentMethod: string;
  status: InvoiceStatus;
  whatsappSentAt?: string;
  editedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}
