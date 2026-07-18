export interface CartCustomer {
  name?: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
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

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
];
