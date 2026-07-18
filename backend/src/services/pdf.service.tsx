import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf, type InvoicePdfData } from "../pdf/InvoicePdf";
import { generateInvoiceBarcodePng } from "./barcode.service";
import { ApiError } from "../utils/ApiError";
import type { InvoiceDoc } from "../models/Invoice.model";

export async function generateInvoicePdf(invoice: InvoiceDoc): Promise<Buffer> {
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
    barcodePng: generateInvoiceBarcodePng(invoice.invoiceNumber),
  };

  return renderToBuffer(<InvoicePdf invoice={data} />);
}
