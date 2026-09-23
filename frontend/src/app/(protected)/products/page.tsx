"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Plus, Search, Upload, WifiOff } from "lucide-react";
import { useListProductsQuery, type ProductStatusFilter } from "@/lib/redux/features/products/productsApi";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useProductOfflineSync } from "@/hooks/useProductOfflineSync";
import { getOfflineProducts, matchesProductFilters } from "@/lib/offlineDb";
import { ExternalBarcodeBadge } from "@/components/ExternalBarcodeBadge";
import { ExportButtons } from "@/components/ExportButtons";
import { ImportProductsPanel } from "@/components/products/ImportProductsPanel";
import { PRODUCT_TYPES, type Product, type ProductType } from "@/types/product";

const CAN_MANAGE_STOCK_ROLES = ["admin", "inventory_manager"];

export default function ProductsPage() {
  const isOnline = useOnlineStatus();
  useProductOfflineSync(); // keeps the IndexedDB catalog cache warm while online
  const searchParams = useSearchParams();
  const { data: currentUser } = useGetMeQuery();
  const canManageStock = !!currentUser && CAN_MANAGE_STOCK_ROLES.includes(currentUser.role);
  const [showImport, setShowImport] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [type, setType] = useState<ProductType | "">("");
  const [lowStockOnly, setLowStockOnly] = useState(searchParams.get("lowStockOnly") === "true");
  // Inactive products are hidden from billing and this list by default; managers can look them up to reactivate.
  const [status, setStatus] = useState<ProductStatusFilter>("active");
  const search = useDebouncedValue(searchInput);
  const filters = { search: search || undefined, type: type || undefined, lowStockOnly };

  const { data: onlineProducts, isLoading: isLoadingOnline } = useListProductsQuery(
    { ...filters, status: status === "active" ? undefined : status },
    { skip: !isOnline },
  );

  const [offlineProducts, setOfflineProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    if (!isOnline) {
      getOfflineProducts().then(setOfflineProducts);
    }
  }, [isOnline]);

  const products = isOnline ? onlineProducts : offlineProducts?.filter((p) => matchesProductFilters(p, filters));
  const isLoading = isOnline ? isLoadingOnline : offlineProducts === null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Inventory</h1>
        <Link
          href="/products/new"
          aria-disabled={!isOnline}
          className={`flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground ${
            !isOnline ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <Plus size={16} aria-hidden />
          Add product
        </Link>
      </div>

      {!isOnline && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <WifiOff size={12} aria-hidden />
          Offline — showing the last synced catalog. Stock counts may be out of date.
        </p>
      )}

      {canManageStock && isOnline && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
          <ExportButtons path="/api/products/export" filenameBase="products" label="Export catalog" />
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100"
          >
            <Upload size={14} aria-hidden />
            Import
          </button>
        </div>
      )}

      {showImport && <ImportProductsPanel onClose={() => setShowImport(false)} />}

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
        {canManageStock && isOnline && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProductStatusFilter)}
            aria-label="Product status"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">Active + inactive</option>
          </select>
        )}
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
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    <span className="truncate">
                      {p.name} · {p.type} · {p.weightLabel}
                    </span>
                    {p.barcodeSource === "external" && <ExternalBarcodeBadge />}
                    {!p.isActive && (
                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
                        Inactive
                      </span>
                    )}
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
