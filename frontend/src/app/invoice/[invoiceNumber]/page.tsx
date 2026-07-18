"use client";

import { use } from "react";
import { Printer, Download } from "lucide-react";
import { useGetInvoiceQuery } from "@/lib/redux/features/invoices/invoicesApi";
import { InvoiceView } from "@/components/invoice/InvoiceView";
import { API_BASE_URL } from "@/lib/redux/apiSlice";

export default function InvoiceDetailPage({ params }: { params: Promise<{ invoiceNumber: string }> }) {
  const { invoiceNumber } = use(params);
  const { data: invoice, isLoading, isError } = useGetInvoiceQuery(invoiceNumber);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-semibold text-foreground">Invoice not found</p>
        <p className="text-sm text-muted">&quot;{invoiceNumber}&quot; doesn&apos;t match any invoice.</p>
      </div>
    );
  }

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
          href={`${API_BASE_URL}/api/invoices/${invoice.invoiceNumber}/pdf`}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Download size={16} aria-hidden />
          Download PDF
        </a>
      </div>

      <div className="rounded-lg border border-border shadow-sm print:border-none print:shadow-none">
        <InvoiceView invoice={invoice} />
      </div>
    </div>
  );
}
