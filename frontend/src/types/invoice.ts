export interface InvoiceItem {
  product: string;
  name: string;
  hsnCode: string;
  quantity: number;
  /** GST bills: excl. GST (B2B) or the MRP (retail). Old bills: pre-tax price. */
  unitPrice: number;
  /** Line amount — including GST on GST bills, pre-tax on old bills. */
  total: number;
  // GST bills only:
  uqc?: string;
  gstRate?: number;
  taxableValue?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
}

export interface TaxAmounts {
  taxableValue: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
}

export interface RateSummaryRow extends TaxAmounts {
  gstRate: number;
}

export interface OtherChargesLine extends TaxAmounts {
  description?: string;
  amount: number;
  gstRate: number;
  hsnCode?: string;
  total: number;
}

/** Tax fields carried by GST bills (gstVersion 2) and credit notes. */
export interface GstDocumentFields {
  supplier?: { legalName: string; address: string; gstin: string; stateCode: string; stateName: string };
  buyerType?: "B2B" | "B2C";
  priceMode?: "exclusive" | "inclusive";
  placeOfSupply?: { code: string; name: string };
  supplyType?: "intra" | "inter";
  otherChargesLine?: OtherChargesLine | null;
  rateSummary?: RateSummaryRow[];
  taxableValue?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalTax?: number;
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

/**
 * void = cancelled before its month's GSTR-1 was filed;
 * credited = fully reversed by a credit note after filing.
 */
export type InvoiceStatus = "paid" | "void" | "credited";

export interface InvoiceCustomer {
  name: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}

export interface Invoice extends GstDocumentFields {
  _id: string;
  /** 2 = GST tax invoice with per-line tax; absent on old bills. */
  gstVersion?: number;
  /** Its month's GSTR-1 is filed — changes go through credit notes. */
  gstLocked?: boolean;
  creditedTotal?: number;
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
  gstVersion?: number;
  buyerType?: "B2B" | "B2C";
  gstLocked?: boolean;
  creditedTotal?: number;
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
