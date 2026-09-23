"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  useGetInvoiceQuery,
  useIssueCreditNoteMutation,
  useListInvoiceCreditNotesQuery,
} from "@/lib/redux/features/invoices/invoicesApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency, formatDate } from "@/lib/format";
import type { CreditNote } from "@/types/creditNote";

/**
 * Goods returned on a bill whose month's GSTR-1 is already filed. The bill
 * itself can't change any more, so the return is issued as a credit note —
 * it goes into the current month's GSTR-1 and the stock comes back.
 */
export function ReturnItemsDialog({ invoiceNumber, onClose }: { invoiceNumber: string | null; onClose: () => void }) {
  return (
    <Modal open={!!invoiceNumber} onClose={onClose} title="Return items" size="lg">
      {invoiceNumber && <ReturnForm key={invoiceNumber} invoiceNumber={invoiceNumber} onClose={onClose} />}
    </Modal>
  );
}

function ReturnForm({ invoiceNumber, onClose }: { invoiceNumber: string; onClose: () => void }) {
  const { data: invoice, isLoading: loadingInvoice } = useGetInvoiceQuery(invoiceNumber);
  const { data: notes, isLoading: loadingNotes } = useListInvoiceCreditNotesQuery(invoiceNumber);
  const [issueCreditNote, { isLoading: isIssuing }] = useIssueCreditNoteMutation();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<CreditNote | null>(null);

  if (loadingInvoice || loadingNotes) return <p className="text-sm text-muted">Loading bill…</p>;
  if (!invoice) return <p className="text-sm text-danger">Could not load this bill.</p>;

  const alreadyReturned = new Map<string, number>();
  for (const note of notes ?? []) {
    for (const item of note.items) alreadyReturned.set(item.product, (alreadyReturned.get(item.product) ?? 0) + item.quantity);
  }
  const lines = invoice.items.map((item) => ({
    ...item,
    returnable: item.quantity - (alreadyReturned.get(item.product) ?? 0),
  }));
  const selected = lines.filter((line) => (quantities[line.product] ?? 0) > 0);

  function setQty(product: string, value: number, max: number) {
    setQuantities((q) => ({ ...q, [product]: Math.min(max, Math.max(0, value)) }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.length === 0) {
      setError("Choose how many of each item came back.");
      return;
    }
    try {
      const note = await issueCreditNote({
        invoiceNumber,
        items: selected.map((line) => ({ product: line.product, quantity: quantities[line.product]! })),
        reason: reason.trim() || undefined,
      }).unwrap();
      setIssued(note);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not issue the credit note — try again."));
    }
  }

  if (issued) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <CheckCircle2 size={36} className="text-success" aria-hidden />
        <p className="text-sm text-foreground">
          Credit note <span className="font-medium">{issued.noteNumber}</span> issued for {formatCurrency(issued.grandTotal)}.
          The items are back in stock.
        </p>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Link
            href={`/credit-note/${issued.noteNumber}`}
            target="_blank"
            className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100"
          >
            View / print credit note
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {invoice.invoiceNumber} · {formatDate(invoice.billingDate)} · {invoice.customer.name}. This bill&apos;s month is filed, so
        returns are issued as a GST credit note.
      </p>

      {(notes?.length ?? 0) > 0 && (
        <div className="rounded-md bg-surface p-3 text-xs text-muted">
          Earlier credit notes:{" "}
          {notes!.map((note, i) => (
            <span key={note._id}>
              {i > 0 && ", "}
              <Link href={`/credit-note/${note.noteNumber}`} target="_blank" className="font-medium text-foreground underline">
                {note.noteNumber}
              </Link>{" "}
              ({formatCurrency(note.grandTotal)})
            </span>
          ))}
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {lines.map((line) => {
          const qty = quantities[line.product] ?? 0;
          return (
            <li key={line.product} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                <p className="text-xs text-muted">
                  Billed {line.quantity} · {line.returnable > 0 ? `${line.returnable} can be returned` : "all returned"}
                </p>
              </div>
              {line.returnable > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQty(line.product, qty - 1, line.returnable)}
                    aria-label={`Return one less ${line.name}`}
                    className="rounded-md border border-border p-2 text-foreground hover:bg-ink-100"
                  >
                    <Minus size={14} aria-hidden />
                  </button>
                  <span className="w-8 text-center text-sm font-medium" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(line.product, qty + 1, line.returnable)}
                    aria-label={`Return one more ${line.name}`}
                    className="rounded-md border border-border p-2 text-foreground hover:bg-ink-100"
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Reason (printed on the credit note)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="e.g. Damaged packets returned"
          className="input"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isIssuing || selected.length === 0}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {isIssuing ? "Issuing…" : `Issue credit note${selected.length ? ` (${selected.reduce((n, l) => n + (quantities[l.product] ?? 0), 0)} items)` : ""}`}
      </button>
    </form>
  );
}
