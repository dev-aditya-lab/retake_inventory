"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { useUpdateProductMutation, type UpdateProductInput } from "@/lib/redux/features/products/productsApi";
import { useListSkuCodesQuery } from "@/lib/redux/features/catalog/catalogApi";
import { HsnCodeSelect } from "./HsnCodeSelect";
import { GstRateSelect, UqcSelect } from "./GstFields";
import { getApiErrorMessage } from "@/lib/apiError";
import { PRODUCT_TYPES, WEIGHT_LABELS, type Product, type ProductType } from "@/types/product";

/**
 * Product details form. Everyone who can manage stock edits prices, HSN,
 * thresholds and notes; admins additionally get the identity fields (name,
 * type, weight, SKU, and barcode for external products).
 */
export function ProductEditForm({ product, isAdmin }: { product: Product; isAdmin: boolean }) {
  const [updateProduct, { isLoading }] = useUpdateProductMutation();
  const { data: skuCodes } = useListSkuCodesQuery(undefined, { skip: !isAdmin });
  const isExternal = product.barcodeSource === "external";

  const [form, setForm] = useState({
    name: product.name,
    type: product.type,
    weightLabel: product.weightLabel,
    sku: product.sku,
    barcode: product.ean13,
    category: product.category,
    hsnCode: product.hsnCode,
    costPrice: String(product.costPrice),
    sellingPrice: String(product.sellingPrice),
    mrp: product.mrp !== undefined && product.mrp !== null ? String(product.mrp) : "",
    gstRate: product.gstRate !== undefined && product.gstRate !== null ? String(product.gstRate) : "",
    uqc: product.uqc || "PAC",
    lowStockThreshold: String(product.lowStockThreshold),
    note: product.note,
    isActive: product.isActive,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identityChanged =
    form.name.trim() !== product.name || form.type !== product.type || form.weightLabel !== product.weightLabel;
  const barcodeWillChange = isAdmin && !isExternal && identityChanged;
  const weightOptions = WEIGHT_LABELS.includes(product.weightLabel) ? WEIGHT_LABELS : [product.weightLabel, ...WEIGHT_LABELS];

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);

    const body: UpdateProductInput = {
      id: product._id,
      category: form.category,
      hsnCode: form.hsnCode,
      costPrice: Number(form.costPrice),
      sellingPrice: Number(form.sellingPrice),
      mrp: form.mrp === "" ? undefined : Number(form.mrp),
      gstRate: form.gstRate === "" ? undefined : Number(form.gstRate),
      uqc: form.uqc,
      lowStockThreshold: Number(form.lowStockThreshold),
      note: form.note,
      isActive: form.isActive,
    };
    // Only send identity fields that actually changed: an untouched SKU is
    // then free to follow a name/type/weight change automatically.
    if (isAdmin) {
      if (form.name.trim() !== product.name) body.name = form.name.trim();
      if (form.type !== product.type) body.type = form.type;
      if (form.weightLabel !== product.weightLabel) body.weightLabel = form.weightLabel;
      if (form.sku.trim().toUpperCase() !== product.sku) body.sku = form.sku.trim().toUpperCase();
      if (isExternal && form.barcode.trim() !== product.ean13) body.barcode = form.barcode.trim();
    }

    try {
      const updated = await updateProduct(body).unwrap();
      // Reflect server-derived values (e.g. an auto-regenerated SKU).
      setForm((prev) => ({ ...prev, name: updated.name, sku: updated.sku, barcode: updated.ean13 }));
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save changes — try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-medium text-foreground">Details</h2>

      {isAdmin && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Product identity (admin)</p>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Name
            <input
              required
              list={isExternal ? undefined : "product-name-options"}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="input"
            />
            {!isExternal && (
              <datalist id="product-name-options">
                {skuCodes?.map((c) => (
                  <option key={c._id} value={c.name} />
                ))}
              </datalist>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Type
              <select value={form.type} onChange={(e) => set("type", e.target.value as ProductType)} className="input">
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Weight
              <select value={form.weightLabel} onChange={(e) => set("weightLabel", e.target.value)} className="input">
                {weightOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              SKU
              <input
                required
                value={form.sku}
                maxLength={40}
                onChange={(e) => set("sku", e.target.value.toUpperCase())}
                className="input font-mono uppercase"
              />
            </label>
            {isExternal && (
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Barcode (EAN-13)
                <input
                  required
                  inputMode="numeric"
                  maxLength={13}
                  value={form.barcode}
                  onChange={(e) => set("barcode", e.target.value.replace(/\D/g, ""))}
                  className="input font-mono"
                />
              </label>
            )}
          </div>
          {barcodeWillChange && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-foreground">
              <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden />
              <span>
                Changing name, type or weight gives this product a <strong>new barcode</strong> — reprint its labels
                after saving. Its SKU updates too unless you&apos;ve set your own.
              </span>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Category
          <input value={form.category} onChange={(e) => set("category", e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          HSN/SAC code
          <HsnCodeSelect
            value={form.hsnCode}
            onChange={(code, rate) => {
              set("hsnCode", code);
              if (rate !== undefined && rate !== null) set("gstRate", String(rate));
            }}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          GST rate
          <GstRateSelect value={form.gstRate} onChange={(rate) => set("gstRate", rate)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Unit (for GST returns)
          <UqcSelect value={form.uqc} onChange={(uqc) => set("uqc", uqc)} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          MRP (incl. GST)
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.mrp}
            onChange={(e) => set("mrp", e.target.value)}
            placeholder="Retail price"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Cost price
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.costPrice}
            onChange={(e) => set("costPrice", e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          B2B price (excl. GST)
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.sellingPrice}
            onChange={(e) => set("sellingPrice", e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Low stock at
          <input
            type="number"
            min="0"
            value={form.lowStockThreshold}
            onChange={(e) => set("lowStockThreshold", e.target.value)}
            className="input"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Note
        <textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} className="input" />
      </label>

      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        Active (visible for billing/scanning)
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isLoading ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>
  );
}
