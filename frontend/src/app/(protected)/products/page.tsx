"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Search } from "lucide-react";
import { useListProductsQuery } from "@/lib/redux/features/products/productsApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PRODUCT_TYPES, type ProductType } from "@/types/product";

export default function ProductsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [type, setType] = useState<ProductType | "">("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const search = useDebouncedValue(searchInput);

  const { data: products, isLoading } = useListProductsQuery({
    search: search || undefined,
    type: type || undefined,
    lowStockOnly,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Inventory</h1>
        <Link
          href="/products/new"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus size={16} aria-hidden />
          Add product
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-50">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, SKU or barcode…"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ProductType | "")}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">All types</option>
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          Low stock only
        </label>
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted">Loading products…</p>}
      {!isLoading && products?.length === 0 && <p className="mt-6 text-sm text-muted">No products match.</p>}

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {products?.map((p) => {
          const isLow = p.quantityInStock <= p.lowStockThreshold;
          return (
            <li key={p._id}>
              <Link
                href={`/products/${p._id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 hover:border-primary"
              >
                <Image src={p.image} alt={p.name} width={48} height={48} className="rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.name} · {p.type} · {p.weightLabel}
                  </p>
                  <p className="truncate text-xs text-muted">{p.sku}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                    isLow ? "bg-chilli-100 text-chilli-700" : "bg-leaf-100 text-leaf-700"
                  }`}
                >
                  {p.quantityInStock}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
