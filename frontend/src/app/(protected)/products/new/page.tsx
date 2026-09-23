"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tag } from "lucide-react";
import { useCreateProductMutation, useLazyDecodeBarcodeQuery } from "@/lib/redux/features/products/productsApi";
import { useListSkuCodesQuery } from "@/lib/redux/features/catalog/catalogApi";
import { ScannerInput } from "@/components/scanner/ScannerInput";
import { HsnCodeSelect } from "@/components/products/HsnCodeSelect";
import { GstRateSelect, UqcSelect } from "@/components/products/GstFields";
import { getApiErrorMessage } from "@/lib/apiError";
import { PRODUCT_TYPES, WEIGHT_LABELS, type ProductType } from "@/types/product";

const EAN13_SHAPE = /^\d{13}$/;

function isProductType(value: string | null): value is ProductType {
  return !!value && (PRODUCT_TYPES as string[]).includes(value);
}

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createProduct, { isLoading }] = useCreateProductMutation();

  const [category, setCategory] = useState("Single Spice");
  const [name, setName] = useState(searchParams.get("name") ?? "");
  const [type, setType] = useState<ProductType>(
    isProductType(searchParams.get("type")) ? (searchParams.get("type") as ProductType) : "Whole",
  );
  const [weightLabel, setWeightLabel] = useState(searchParams.get("weightLabel") ?? "100g");
  const [sku, setSku] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [mrp, setMrp] = useState("");
  // Spices and masalas are 5% GST; the HSN pick below can change it.
  const [gstRate, setGstRate] = useState("5");
  const [uqc, setUqc] = useState("PAC");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [externalBarcode, setExternalBarcode] = useState<string | null>(
    EAN13_SHAPE.test(searchParams.get("barcode") ?? "") ? searchParams.get("barcode") : null,
  );
  const [decodeBarcode] = useLazyDecodeBarcodeQuery();
  const { data: skuCodes } = useListSkuCodesQuery();

  // Picking a known spice fills in its category from the SKU code list.
  function handleNameChange(value: string) {
    setName(value);
    const match = skuCodes?.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
    if (match?.category) setCategory(match.category);
  }
  const nameIsKnown = !!skuCodes?.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());

  async function handleScanToPrefill(code: string) {
    setScanError(null);
    try {
      const decoded = await decodeBarcode(code).unwrap();
      setExternalBarcode(null);
      setName(decoded.productName);
      setType(decoded.type);
      setWeightLabel(decoded.weightLabel);
    } catch {
      if (EAN13_SHAPE.test(code)) {
        // Well-formed EAN-13, just not Retake's scheme — treat as a third-party product's own barcode.
        setExternalBarcode(code);
      } else {
        setScanError(`"${code}" isn't a valid barcode — fill in the details manually.`);
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const product = await createProduct({
        category,
        name,
        type,
        weightLabel,
        barcode: externalBarcode ?? undefined,
        sku: sku || undefined,
        hsnCode: hsnCode || undefined,
        costPrice: costPrice ? Number(costPrice) : undefined,
        sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
        mrp: mrp ? Number(mrp) : undefined,
        gstRate: gstRate ? Number(gstRate) : undefined,
        uqc,
        note: note || undefined,
      }).unwrap();
      router.push(`/products/${product._id}`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not create product — check the details and try again."));
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold text-foreground">Add product</h1>
      {externalBarcode ? (
        <p className="mt-1 text-sm text-muted">
          Not one of Retake&apos;s own products — the scanned code will be used as its barcode as-is.
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">
          Pick a name from the SKU code list so its SKU and EAN-13 barcode can be generated automatically. New
          spice? An admin adds it on the SKU codes page first.
        </p>
      )}

      {externalBarcode && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Tag size={16} aria-hidden />
            External barcode: {externalBarcode}
          </div>
          <button
            type="button"
            onClick={() => setExternalBarcode(null)}
            className="text-xs font-medium text-muted underline"
          >
            Remove
          </button>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-surface p-3">
        <p className="mb-2 text-sm font-medium text-foreground">Scan to prefill</p>
        <ScannerInput onScan={handleScanToPrefill} autoFocus={false} />
        {scanError && <p className="mt-2 text-sm text-danger">{scanError}</p>}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <Field label="Product name">
          <input
            required
            list={externalBarcode ? undefined : "sku-code-names"}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Turmeric, Garam Masala"
            className="input"
          />
          {!externalBarcode && (
            <datalist id="sku-code-names">
              {skuCodes?.map((c) => (
                <option key={c._id} value={c.name} />
              ))}
            </datalist>
          )}
          {!externalBarcode && name.trim() && skuCodes && !nameIsKnown && (
            <span className="text-xs font-normal text-warning">
              &ldquo;{name.trim()}&rdquo; isn&apos;t in the SKU code list — the product can&apos;t get a barcode until it is.
            </span>
          )}
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
          <Field label={externalBarcode ? "SKU" : "SKU (optional)"}>
            <input
              required={!!externalBarcode}
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder={externalBarcode ? "EXT-..." : "Auto-generated if left blank"}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="MRP, incl. GST (₹)">
            <input type="number" min="0" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="Retail price" className="input" />
          </Field>
          <Field label="B2B price, excl. GST (₹)">
            <input type="number" min="0" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="Cost price (₹)">
          <input type="number" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="input" />
        </Field>

        <Field label="HSN/SAC code">
          <HsnCodeSelect
            value={hsnCode}
            onChange={(code, rate) => {
              setHsnCode(code);
              if (rate !== undefined && rate !== null) setGstRate(String(rate));
            }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="GST rate">
            <GstRateSelect value={gstRate} onChange={setGstRate} />
          </Field>
          <Field label="Unit (for GST returns)">
            <UqcSelect value={uqc} onChange={setUqc} />
          </Field>
        </div>

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
