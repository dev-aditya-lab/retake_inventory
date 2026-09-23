"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import { WifiOff } from "lucide-react";
import { useGetProductQuery, useAdjustStockMutation } from "@/lib/redux/features/products/productsApi";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { BarcodePanel } from "@/components/scanner/BarcodePanel";
import { ExternalBarcodeBadge } from "@/components/ExternalBarcodeBadge";
import { ProductEditForm } from "@/components/products/ProductEditForm";
import { DeleteProductSection } from "@/components/products/DeleteProductSection";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getOfflineProduct } from "@/lib/offlineDb";
import type { Product } from "@/types/product";

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isOnline = useOnlineStatus();
  const { data: currentUser } = useGetMeQuery();
  const isAdmin = currentUser?.role === "admin";
  const { data: onlineProduct, isLoading: isLoadingOnline } = useGetProductQuery(id, { skip: !isOnline });

  const [offlineProduct, setOfflineProduct] = useState<Product | null | undefined>(undefined);
  useEffect(() => {
    if (!isOnline) {
      getOfflineProduct(id).then((p) => setOfflineProduct(p ?? null));
    }
  }, [isOnline, id]);

  const product = isOnline ? onlineProduct : (offlineProduct ?? undefined);
  const isLoading = isOnline ? isLoadingOnline : offlineProduct === undefined;

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (!product) return <p className="text-sm text-danger">Product not found.</p>;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center gap-3">
        <Image src={product.image} alt={product.name} width={64} height={64} className="rounded-md object-cover" />
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            {product.name} · {product.type} · {product.weightLabel}
            {product.barcodeSource === "external" && <ExternalBarcodeBadge />}
          </h1>
          <p className="text-sm text-muted">
            SKU {product.sku} · Barcode {product.ean13}
          </p>
        </div>
      </div>

      {!isOnline ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          <WifiOff size={16} aria-hidden />
          Viewing cached details. Stock adjustments, edits, and the barcode panel need a connection.
        </div>
      ) : (
        <>
          <StockCard productId={product._id} quantityInStock={product.quantityInStock} lowStockThreshold={product.lowStockThreshold} />
          <BarcodePanel key={`barcode-${product._id}-${product.ean13}`} productId={product._id} sku={product.sku} ean13={product.ean13} />
          <ProductEditForm key={`edit-${product._id}`} product={product} isAdmin={isAdmin} />
          {isAdmin && <DeleteProductSection product={product} />}
        </>
      )}
    </div>
  );
}

function StockCard({
  productId,
  quantityInStock,
  lowStockThreshold,
}: {
  productId: string;
  quantityInStock: number;
  lowStockThreshold: number;
}) {
  const [adjustStock, { isLoading }] = useAdjustStockMutation();
  const [amount, setAmount] = useState("");
  const isLow = quantityInStock <= lowStockThreshold;

  async function apply(sign: 1 | -1) {
    const change = Number(amount);
    if (!change) return;
    await adjustStock({ id: productId, quantityChange: change * sign, type: sign === 1 ? "restock" : "adjustment" });
    setAmount("");
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Stock</h2>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${isLow ? "bg-chilli-100 text-chilli-700" : "bg-leaf-100 text-leaf-700"}`}>
          {quantityInStock} in stock{isLow ? " · low" : ""}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Quantity"
          className="input flex-1"
        />
        <button
          type="button"
          disabled={isLoading}
          onClick={() => apply(1)}
          className="rounded-md bg-leaf-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          + Restock
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => apply(-1)}
          className="rounded-md bg-chilli-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          − Remove
        </button>
      </div>
    </div>
  );
}
