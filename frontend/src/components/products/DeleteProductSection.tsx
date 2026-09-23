"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useDeleteProductMutation } from "@/lib/redux/features/products/productsApi";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getApiErrorMessage } from "@/lib/apiError";
import type { Product } from "@/types/product";

/** Admin-only permanent delete, with deactivation offered as the softer option. */
export function DeleteProductSection({ product }: { product: Product }) {
  const router = useRouter();
  const [deleteProduct, { isLoading }] = useDeleteProductMutation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      await deleteProduct(product._id).unwrap();
      router.replace("/products");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete the product — try again."));
    }
  }

  return (
    <div className="rounded-lg border border-chilli-200 bg-background p-4">
      <h2 className="text-sm font-medium text-foreground">Delete product</h2>
      <p className="mt-1 text-xs text-muted">
        Permanently removes it from inventory. To just hide it from billing, untick &ldquo;Active&rdquo; above instead.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1.5 rounded-md border border-chilli-300 px-3 py-2 text-sm font-medium text-danger hover:bg-chilli-50"
      >
        <Trash2 size={16} aria-hidden />
        Delete product
      </button>

      <ConfirmDialog
        open={open}
        title="Delete this product?"
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        isLoading={isLoading}
        error={error}
        onConfirm={handleConfirm}
        onClose={() => {
          setError(null);
          setOpen(false);
        }}
        message={
          <div className="flex flex-col gap-2">
            <p>
              <span className="font-medium">
                {product.name} · {product.type} · {product.weightLabel}
              </span>{" "}
              ({product.sku})
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Its {product.quantityInStock} units in stock and its stock history are removed.</li>
              <li>Past bills are not affected — they keep the product&apos;s name and price.</li>
              <li>This can&apos;t be undone.</li>
            </ul>
          </div>
        }
      />
    </div>
  );
}
