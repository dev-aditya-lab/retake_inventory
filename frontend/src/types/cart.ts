import type { Invoice } from "./invoice";
import type { NonGstBill } from "./nonGstBill";

/** What a finished checkout produced: a GST tax invoice, or a separate non-GST bill. */
export type CompletedSale = { kind: "gst"; invoice: Invoice } | { kind: "non_gst"; bill: NonGstBill };

export interface CartCustomer {
  name?: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  /** Place of supply state code. Blank = from the GSTIN, or the shop's own state. */
  stateCode?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  sku: string;
  hsnCode: string;
  unitPrice: number;
  quantity: number;
}

export type GstType = "CGST_SGST" | "IGST";
export type PaymentMethod = "cash" | "cheque" | "upi" | "bank_transfer";

export interface CartGst {
  enabled: boolean;
  type?: GstType;
  percentage: number;
}

export interface CartData {
  id: string;
  cashierId: string;
  customer: CartCustomer;
  items: CartItem[];
  /** B2B price list (GST added on top) instead of retail MRP. Chosen at the counter — a GSTIN doesn't imply it. */
  isB2b?: boolean;
  /** false = a non-GST bill: its own number series and section, no tax. Absent on old carts = GST. */
  gstApplicable?: boolean;
  gst: CartGst;
  otherCharges: number;
  paymentMethod?: PaymentMethod;
  note?: string;
  createdAt: string;
  updatedAt: string;
  /** Server-computed view of the cart, exactly as checkout would bill it. */
  preview?: CartPreview | NonGstCartPreview;
}

export interface CartPreviewLine {
  productId: string;
  unitPrice: number;
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/** A non-GST cart: lines at the chosen price list, no tax anywhere. */
export interface NonGstCartPreview {
  gstApplicable: false;
  priceList: "b2b" | "retail";
  lines: { productId: string; unitPrice: number; total: number }[];
  otherCharges: number;
  subtotal: number;
  grandTotal: number;
  /** Anything that would stop checkout — shown above the Generate button. */
  problems: string[];
}

export interface CartPreview {
  gstApplicable: true;
  buyerType: "B2B" | "B2C";
  /** exclusive = B2B price + GST; inclusive = MRP with GST inside. */
  priceMode: "exclusive" | "inclusive";
  placeOfSupply: { code: string; name: string };
  supplyType: "intra" | "inter";
  lines: CartPreviewLine[];
  otherCharges: { amount: number; gstRate: number; taxableValue: number; cgst: number; sgst: number; igst: number; total: number } | null;
  rateSummary: { gstRate: number; taxableValue: number; cgst: number; sgst: number; igst: number }[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  /** Anything that would stop checkout — shown above the Generate button. */
  problems: string[];
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
];
