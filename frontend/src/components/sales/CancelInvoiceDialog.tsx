"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCancelInvoiceMutation } from "@/lib/redux/features/invoices/invoicesApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency } from "@/lib/format";

interface CancellableInvoice {
  invoiceNumber: string;
  grandTotal: number;
  customer: { name: string };
}

/** Admin "delete" of a bill: cancels it and puts its items back into stock. */
export function CancelInvoiceDialog({
  invoice,
  onClose,
  onCancelled,
}: {
  invoice: CancellableInvoice | null;
  onClose: () => void;
  onCancelled?: () => void;
}) {
  const [cancelInvoice, { isLoading }] = useCancelInvoiceMutation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason("");
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!invoice) return;
    setError(null);
    try {
      await cancelInvoice({ invoiceNumber: invoice.invoiceNumber, reason: reason.trim() || undefined }).unwrap();
      setReason("");
      onCancelled?.();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this bill — try again."));
    }
  }

  return (
    <ConfirmDialog
      open={!!invoice}
      title="Delete this bill?"
      confirmLabel="Delete bill"
      pendingLabel="Deleting…"
      isLoading={isLoading}
      error={error}
      onConfirm={handleConfirm}
      onClose={close}
      message={
        invoice && (
          <div className="flex flex-col gap-2">
            <p>
              <span className="font-medium">{invoice.invoiceNumber}</span> · {invoice.customer.name} ·{" "}
              {formatCurrency(invoice.grandTotal)}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>All its items go back into stock.</li>
              <li>It is removed from sales totals and reports.</li>
              <li>The bill is kept on record marked &ldquo;Cancelled&rdquo;, and the customer&apos;s link shows it as cancelled.</li>
            </ul>
          </div>
        )
      }
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Reason (optional)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="e.g. Wrong items billed"
          className="input"
        />
      </label>
    </ConfirmDialog>
  );
}
