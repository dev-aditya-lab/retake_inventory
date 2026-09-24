"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useListProductsQuery } from "@/lib/redux/features/products/productsApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/types/product";

// Small pieces the bill edit forms (GST and non-GST) share.

/** Search by name/SKU, or scan/type a barcode (a HID scanner types the digits + Enter). */
export function AddProductPicker({ onAdd }: { onAdd: (product: Product) => string | null }) {
  const [query, setQuery] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const search = useDebouncedValue(query.trim());
  const { data: results, isFetching } = useListProductsQuery({ search }, { skip: search.length < 2 });

  function add(product: Product) {
    const failure = onAdd(product);
    setProblem(failure ? `${product.name}: ${failure}` : null);
    if (!failure) setQuery("");
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <label htmlFor="add-product-search" className="text-sm font-medium text-foreground">
        Add a product
      </label>
      <div className="relative mt-1.5">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id="add-product-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Scanner/Enter: add the single exact match straight away, and never submit the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              if (results?.length === 1) add(results[0]!);
            }
          }}
          placeholder="Name, SKU or barcode…"
          className="input w-full pl-9"
        />
      </div>
      {problem && <p className="mt-2 text-sm text-danger">{problem}</p>}
      {search.length >= 2 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
          {isFetching && !results && <li className="p-3 text-sm text-muted">Searching…</li>}
          {results?.length === 0 && <li className="p-3 text-sm text-muted">No products match.</li>}
          {results?.slice(0, 8).map((product) => (
            <li key={product._id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => add(product)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-ink-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {product.name} · {product.type} · {product.weightLabel}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {product.sku} · {product.quantityInStock} in stock
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-foreground">
                  MRP {product.mrp ? formatCurrency(product.mrp) : "—"}
                  <br />
                  B2B {product.sellingPrice ? formatCurrency(product.sellingPrice) : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium text-foreground ${className}`}>
      {label}
      {children}
    </label>
  );
}
