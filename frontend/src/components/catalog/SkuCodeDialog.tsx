"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useCreateSkuCodeMutation, useUpdateSkuCodeMutation } from "@/lib/redux/features/catalog/catalogApi";
import { getApiErrorMessage } from "@/lib/apiError";
import type { SkuCode } from "@/types/catalog";

const MAX_PRODUCT_ID = 999;
// Retake's convention: single spices use 1–100, blends 101 and up.
const BLEND_ID_START = 101;
const CATEGORY_SUGGESTIONS = ["Single Spice", "Blend"];

/** Lowest barcode ID not yet used, in the range that fits the category. */
function nextFreeProductId(codes: SkuCode[], category: string): number | null {
  const used = new Set(codes.map((c) => c.productId));
  const start = category.trim().toLowerCase() === "blend" ? BLEND_ID_START : 1;
  for (let id = start; id <= MAX_PRODUCT_ID; id++) if (!used.has(id)) return id;
  return null;
}

/** Add (code = null) or edit an entry in the SKU code list. */
export function SkuCodeDialog({
  open,
  code,
  allCodes,
  onClose,
}: {
  open: boolean;
  code: SkuCode | null;
  allCodes: SkuCode[];
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={code ? `Edit ${code.name}` : "Add SKU code"}>
      {open && <SkuCodeForm key={code?._id ?? "new"} code={code} allCodes={allCodes} onClose={onClose} />}
    </Modal>
  );
}

function SkuCodeForm({ code, allCodes, onClose }: { code: SkuCode | null; allCodes: SkuCode[]; onClose: () => void }) {
  const [createSkuCode, { isLoading: isCreating }] = useCreateSkuCodeMutation();
  const [updateSkuCode, { isLoading: isUpdating }] = useUpdateSkuCodeMutation();
  const initialCategory = code?.category ?? "Single Spice";
  const [name, setName] = useState(code?.name ?? "");
  const [skuCode, setSkuCode] = useState(code?.skuCode ?? "");
  const [category, setCategory] = useState(initialCategory);
  const [productId, setProductId] = useState(
    code ? String(code.productId) : String(nextFreeProductId(allCodes, initialCategory) ?? ""),
  );
  const [productIdTouched, setProductIdTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = code?.productCount ?? 0;
  const barcodeIdLocked = !!code && linked > 0;
  const nameChanged = !!code && name.trim() !== code.name;
  const skuCodeChanged = !!code && skuCode.trim().toUpperCase() !== code.skuCode;

  const pid = Number(productId);
  const previewPid = Number.isInteger(pid) && pid >= 1 && pid <= MAX_PRODUCT_ID ? String(pid).padStart(3, "0") : "???";
  const previewSku = skuCode.trim().toUpperCase() || "???";

  function handleCategoryChange(value: string) {
    setCategory(value);
    // Keep suggesting a fitting barcode ID for a new code until the admin picks one themselves.
    if (!code && !productIdTouched) setProductId(String(nextFreeProductId(allCodes, value) ?? ""));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const normalizedSku = skuCode.trim().toUpperCase();
    if (!name.trim()) return setError("Name is required.");
    if (!/^[A-Z0-9]{2,6}$/.test(normalizedSku)) return setError("SKU code must be 2–6 letters or digits, e.g. TUR.");
    if (!Number.isInteger(pid) || pid < 1 || pid > MAX_PRODUCT_ID) {
      return setError(`Barcode ID must be a whole number from 1 to ${MAX_PRODUCT_ID}.`);
    }

    const body = { name: name.trim(), skuCode: normalizedSku, productId: pid, category: category.trim() };
    try {
      if (code) {
        await updateSkuCode({ id: code._id, ...body }).unwrap();
      } else {
        await createSkuCode(body).unwrap();
      }
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save — try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Spice / product name *">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Turmeric" className="input" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU code *">
          <input
            required
            value={skuCode}
            maxLength={6}
            onChange={(e) => setSkuCode(e.target.value.toUpperCase())}
            placeholder="TUR"
            className="input uppercase"
          />
        </Field>
        <Field label="Barcode ID *">
          <input
            required
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_PRODUCT_ID}
            value={productId}
            disabled={barcodeIdLocked}
            onChange={(e) => {
              setProductId(e.target.value);
              setProductIdTouched(true);
            }}
            className="input disabled:bg-surface disabled:text-muted"
          />
        </Field>
      </div>
      {barcodeIdLocked && (
        <p className="-mt-1 text-xs text-muted">
          Barcode ID is locked while {linked} product{linked === 1 ? "" : "s"} use it — their printed barcodes would stop
          scanning.
        </p>
      )}

      <Field label="Category">
        <input
          list="sku-code-categories"
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="input"
        />
        <datalist id="sku-code-categories">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <div className="rounded-md bg-surface p-3 text-xs text-muted">
        <p>
          Example SKU: <span className="font-mono text-foreground">RTK-{previewSku}-PW-100</span>
        </p>
        <p className="mt-1">
          Example barcode: <span className="font-mono text-foreground">890 12 {previewPid} 03 01</span>
        </p>
      </div>

      {(nameChanged || skuCodeChanged) && linked > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-foreground">
          <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden />
          <span>
            This also updates {linked} product{linked === 1 ? "" : "s"}
            {nameChanged && " (their name)"}
            {skuCodeChanged && " (their SKU — relabel shelves if SKUs are printed)"}. Past bills don&apos;t change.
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
          {isCreating || isUpdating ? "Saving…" : code ? "Save" : "Add code"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      {label}
      {children}
    </label>
  );
}
