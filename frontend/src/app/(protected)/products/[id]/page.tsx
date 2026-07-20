"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { WifiOff } from "lucide-react";
import { useGetProductQuery, useUpdateProductMutation, useAdjustStockMutation } from "@/lib/redux/features/products/productsApi";
import { BarcodePanel } from "@/components/scanner/BarcodePanel";
import { ExternalBarcodeBadge } from "@/components/ExternalBarcodeBadge";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getOfflineProduct } from "@/lib/offlineDb";
import type { Product } from "@/types/product";

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isOnline = useOnlineStatus();
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
          <BarcodePanel key={`barcode-${product._id}`} productId={product._id} sku={product.sku} ean13={product.ean13} />
          <EditForm
            key={`edit-${product._id}`}
            productId={product._id}
            category={product.category}
            hsnCode={product.hsnCode}
            costPrice={product.costPrice}
            sellingPrice={product.sellingPrice}
            lowStockThreshold={product.lowStockThreshold}
            note={product.note}
            isActive={product.isActive}
          />
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

function EditForm({
  productId,
  category,
  hsnCode,
  costPrice,
  sellingPrice,
  lowStockThreshold,
  note,
  isActive,
}: {
  productId: string;
  category: string;
  hsnCode: string;
  costPrice: number;
  sellingPrice: number;
  lowStockThreshold: number;
  note: string;
  isActive: boolean;
}) {
  const [updateProduct, { isLoading }] = useUpdateProductMutation();
  const [form, setForm] = useState({
    category,
    hsnCode,
    costPrice: String(costPrice),
    sellingPrice: String(sellingPrice),
    lowStockThreshold: String(lowStockThreshold),
    note,
    isActive,
  });
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    await updateProduct({
      id: productId,
      category: form.category,
      hsnCode: form.hsnCode,
      costPrice: Number(form.costPrice),
      sellingPrice: Number(form.sellingPrice),
      lowStockThreshold: Number(form.lowStockThreshold),
      note: form.note,
      isActive: form.isActive,
    }).unwrap();
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-medium text-foreground">Details</h2>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Category
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          HSN/SAC code
          <input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} className="input" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Cost price
          <input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Selling price
          <input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Low stock at
          <input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} className="input" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Note
        <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input" />
      </label>

      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        Active (visible for billing/scanning)
      </label>

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
