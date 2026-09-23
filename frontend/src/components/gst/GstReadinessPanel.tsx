"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useBulkSetProductGstMutation, useGetGstReadinessQuery } from "@/lib/redux/features/gst/gstApi";
import { HsnCodeSelect } from "@/components/products/HsnCodeSelect";
import { GstRateSelect, UqcSelect } from "@/components/products/GstFields";
import { getApiErrorMessage } from "@/lib/apiError";
import type { ProductGstProblem, ReadinessProduct } from "@/types/gst";

const PROBLEM_LABELS: Record<ProductGstProblem, string> = {
  hsn: "No HSN",
  rate: "No GST rate",
  uqc: "Bad unit",
  mrp: "No MRP",
  b2bPrice: "No B2B price",
};

/** Company registration + every active product's GST details, with one-click bulk fixes. */
export function GstReadinessPanel() {
  const { data, isLoading, isError, refetch } = useGetGstReadinessQuery();

  if (isLoading) return <p className="mt-4 text-sm text-muted">Checking your GST setup…</p>;
  if (isError || !data) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <span className="text-danger">Could not load the GST check.</span>
        <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
          Try again
        </button>
      </div>
    );
  }

  const { supplier, products } = data;
  const blocking = supplier.issues.length + products.missingHsn + products.missingRate + products.badUqc + products.missingMrp;
  const allReady = blocking === 0;

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div
        className={`flex items-start gap-3 rounded-lg border p-4 ${
          allReady ? "border-leaf-200 bg-leaf-50" : "border-amber-300 bg-amber-50"
        }`}
      >
        {allReady ? (
          <CheckCircle2 size={22} className="shrink-0 text-success" aria-hidden />
        ) : (
          <AlertTriangle size={22} className="shrink-0 text-warning" aria-hidden />
        )}
        <div className="text-sm">
          <p className="font-semibold text-foreground">
            {allReady ? "Ready for GST billing" : "A few things to set before every bill is GST-compliant"}
          </p>
          <p className="text-muted">
            {allReady
              ? "Every active product has its HSN code, GST rate, unit and MRP, and your GSTIN checks out."
              : "Products missing an HSN code, GST rate or MRP can't be billed until they're set."}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Your registration</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Legal name</dt>
          <dd className="text-foreground">{supplier.legalName}</dd>
          <dt className="text-muted">GSTIN</dt>
          <dd className="flex items-center gap-1.5 font-mono text-foreground">
            {supplier.gstin}
            {supplier.issues.length === 0 ? (
              <CheckCircle2 size={15} className="text-success" aria-label="valid" />
            ) : (
              <XCircle size={15} className="text-danger" aria-label="invalid" />
            )}
          </dd>
          <dt className="text-muted">State</dt>
          <dd className="text-foreground">
            {supplier.stateName} ({supplier.stateCode})
          </dd>
        </dl>
        {supplier.issues.map((issue) => (
          <p key={issue.message} className="mt-2 text-sm text-danger">
            {issue.message}
          </p>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Products ({products.active} active)</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="No HSN code" value={products.missingHsn} />
          <Stat label="No GST rate" value={products.missingRate} />
          <Stat label="No MRP (retail)" value={products.missingMrp} />
          <Stat label="No B2B price" value={products.missingB2bPrice} hint="only needed for B2B bills" />
        </ul>

        {products.needsWork.length > 0 ? (
          <BulkFixList products={products.needsWork} />
        ) : (
          <p className="mt-3 text-sm text-success">All active products are complete.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <li className={`rounded-md p-2 ${value > 0 ? "bg-amber-50" : "bg-leaf-50"}`}>
      <p className={`text-lg font-semibold ${value > 0 ? "text-warning" : "text-success"}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </li>
  );
}

function BulkFixList({ products }: { products: ReadinessProduct[] }) {
  const [bulkSet, { isLoading }] = useBulkSetProductGstMutation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState("");
  const [uqc, setUqc] = useState("PAC");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const allSelected = selected.size === products.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function handleApply(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (selected.size === 0) return setMessage({ ok: false, text: "Tick the products to update first." });
    if (!hsnCode && !gstRate) return setMessage({ ok: false, text: "Choose an HSN code or GST rate to apply." });
    try {
      const { updated } = await bulkSet({
        productIds: [...selected],
        hsnCode: hsnCode || undefined,
        gstRate: gstRate ? Number(gstRate) : undefined,
        uqc,
      }).unwrap();
      setMessage({ ok: true, text: `Updated ${updated} product(s).` });
      setSelected(new Set());
    } catch (err) {
      setMessage({ ok: false, text: getApiErrorMessage(err, "Could not update the products — try again.") });
    }
  }

  return (
    <div className="mt-4">
      <form onSubmit={handleApply} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
        <p className="text-sm font-medium text-foreground">Set HSN / GST rate for the ticked products</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            HSN code
            <HsnCodeSelect
              value={hsnCode}
              onChange={(code, rate) => {
                setHsnCode(code);
                if (rate !== undefined && rate !== null) setGstRate(String(rate));
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            GST rate
            <GstRateSelect value={gstRate} onChange={setGstRate} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Unit
            <UqcSelect value={uqc} onChange={setUqc} />
          </label>
        </div>
        <p className="text-xs text-muted">
          Missing an HSN code in the list? Add it on the <Link href="/hsn-codes" className="underline">HSN codes</Link> page. Ask your
          CA once which HSN fits each spice — e.g. chilli 0904, cumin/coriander 0909, turmeric/ginger 0910, mixed masalas 0910 91.
        </p>
        {message && <p className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>}
        <button
          type="submit"
          disabled={isLoading || selected.size === 0}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isLoading ? "Applying…" : `Apply to ${selected.size} product(s)`}
        </button>
      </form>

      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(products.map((p) => p._id)))}
            className="h-4 w-4"
          />
          Select all {products.length}
        </label>
      </div>

      <ul className="mt-2 flex max-h-[28rem] flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
        {products.map((product) => (
          <li key={product._id} className="flex items-center gap-3 px-3 py-2">
            <input
              type="checkbox"
              checked={selected.has(product._id)}
              onChange={() => toggle(product._id)}
              aria-label={`Select ${product.name} ${product.weightLabel}`}
              className="h-4 w-4 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <Link href={`/products/${product._id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                {product.name} · {product.type} · {product.weightLabel}
              </Link>
              <p className="truncate font-mono text-xs text-muted">{product.sku}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              {product.problems.map((problem) => (
                <span
                  key={problem}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    problem === "b2bPrice" ? "bg-ink-100 text-ink-600" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {PROBLEM_LABELS[problem]}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
