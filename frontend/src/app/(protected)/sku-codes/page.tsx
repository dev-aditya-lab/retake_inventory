"use client";

import { useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useDeleteSkuCodeMutation, useListSkuCodesQuery } from "@/lib/redux/features/catalog/catalogApi";
import { useListProductsQuery } from "@/lib/redux/features/products/productsApi";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SkuCodeDialog } from "@/components/catalog/SkuCodeDialog";
import { ProductSkuList } from "@/components/catalog/ProductSkuList";
import { getApiErrorMessage } from "@/lib/apiError";
import type { SkuCode } from "@/types/catalog";

type Tab = "codes" | "products";

export default function SkuCodesPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can manage SKU codes.">
      <SkuPage />
    </RequireRole>
  );
}

function SkuPage() {
  const [tab, setTab] = useState<Tab>("codes");
  const [productSearch, setProductSearch] = useState("");
  const { data: codes } = useListSkuCodesQuery();
  const { data: products } = useListProductsQuery({ status: "all" });

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "codes", label: "Spice codes", count: codes?.length },
    { id: "products", label: "Product SKUs", count: products?.length },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-foreground">SKU codes</h1>
      <p className="mt-1 text-sm text-muted">
        <strong className="font-medium text-foreground">Spice codes</strong> are the short code and barcode ID each spice&apos;s
        products are built from. <strong className="font-medium text-foreground">Product SKUs</strong> lists every
        product&apos;s own SKU.
      </p>

      <div role="tablist" aria-label="SKU views" className="mt-4 grid grid-cols-2 rounded-lg border border-border p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted hover:bg-ink-100"
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 opacity-80">({t.count})</span>}
          </button>
        ))}
      </div>

      {tab === "codes" ? (
        <SkuCodeList
          onShowProducts={(name) => {
            setProductSearch(name);
            setTab("products");
          }}
        />
      ) : (
        <ProductSkuList search={productSearch} onSearchChange={setProductSearch} />
      )}
    </div>
  );
}

function SkuCodeList({ onShowProducts }: { onShowProducts: (spiceName: string) => void }) {
  const { data: codes, isLoading, isError, refetch } = useListSkuCodesQuery();
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; code: SkuCode | null }>({ open: false, code: null });
  const [deleting, setDeleting] = useState<SkuCode | null>(null);

  const q = filter.trim().toLowerCase();
  const visible = codes?.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.skuCode.toLowerCase().includes(q) ||
      String(c.productId).padStart(3, "0").includes(q),
  );

  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Name, SKU code or barcode ID…"
            aria-label="Filter spice codes"
            className="input w-full pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => setDialog({ open: true, code: null })}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus size={16} aria-hidden />
          Add code
        </button>
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted">Loading codes…</p>}
      {isError && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <span className="text-danger">Could not load SKU codes.</span>
          <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
            Try again
          </button>
        </div>
      )}
      {visible && visible.length === 0 && <p className="mt-6 text-sm text-muted">No codes match.</p>}

      {visible && visible.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((code) => (
            <li key={code._id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-md bg-chilli-50 font-mono text-sm font-semibold text-chilli-700">
                {code.skuCode}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{code.name}</p>
                <p className="truncate text-xs text-muted">
                  ID {String(code.productId).padStart(3, "0")}
                  {code.category && ` · ${code.category}`}
                </p>
                <button
                  type="button"
                  onClick={() => onShowProducts(code.name)}
                  disabled={code.productCount === 0}
                  className="text-xs font-medium text-primary hover:underline disabled:text-muted disabled:no-underline"
                >
                  {code.productCount} product SKU{code.productCount === 1 ? "" : "s"}
                  {code.productCount > 0 && " →"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDialog({ open: true, code })}
                aria-label={`Edit ${code.name}`}
                className="rounded-md p-2 text-muted hover:bg-ink-100 hover:text-foreground"
              >
                <Pencil size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(code)}
                aria-label={`Delete ${code.name}`}
                className="rounded-md p-2 text-danger hover:bg-chilli-50"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <SkuCodeDialog
        open={dialog.open}
        code={dialog.code}
        allCodes={codes ?? []}
        onClose={() => setDialog({ open: false, code: null })}
      />
      <DeleteSkuCodeDialog code={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function DeleteSkuCodeDialog({ code, onClose }: { code: SkuCode | null; onClose: () => void }) {
  const [deleteSkuCode, { isLoading }] = useDeleteSkuCodeMutation();
  const [error, setError] = useState<string | null>(null);
  const inUse = (code?.productCount ?? 0) > 0;

  function close() {
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!code) return;
    setError(null);
    try {
      await deleteSkuCode(code._id).unwrap();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete the code — try again."));
    }
  }

  return (
    <ConfirmDialog
      open={!!code}
      title={inUse ? `${code?.name} is in use` : `Delete ${code?.name ?? "code"}?`}
      confirmLabel="Delete code"
      pendingLabel="Deleting…"
      isLoading={isLoading}
      canConfirm={!inUse}
      error={error}
      onConfirm={handleConfirm}
      onClose={close}
      message={
        code &&
        (inUse ? (
          <p>
            {code.productCount} product{code.productCount === 1 ? "" : "s"} still use {code.name}, so it can&apos;t be
            deleted yet. Delete those products from Inventory first.
          </p>
        ) : (
          <p>
            {code.name} ({code.skuCode}, barcode ID {String(code.productId).padStart(3, "0")}) will be removed. New{" "}
            {code.name} products can&apos;t be added until it&apos;s added back.
          </p>
        ))
      }
    />
  );
}
