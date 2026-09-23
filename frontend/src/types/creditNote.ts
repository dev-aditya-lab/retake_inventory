import type { GstDocumentFields, InvoiceCustomer, InvoiceItem } from "./invoice";

/** A credit note reversing all or part of a bill whose month's GSTR-1 was filed. */
export interface CreditNote extends GstDocumentFields {
  _id: string;
  noteNumber: string;
  noteDate: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceCategory: "B2B" | "B2CL" | "B2CS";
  customer: InvoiceCustomer;
  items: InvoiceItem[];
  grandTotal: number;
  amountInWords: string;
  reason: string;
  isFullReversal: boolean;
  createdAt: string;
}
