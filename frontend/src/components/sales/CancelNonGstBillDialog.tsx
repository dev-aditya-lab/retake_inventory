"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCancelNonGstBillMutation } from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency } from "@/lib/format";

interface CancellableBill {
  billNumber: string;
  grandTotal: number;
  customer: { name: string };
}

/** Admin "delete" of a non-GST bill: cancels it and puts its items back into stock. */
export function CancelNonGstBillDialog({
  bill,
  onClose,
  onCancelled,
}: {
  bill: CancellableBill | null;
  onClose: () => void;
  onCancelled?: () => void;
}) {
  const [cancelBill, { isLoading }] = useCancelNonGstBillMutation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason("");
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!bill) return;
    setError(null);
    try {
      await cancelBill({ billNumber: bill.billNumber, reason: reason.trim() || undefined }).unwrap();
      setReason("");
      onCancelled?.();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this bill — try again."));
    }
  }

  return (
    <ConfirmDialog
      open={!!bill}
      title="Delete this bill?"
      confirmLabel="Delete bill"
      pendingLabel="Deleting…"
      isLoading={isLoading}
      error={error}
      onConfirm={handleConfirm}
      onClose={close}
      message={
        bill && (
          <div className="flex flex-col gap-2">
            <p>
              <span className="font-medium">{bill.billNumber}</span> · {bill.customer.name} · {formatCurrency(bill.grandTotal)}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>All its items go back into stock.</li>
              <li>It stops counting in the non-GST totals.</li>
              <li>The bill is kept on record marked &ldquo;Cancelled&rdquo;, so the bill numbers have no gaps.</li>
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
