"use client";

import { use } from "react";
import { Printer, Download } from "lucide-react";
import { useGetCreditNoteQuery } from "@/lib/redux/features/invoices/invoicesApi";
import { TaxDocumentView } from "@/components/invoice/TaxDocumentView";
import { API_BASE_URL } from "@/lib/redux/apiSlice";

/** Public credit note page — shared with the customer like an invoice link. */
export default function CreditNotePage({ params }: { params: Promise<{ noteNumber: string }> }) {
  const { noteNumber } = use(params);
  const { data: note, isLoading, isError } = useGetCreditNoteQuery(noteNumber);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (isError || !note) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-semibold text-foreground">Credit note not found</p>
        <p className="text-sm text-muted">&quot;{noteNumber}&quot; doesn&apos;t match any credit note.</p>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-surface py-6">
      <div className="print-hide mx-auto mb-4 flex max-w-3xl items-center justify-end gap-2 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          <Printer size={16} aria-hidden />
          Print
        </button>
        <a
          href={`${API_BASE_URL}/api/credit-notes/${note.noteNumber}/pdf`}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Download size={16} aria-hidden />
          Download PDF
        </a>
      </div>

      <div className="rounded-lg border border-border shadow-sm print:border-none print:shadow-none">
        <TaxDocumentView
          title="CREDIT NOTE"
          doc={{ ...note, number: note.noteNumber, date: note.noteDate }}
          reference={{ number: note.invoiceNumber, date: note.invoiceDate }}
          reason={note.reason || undefined}
        />
      </div>
    </div>
  );
}
