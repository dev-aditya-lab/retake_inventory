"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCreateProductMutation } from "@/lib/redux/features/products/productsApi";
import { PRODUCT_TYPES, WEIGHT_LABELS, type ProductType } from "@/types/product";

export default function NewProductPage() {
  const router = useRouter();
  const [createProduct, { isLoading }] = useCreateProductMutation();

  const [category, setCategory] = useState("Single Spice");
  const [name, setName] = useState("");
  const [type, setType] = useState<ProductType>("Whole");
  const [weightLabel, setWeightLabel] = useState("100g");
  const [sku, setSku] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const product = await createProduct({
        category,
        name,
        type,
        weightLabel,
        sku,
        hsnCode: hsnCode || undefined,
        costPrice: costPrice ? Number(costPrice) : undefined,
        sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
        note: note || undefined,
      }).unwrap();
      router.push(`/products/${product._id}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "data" in err
          ? (err.data as { message?: string })?.message
          : undefined;
      setError(message ?? "Could not create product — check the details and try again.");
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold text-foreground">Add product</h1>
      <p className="mt-1 text-sm text-muted">
        The product name must match Retake&apos;s barcode scheme (see the product catalog spec) so its
        EAN-13 can be generated automatically.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Field label="Product name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Turmeric, Garam Masala"
            className="input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <input required value={category} onChange={(e) => setCategory(e.target.value)} className="input" />
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as ProductType)} className="input">
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight">
            <select value={weightLabel} onChange={(e) => setWeightLabel(e.target.value)} className="input">
              {WEIGHT_LABELS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
          <Field label="SKU">
            <input
              required
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="RTK-TUR-WH-100"
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost price (₹)">
            <input type="number" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="input" />
          </Field>
          <Field label="Selling price (₹)">
            <input type="number" min="0" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="HSN/SAC code">
          <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} className="input" />
        </Field>

        <Field label="Note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input" />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isLoading ? "Creating…" : "Create product"}
        </button>
      </form>
    </div>
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
