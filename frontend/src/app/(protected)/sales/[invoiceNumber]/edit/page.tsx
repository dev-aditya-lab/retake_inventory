"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useGetInvoiceQuery } from "@/lib/redux/features/invoices/invoicesApi";
import { RequireRole } from "@/components/auth/RequireRole";
import { InvoiceEditForm } from "@/components/sales/InvoiceEditForm";

export default function EditSalePage({ params }: { params: Promise<{ invoiceNumber: string }> }) {
  const { invoiceNumber } = use(params);
  return (
    <RequireRole roles={["admin"]} message="Only admins can edit bills.">
      <EditSale invoiceNumber={invoiceNumber} />
    </RequireRole>
  );
}

function EditSale({ invoiceNumber }: { invoiceNumber: string }) {
  const { data: invoice, isLoading, isError, refetch } = useGetInvoiceQuery(invoiceNumber);
  const [justSaved, setJustSaved] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/sales" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft size={16} aria-hidden />
        Sales
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">Edit bill</h1>
      <p className="mt-1 text-sm text-muted">{invoiceNumber}</p>

      {justSaved && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-leaf-200 bg-leaf-50 p-3 text-sm"
        >
          <span className="flex items-center gap-2 text-foreground">
            <CheckCircle2 size={18} className="text-success" aria-hidden />
            Bill updated. Stock was adjusted for any quantity changes.
          </span>
          <span className="flex gap-3">
            <Link href={`/invoice/${invoiceNumber}`} target="_blank" className="font-medium text-primary underline">
              View bill
            </Link>
            <Link href="/sales" className="font-medium text-primary underline">
              Back to sales
            </Link>
          </span>
        </div>
      )}

      {isLoading && <p className="mt-6 text-sm text-muted">Loading bill…</p>}
      {isError && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <span className="text-danger">Could not load this bill.</span>
          <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
            Try again
          </button>
        </div>
      )}
      {invoice?.status === "void" && (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          This bill was cancelled, so it can&apos;t be edited.
        </p>
      )}
      {invoice?.status === "credited" && (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          This bill was reversed by a credit note, so it can&apos;t be edited.
        </p>
      )}
      {invoice && invoice.status === "paid" && invoice.gstLocked && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-foreground">
          <p className="font-medium">This bill&apos;s month is already filed in GSTR-1.</p>
          <p className="mt-1 text-muted">
            A filed bill can&apos;t be changed. On the Sales page, use <strong>Return items</strong> for goods that came back,
            or <strong>Delete</strong> to reverse the whole bill — both issue a credit note for this month&apos;s return. For
            anything else, make a new bill.
          </p>
        </div>
      )}
      {invoice && invoice.status === "paid" && !invoice.gstLocked && (
        // Re-keyed on every save so the form restarts from the server's recalculated bill.
        <InvoiceEditForm key={invoice.updatedAt} invoice={invoice} onSaved={() => setJustSaved(true)} />
      )}
    </div>
  );
}
