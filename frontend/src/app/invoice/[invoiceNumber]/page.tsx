"use client";

import { use } from "react";
import { Printer, Download } from "lucide-react";
import { useGetInvoiceQuery } from "@/lib/redux/features/invoices/invoicesApi";
import { useGetNonGstBillQuery } from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { InvoiceView } from "@/components/invoice/InvoiceView";
import { NonGstBillView } from "@/components/invoice/NonGstBillView";
import { API_BASE_URL } from "@/lib/redux/apiSlice";
import { company } from "@/config/company";

/**
 * The public page behind every customer link (WhatsApp button, email, QR).
 * GST invoices and non-GST bills share it — the WhatsApp template's button
 * URL is fixed to /invoice/{number} — but come from separate endpoints, told
 * apart by their number series.
 */
export default function InvoiceDetailPage({ params }: { params: Promise<{ invoiceNumber: string }> }) {
  const { invoiceNumber } = use(params);
  const isNonGstBill = invoiceNumber.startsWith(`${company.nonGstBillPrefix}-`);

  const gst = useGetInvoiceQuery(invoiceNumber, { skip: isNonGstBill });
  const nonGst = useGetNonGstBillQuery(invoiceNumber, { skip: !isNonGstBill });

  const isLoading = isNonGstBill ? nonGst.isLoading : gst.isLoading;
  const invoice = gst.data;
  const bill = nonGst.data;

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (!(isNonGstBill ? bill : invoice)) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-semibold text-foreground">{isNonGstBill ? "Bill" : "Invoice"} not found</p>
        <p className="text-sm text-muted">
          &quot;{invoiceNumber}&quot; doesn&apos;t match any {isNonGstBill ? "bill" : "invoice"}.
        </p>
      </div>
    );
  }

  const pdfUrl = isNonGstBill
    ? `${API_BASE_URL}/api/non-gst-bills/${invoiceNumber}/pdf`
    : `${API_BASE_URL}/api/invoices/${invoiceNumber}/pdf`;

  return (
    <div className="min-h-svh bg-surface py-6">
      <div className="print-hide mx-auto mb-4 flex max-w-2xl items-center justify-end gap-2 px-6">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          <Printer size={16} aria-hidden />
          Print
        </button>
        <a
          href={pdfUrl}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Download size={16} aria-hidden />
          Download PDF
        </a>
      </div>

      <div className="rounded-lg border border-border shadow-sm print:border-none print:shadow-none">
        {isNonGstBill && bill ? <NonGstBillView bill={bill} /> : invoice ? <InvoiceView invoice={invoice} /> : null}
      </div>
    </div>
  );
}
