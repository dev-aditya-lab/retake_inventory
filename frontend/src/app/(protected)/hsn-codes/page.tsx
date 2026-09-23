"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useDeleteHsnCodeMutation, useListHsnCodesQuery } from "@/lib/redux/features/catalog/catalogApi";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HsnCodeDialog } from "@/components/catalog/HsnCodeDialog";
import { getApiErrorMessage } from "@/lib/apiError";
import type { HsnCode } from "@/types/catalog";

export default function HsnCodesPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can manage HSN codes.">
      <HsnCodeList />
    </RequireRole>
  );
}

function HsnCodeList() {
  const { data: codes, isLoading, isError, refetch } = useListHsnCodesQuery();
  const [dialog, setDialog] = useState<{ open: boolean; hsn: HsnCode | null }>({ open: false, hsn: null });
  const [deleting, setDeleting] = useState<HsnCode | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">HSN codes</h1>
          <p className="mt-1 text-sm text-muted">The HSN/SAC codes products can be given. They print on every bill line.</p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ open: true, hsn: null })}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus size={16} aria-hidden />
          Add code
        </button>
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted">Loading codes…</p>}
      {isError && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <span className="text-danger">Could not load HSN codes.</span>
          <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
            Try again
          </button>
        </div>
      )}
      {codes && codes.length === 0 && (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          No HSN codes yet. Add the codes your products use, then pick them on each product.
        </p>
      )}

      {codes && codes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {codes.map((hsn) => (
            <li key={hsn._id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex h-11 min-w-16 shrink-0 items-center justify-center rounded-md bg-leaf-50 px-2 font-mono text-sm font-semibold text-leaf-700">
                {hsn.code}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {hsn.description || <span className="text-muted">No description</span>}
                </p>
                <p className="text-xs text-muted">
                  {hsn.gstRate !== undefined && `GST ${hsn.gstRate}% · `}
                  {hsn.productCount} product{hsn.productCount === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialog({ open: true, hsn })}
                aria-label={`Edit HSN ${hsn.code}`}
                className="rounded-md p-2 text-muted hover:bg-ink-100 hover:text-foreground"
              >
                <Pencil size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(hsn)}
                aria-label={`Delete HSN ${hsn.code}`}
                className="rounded-md p-2 text-danger hover:bg-chilli-50"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <HsnCodeDialog open={dialog.open} hsn={dialog.hsn} onClose={() => setDialog({ open: false, hsn: null })} />
      <DeleteHsnCodeDialog hsn={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function DeleteHsnCodeDialog({ hsn, onClose }: { hsn: HsnCode | null; onClose: () => void }) {
  const [deleteHsnCode, { isLoading }] = useDeleteHsnCodeMutation();
  const [error, setError] = useState<string | null>(null);
  const inUse = (hsn?.productCount ?? 0) > 0;

  function close() {
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!hsn) return;
    setError(null);
    try {
      await deleteHsnCode(hsn._id).unwrap();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete the code — try again."));
    }
  }

  return (
    <ConfirmDialog
      open={!!hsn}
      title={inUse ? `HSN ${hsn?.code} is in use` : `Delete HSN ${hsn?.code ?? ""}?`}
      confirmLabel="Delete code"
      pendingLabel="Deleting…"
      isLoading={isLoading}
      canConfirm={!inUse}
      error={error}
      onConfirm={handleConfirm}
      onClose={close}
      message={
        hsn &&
        (inUse ? (
          <p>
            {hsn.productCount} product{hsn.productCount === 1 ? "" : "s"} still use this code. Give them a different HSN
            code first (or edit this code instead to switch them all at once).
          </p>
        ) : (
          <p>HSN {hsn.code} will be removed from the list. Past bills keep the code they were printed with.</p>
        ))
      }
    />
  );
}
