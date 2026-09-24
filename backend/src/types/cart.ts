export interface CartCustomer {
  name?: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  /** Place of supply (GST state code). Blank = from the GSTIN, or the shop's own state. */
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
  /** B2B price list (GST added on top) instead of retail MRP. Set at the counter; not implied by a GSTIN. */
  isB2b?: boolean;
  /** false = a non-GST bill: separate number series, no tax, never part of any GST return. Absent = GST. */
  gstApplicable?: boolean;
  gst: CartGst;
  otherCharges: number;
  paymentMethod?: PaymentMethod;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
