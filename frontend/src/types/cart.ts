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
  gst: CartGst;
  otherCharges: number;
  paymentMethod?: PaymentMethod;
  note?: string;
  createdAt: string;
  updatedAt: string;
  /** Server-computed GST view of the cart, exactly as checkout would bill it. */
  preview?: CartPreview;
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

export interface CartPreview {
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
