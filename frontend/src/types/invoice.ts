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

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  billingDate: string;
  customer: {
    name: string;
    company?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
  items: InvoiceItem[];
  gst: InvoiceGst;
  otherCharges: number;
  subtotal: number;
  grandTotal: number;
  amountInWords: string;
  paymentMethod: string;
  status: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
