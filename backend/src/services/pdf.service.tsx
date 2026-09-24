import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf, type InvoicePdfData } from "../pdf/InvoicePdf";
import { TaxInvoicePdf, type TaxDocPdfData } from "../pdf/TaxInvoicePdf";
import { NonGstBillPdf, type NonGstBillPdfData } from "../pdf/NonGstBillPdf";
import type { NonGstBillDoc } from "../models/NonGstBill.model";
import { encodeInvoiceBarcode } from "./barcode.service";
import { supplierSnapshot } from "./gstDocument.service";
import { ApiError } from "../utils/ApiError";
import { GST_VERSION, type InvoiceDoc } from "../models/Invoice.model";
import type { CreditNoteDoc } from "../models/CreditNote.model";

type GstDoc = Pick<
  InvoiceDoc,
  | "supplier"
  | "customer"
  | "buyerType"
  | "priceMode"
  | "placeOfSupply"
  | "supplyType"
  | "items"
  | "otherChargesLine"
  | "rateSummary"
  | "taxableValue"
  | "cgst"
  | "sgst"
  | "igst"
  | "totalTax"
  | "grandTotal"
  | "amountInWords"
>;

/** The shared tax-document fields of a GST-v2 invoice or credit note. */
function taxDocFields(doc: GstDoc) {
  if (!doc.customer || !doc.placeOfSupply) throw ApiError.badRequest("Document is missing GST data");
  return {
    supplier: doc.supplier ?? supplierSnapshot(),
    customer: doc.customer,
    buyerType: (doc.buyerType ?? "B2C") as TaxDocPdfData["buyerType"],
    priceMode: (doc.priceMode ?? "inclusive") as TaxDocPdfData["priceMode"],
    placeOfSupply: doc.placeOfSupply,
    supplyType: (doc.supplyType ?? "intra") as TaxDocPdfData["supplyType"],
    items: doc.items.map((item) => ({
      name: item.name,
      hsnCode: item.hsnCode ?? "",
      uqc: item.uqc ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      gstRate: item.gstRate ?? 0,
      taxableValue: item.taxableValue ?? 0,
      cgst: item.cgst,
      sgst: item.sgst,
      igst: item.igst,
      total: item.total,
    })),
    otherChargesLine: doc.otherChargesLine
      ? {
          description: doc.otherChargesLine.description,
          hsnCode: doc.otherChargesLine.hsnCode,
          gstRate: doc.otherChargesLine.gstRate,
          taxableValue: doc.otherChargesLine.taxableValue,
          cgst: doc.otherChargesLine.cgst,
          sgst: doc.otherChargesLine.sgst,
          igst: doc.otherChargesLine.igst,
          total: doc.otherChargesLine.total,
        }
      : null,
    rateSummary: doc.rateSummary ?? [],
    totals: {
      taxableValue: doc.taxableValue ?? 0,
      cgst: doc.cgst,
      sgst: doc.sgst,
      igst: doc.igst,
      totalTax: doc.totalTax ?? 0,
      grandTotal: doc.grandTotal,
    },
    amountInWords: doc.amountInWords,
  };
}

export async function generateInvoicePdf(invoice: InvoiceDoc): Promise<Buffer> {
  if (invoice.gstVersion === GST_VERSION) {
    const data: TaxDocPdfData = {
      title: "TAX INVOICE",
      number: invoice.invoiceNumber,
      date: invoice.billingDate,
      ...taxDocFields(invoice),
      paymentMethod: invoice.paymentMethod,
      cancelled: invoice.status === "void",
      barcodeModules: encodeInvoiceBarcode(invoice.invoiceNumber),
    };
    return renderToBuffer(<TaxInvoicePdf doc={data} />);
  }

  // Bills made before per-line GST keep their original layout.
  if (!invoice.customer || !invoice.gst) {
    throw ApiError.badRequest("Invoice is missing required data");
  }

  const data: InvoicePdfData = {
    invoiceNumber: invoice.invoiceNumber,
    billingDate: invoice.billingDate,
    customer: invoice.customer,
    items: invoice.items,
    gst: {
      enabled: invoice.gst.enabled,
      type: invoice.gst.type ?? undefined,
      percentage: invoice.gst.percentage,
      cgstAmount: invoice.gst.cgstAmount ?? undefined,
      sgstAmount: invoice.gst.sgstAmount ?? undefined,
      igstAmount: invoice.gst.igstAmount ?? undefined,
    },
    otherCharges: invoice.otherCharges,
    subtotal: invoice.subtotal,
    grandTotal: invoice.grandTotal,
    amountInWords: invoice.amountInWords,
    paymentMethod: invoice.paymentMethod,
    cancelled: invoice.status === "void",
    barcodeModules: encodeInvoiceBarcode(invoice.invoiceNumber),
  };

  return renderToBuffer(<InvoicePdf invoice={data} />);
}

export async function generateNonGstBillPdf(bill: NonGstBillDoc): Promise<Buffer> {
  if (!bill.customer) throw ApiError.badRequest("Bill is missing required data");

  const data: NonGstBillPdfData = {
    billNumber: bill.billNumber,
    billingDate: bill.billingDate,
    customer: bill.customer,
    items: bill.items,
    priceList: bill.priceList,
    otherCharges: bill.otherCharges,
    subtotal: bill.subtotal,
    grandTotal: bill.grandTotal,
    amountInWords: bill.amountInWords,
    paymentMethod: bill.paymentMethod,
    cancelled: bill.status === "void",
    barcodeModules: encodeInvoiceBarcode(bill.billNumber),
  };
  return renderToBuffer(<NonGstBillPdf bill={data} />);
}

export async function generateCreditNotePdf(note: CreditNoteDoc): Promise<Buffer> {
  const data: TaxDocPdfData = {
    title: "CREDIT NOTE",
    number: note.noteNumber,
    date: note.noteDate,
    reference: { number: note.invoiceNumber, date: note.invoiceDate },
    reason: note.reason || undefined,
    ...taxDocFields(note as unknown as GstDoc),
    barcodeModules: encodeInvoiceBarcode(note.noteNumber),
  };
  return renderToBuffer(<TaxInvoicePdf doc={data} />);
}
