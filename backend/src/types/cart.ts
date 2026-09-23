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
  gst: CartGst;
  otherCharges: number;
  paymentMethod?: PaymentMethod;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
