"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useCreateHsnCodeMutation, useUpdateHsnCodeMutation } from "@/lib/redux/features/catalog/catalogApi";
import { getApiErrorMessage } from "@/lib/apiError";
import type { HsnCode } from "@/types/catalog";

/** Add (hsn = null) or edit an HSN/SAC code. */
export function HsnCodeDialog({ open, hsn, onClose }: { open: boolean; hsn: HsnCode | null; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={hsn ? `Edit HSN ${hsn.code}` : "Add HSN code"} size="sm">
      {open && <HsnCodeForm key={hsn?._id ?? "new"} hsn={hsn} onClose={onClose} />}
    </Modal>
  );
}

function HsnCodeForm({ hsn, onClose }: { hsn: HsnCode | null; onClose: () => void }) {
  const [createHsnCode, { isLoading: isCreating }] = useCreateHsnCodeMutation();
  const [updateHsnCode, { isLoading: isUpdating }] = useUpdateHsnCodeMutation();
  const [code, setCode] = useState(hsn?.code ?? "");
  const [description, setDescription] = useState(hsn?.description ?? "");
  const [gstRate, setGstRate] = useState(hsn?.gstRate !== undefined ? String(hsn.gstRate) : "");
  const [error, setError] = useState<string | null>(null);

  const codeChanged = !!hsn && code.trim() !== hsn.code;
  const linked = hsn?.productCount ?? 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!/^\d{4,8}$/.test(trimmed)) return setError("HSN/SAC code must be 4–8 digits.");
    const rate = gstRate.trim() === "" ? null : Number(gstRate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      return setError("GST rate must be between 0 and 100.");
    }

    try {
      if (hsn) {
        await updateHsnCode({ id: hsn._id, code: trimmed, description: description.trim(), gstRate: rate }).unwrap();
      } else {
        await createHsnCode({ code: trimmed, description: description.trim(), gstRate: rate ?? undefined }).unwrap();
      }
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save — try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        HSN/SAC code *
        <input
          required
          inputMode="numeric"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="e.g. 0910"
          className="input font-mono"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Description
        <input
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Turmeric, ginger & other spices"
          className="input"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        GST rate % (for reference)
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="0.01"
          value={gstRate}
          onChange={(e) => setGstRate(e.target.value)}
          placeholder="Optional"
          className="input"
        />
      </label>

      {codeChanged && linked > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-foreground">
          <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden />
          <span>
            {linked} product{linked === 1 ? "" : "s"} with HSN {hsn?.code} will switch to the new code. Past bills keep the
            old code.
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isCreating || isUpdating}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isCreating || isUpdating ? "Saving…" : hsn ? "Save" : "Add code"}
        </button>
      </div>
    </form>
  );
}
