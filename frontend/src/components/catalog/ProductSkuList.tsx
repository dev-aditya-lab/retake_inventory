"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  useDeleteProductMutation,
  useListProductsQuery,
  useUpdateProductMutation,
} from "@/lib/redux/features/products/productsApi";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ExternalBarcodeBadge } from "@/components/ExternalBarcodeBadge";
import { getApiErrorMessage } from "@/lib/apiError";
import type { Product } from "@/types/product";

const PAGE_SIZE = 60;

/**
 * Every product's own SKU (active and inactive) in one searchable list, with
 * edit and delete. Complements the spice-level code list: a code like "TUR"
 * builds many product SKUs (RTK-TUR-WH-025, RTK-TUR-PW-100, …).
 */
export function ProductSkuList({ search, onSearchChange }: { search: string; onSearchChange: (value: string) => void }) {
  const { data: products, isLoading, isError, refetch } = useListProductsQuery({ status: "all" });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const q = search.trim().toLowerCase();
  const matches = products?.filter(
    (p) =>
      !q ||
      p.sku.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.ean13.includes(q) ||
      `${p.type} ${p.weightLabel}`.toLowerCase().includes(q),
  );

  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="SKU, product name, type, weight or barcode…"
            aria-label="Search product SKUs"
            className="input w-full pl-9"
          />
        </div>
        <Link
          href="/products/new"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus size={16} aria-hidden />
          Add product
        </Link>
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted">Loading product SKUs…</p>}
      {isError && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <span className="text-danger">Could not load products.</span>
          <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
            Try again
          </button>
        </div>
      )}
      {matches && (
        <p className="mt-3 text-xs text-muted">
          {q ? `${matches.length} of ${products?.length ?? 0} SKUs match` : `${matches.length} SKUs`}
        </p>
      )}
      {matches && matches.length === 0 && <p className="mt-4 text-sm text-muted">No SKUs match.</p>}

      {matches && matches.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
          {matches.slice(0, visibleCount).map((product) => (
            <li key={product._id} className="flex items-center gap-3 px-3 py-2.5">
              <Link href={`/products/${product._id}`} className="min-w-0 flex-1 hover:opacity-80">
                <p className="flex items-center gap-2 font-mono text-sm font-medium text-foreground">
                  <span className="truncate">{product.sku}</span>
                  {product.barcodeSource === "external" && <ExternalBarcodeBadge />}
                  {!product.isActive && (
                    <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 font-sans text-xs font-medium text-ink-600">
                      Inactive
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  {product.name} · {product.type} · {product.weightLabel} · {product.quantityInStock} in stock
                </p>
              </Link>
              <button
                type="button"
                onClick={() => setEditing(product)}
                aria-label={`Edit SKU ${product.sku}`}
                className="rounded-md p-2 text-muted hover:bg-ink-100 hover:text-foreground"
              >
                <Pencil size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(product)}
                aria-label={`Delete ${product.sku}`}
                className="rounded-md p-2 text-danger hover:bg-chilli-50"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {matches && matches.length > visibleCount && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
          className="mt-3 w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          Show more ({matches.length - visibleCount} left)
        </button>
      )}

      <EditSkuDialog product={editing} onClose={() => setEditing(null)} />
      <DeleteProductDialog product={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function EditSkuDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return (
    <Modal open={!!product} onClose={onClose} title="Edit SKU" size="sm">
      {product && <EditSkuForm key={product._id} product={product} onClose={onClose} />}
    </Modal>
  );
}

function EditSkuForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const [updateProduct, { isLoading }] = useUpdateProductMutation();
  const [sku, setSku] = useState(product.sku);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const next = sku.trim().toUpperCase();
    if (!next) return setError("SKU can't be empty.");
    if (next === product.sku) return onClose();
    try {
      await updateProduct({ id: product._id, sku: next }).unwrap();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save the SKU — try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {product.name} · {product.type} · {product.weightLabel}
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        SKU
        <input
          required
          autoFocus
          value={sku}
          maxLength={40}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          className="input font-mono uppercase"
        />
      </label>
      <p className="text-xs text-muted">Changing the SKU doesn&apos;t change the barcode. Past bills aren&apos;t affected.</p>
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
          disabled={isLoading}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isLoading ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function DeleteProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [deleteProduct, { isLoading }] = useDeleteProductMutation();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!product) return;
    setError(null);
    try {
      await deleteProduct(product._id).unwrap();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete the product — try again."));
    }
  }

  return (
    <ConfirmDialog
      open={!!product}
      title="Delete this product?"
      confirmLabel="Delete permanently"
      pendingLabel="Deleting…"
      isLoading={isLoading}
      error={error}
      onConfirm={handleConfirm}
      onClose={close}
      message={
        product && (
          <div className="flex flex-col gap-2">
            <p>
              <span className="font-mono font-medium">{product.sku}</span> — {product.name} · {product.type} ·{" "}
              {product.weightLabel}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Its {product.quantityInStock} units in stock and its stock history are removed.</li>
              <li>Past bills are not affected.</li>
              <li>This can&apos;t be undone. To just hide it from billing, mark it inactive on its product page.</li>
            </ul>
          </div>
        )
      }
    />
  );
}
