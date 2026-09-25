"use client";

import { useState, type FormEvent } from "react";
import { Info, Minus, Plus, Trash2 } from "lucide-react";
import { useUpdateInvoiceMutation } from "@/lib/redux/features/invoices/invoicesApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency } from "@/lib/format";
import { gstinStateCode, looksLikeGstin, previewInvoiceTax, type PriceMode } from "@/lib/gstCalc";
import { GST_STATES, SUPPLIER_STATE_CODE } from "@/config/gst";
import { PlaceOfSupplySelect } from "@/components/gst/PlaceOfSupplySelect";
import { BuyerBadge } from "@/components/gst/BuyerBadge";
import type { Invoice } from "@/types/invoice";
import type { Product } from "@/types/product";
import { AddProductPicker, Field } from "./billEditParts";

interface Line {
  product: string;
  name: string;
  /** Extra context for newly added lines ("Powder · 100g"); billed lines only keep their name. */
  detail?: string;
  /** Known for GST bills and newly added products; old pre-GST lines take the product's rate on save. */
  gstRate?: number;
  quantity: string;
  unitPrice: string;
}

// Mirrors the backend's rounding so the preview matches the saved bill.
const round2 = (n: number) => Math.round(n * 100) / 100;
const toNumber = (value: string) => (value.trim() === "" ? NaN : Number(value));

/** Re-expresses a price when the bill switches between MRP (incl. GST) and B2B (excl. GST), keeping what the buyer pays. */
function convertPrice(price: number, gstRate: number, to: PriceMode): number {
  return round2(to === "exclusive" ? price / (1 + gstRate / 100) : price * (1 + gstRate / 100));
}

export function InvoiceEditForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const [updateInvoice, { isLoading: isSaving }] = useUpdateInvoiceMutation();

  const [customer, setCustomer] = useState({
    name: invoice.customer.name ?? "",
    phone: invoice.customer.phone ?? "",
    company: invoice.customer.company ?? "",
    email: invoice.customer.email ?? "",
    address: invoice.customer.address ?? "",
    gstin: invoice.customer.gstin ?? "",
  });
  // Keep an explicit state only if it differs from what "auto" would pick.
  const [stateCode, setStateCode] = useState(() => {
    const saved = invoice.placeOfSupply?.code ?? "";
    const gstin = invoice.customer.gstin ?? "";
    const auto = gstin ? gstinStateCode(gstin) : SUPPLIER_STATE_CODE;
    return saved && saved !== auto ? saved : "";
  });
  const [lines, setLines] = useState<Line[]>(
    invoice.items.map((item) => ({
      product: item.product,
      name: item.name,
      gstRate: item.gstRate,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  );
  const [otherCharges, setOtherCharges] = useState(invoice.otherCharges ? String(invoice.otherCharges) : "");
  const [note, setNote] = useState(invoice.note ?? "");
  const [error, setError] = useState<string | null>(null);

  // Which price list the lines are on is the bill's own choice, made at the
  // counter — the GSTIN doesn't decide it. Bills from before per-line GST never
  // stored one, so they fall back to "has a GSTIN", as they always were billed.
  const [isB2b, setIsB2b] = useState(() =>
    invoice.priceMode ? invoice.priceMode === "exclusive" : (invoice.customer.gstin ?? "").trim() !== "",
  );
  const priceMode: PriceMode = isB2b ? "exclusive" : "inclusive";

  const hasGstin = customer.gstin.trim() !== "";
  const autoState = hasGstin && looksLikeGstin(customer.gstin) ? gstinStateCode(customer.gstin) : SUPPLIER_STATE_CODE;
  const placeOfSupply = stateCode || autoState;
  const supplyType = placeOfSupply === SUPPLIER_STATE_CODE ? "intra" : "inter";

  function toggleB2b(checked: boolean) {
    const nextMode: PriceMode = checked ? "exclusive" : "inclusive";
    if (nextMode !== priceMode) {
      // Switched between the B2B price and MRP: re-express prices so the amount paid stays the same.
      setLines((prev) =>
        prev.map((line) => {
          const price = toNumber(line.unitPrice);
          if (line.gstRate === undefined || !Number.isFinite(price)) return line;
          return { ...line, unitPrice: String(convertPrice(price, line.gstRate, nextMode)) };
        }),
      );
    }
    setIsB2b(checked);
  }

  function setGstin(value: string) {
    setCustomer((c) => ({ ...c, gstin: value.toUpperCase() }));
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function stepQuantity(index: number, step: 1 | -1) {
    const current = Math.max(0, Math.floor(toNumber(lines[index]!.quantity)) || 0);
    updateLine(index, { quantity: String(Math.max(1, current + step)) });
  }

  function addProduct(product: Product): string | null {
    const price = priceMode === "exclusive" ? product.sellingPrice : product.mrp;
    if (!price || price <= 0) return `Set this product's ${priceMode === "exclusive" ? "B2B price" : "MRP"} first.`;
    if (product.gstRate === undefined || product.gstRate === null) return "Set this product's GST rate first.";
    setLines((prev) => {
      const existing = prev.findIndex((line) => line.product === product._id);
      if (existing !== -1) {
        return prev.map((line, i) =>
          i === existing ? { ...line, quantity: String((Math.floor(toNumber(line.quantity)) || 0) + 1) } : line,
        );
      }
      return [
        ...prev,
        {
          product: product._id,
          name: product.name,
          detail: `${product.type} · ${product.weightLabel} · ${product.sku}`,
          gstRate: product.gstRate,
          quantity: "1",
          unitPrice: String(price),
        },
      ];
    });
    return null;
  }

  const allRatesKnown = lines.every((l) => l.gstRate !== undefined);
  const preview = previewInvoiceTax(
    lines.map((l) => ({ quantity: toNumber(l.quantity) || 0, unitPrice: toNumber(l.unitPrice) || 0, gstRate: l.gstRate ?? 0 })),
    priceMode,
    supplyType,
    toNumber(otherCharges) || 0,
  );

  function validate(): string | null {
    if (!customer.name.trim()) return "Customer name is required.";
    if (hasGstin && !looksLikeGstin(customer.gstin)) return "The GSTIN should be 15 characters, like 20ABCDE1234F1Z5.";
    if (!hasGstin && placeOfSupply !== SUPPLIER_STATE_CODE && !customer.address.trim()) {
      return "An out-of-state buyer without a GSTIN needs their address on the bill.";
    }
    if (lines.length === 0) return "A bill needs at least one item — add one, or delete the whole bill instead.";
    for (const line of lines) {
      const qty = toNumber(line.quantity);
      if (!Number.isInteger(qty) || qty < 1) return `Quantity for "${line.name}" must be a whole number of at least 1.`;
      const price = toNumber(line.unitPrice);
      if (!Number.isFinite(price) || price < 0) return `Enter a valid price for "${line.name}".`;
    }
    const charges = toNumber(otherCharges);
    if (otherCharges && (!Number.isFinite(charges) || charges < 0)) return "Other charges can't be negative.";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    try {
      await updateInvoice({
        invoiceNumber: invoice.invoiceNumber,
        customer: {
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          company: customer.company.trim(),
          email: customer.email.trim(),
          address: customer.address.trim(),
          gstin: customer.gstin.trim().toUpperCase(),
          stateCode: stateCode || undefined,
        },
        priceMode,
        items: lines.map((line) => ({
          product: line.product,
          quantity: toNumber(line.quantity),
          unitPrice: toNumber(line.unitPrice),
        })),
        otherCharges: toNumber(otherCharges) || 0,
        note: note.trim(),
      }).unwrap();
      onSaved();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save the bill — try again."));
    }
  }

  const priceLabel = priceMode === "exclusive" ? "Rate excl. GST (₹)" : "MRP incl. GST (₹)";

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Customer</h2>
          <BuyerBadge priceMode={priceMode} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name *">
            <input
              required
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              inputMode="tel"
              value={customer.phone}
              onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="GSTIN (if any)">
            <input
              value={customer.gstin}
              maxLength={15}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="Blank if none"
              className="input uppercase"
            />
          </Field>
          <Field label="Place of supply">
            <PlaceOfSupplySelect value={stateCode} autoCode={autoState} onChange={setStateCode} />
          </Field>
          <Field label="Company">
            <input value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} className="input" />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={customer.email}
              onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} className="input" />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">
          {GST_STATES[placeOfSupply]} · {supplyType === "intra" ? "CGST + SGST" : "IGST"}
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={isB2b}
            onChange={(e) => toggleB2b(e.target.checked)}
            className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary"
          />
          B2B
          <span className="font-normal text-muted">— B2B price + GST; untick for MRP incl. GST (prices convert to keep the amount paid)</span>
        </label>
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Items</h2>
        <p className="mt-0.5 text-xs text-muted">Changing quantities updates stock automatically when you save.</p>

        {lines.length === 0 ? (
          <p className="mt-3 rounded-md bg-surface p-3 text-sm text-muted">No items — add at least one below.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {lines.map((line, index) => {
              const taxed = preview.lines[index];
              return (
                <li key={line.product} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{line.name}</p>
                      <p className="text-xs text-muted">
                        {line.detail ? `${line.detail} · new · ` : ""}
                        {line.gstRate !== undefined ? `GST ${line.gstRate}%` : "GST rate from product on save"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`Remove ${line.name}`}
                      className="-mr-1 rounded-md p-2 text-danger hover:bg-chilli-50"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted">Qty</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => stepQuantity(index, -1)}
                          aria-label="Decrease quantity"
                          className="rounded-md border border-border p-2 text-foreground hover:bg-ink-100"
                        >
                          <Minus size={14} aria-hidden />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(index, { quantity: e.target.value })}
                          aria-label={`Quantity of ${line.name}`}
                          className="input w-16 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => stepQuantity(index, 1)}
                          aria-label="Increase quantity"
                          className="rounded-md border border-border p-2 text-foreground hover:bg-ink-100"
                        >
                          <Plus size={14} aria-hidden />
                        </button>
                      </div>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted">{priceLabel}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                        className="input w-28"
                      />
                    </label>
                    <div className="ml-auto pb-2.5 text-right">
                      <p className="text-sm font-medium text-foreground">{taxed ? formatCurrency(taxed.total) : "—"}</p>
                      {taxed && line.gstRate !== undefined && (
                        <p className="text-xs text-muted">
                          taxable {formatCurrency(taxed.taxableValue)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <AddProductPicker onAdd={addProduct} />
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Charges &amp; note</h2>
        {invoice.payment && (
          <p className="mt-1 rounded-md bg-surface px-3 py-2 text-xs text-muted">
            Paid so far {formatCurrency(invoice.payment.amountPaid)}
            {invoice.payment.balanceDue > 0 && ` · balance ${formatCurrency(invoice.payment.balanceDue)}`}. Changing the bill
            re-works the balance; record or fix payments from the Sales page.
          </p>
        )}
        <Field label={`Other charges — packing/delivery (${priceMode === "exclusive" ? "excl." : "incl."} GST, ₹)`}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={otherCharges}
            onChange={(e) => setOtherCharges(e.target.value)}
            className="input"
          />
        </Field>


        <Field label="Note" className="mt-3">
          <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="input" />
        </Field>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Taxable value</dt>
            <dd className="text-foreground">{formatCurrency(preview.taxableValue)}</dd>
          </div>
          {supplyType === "intra" ? (
            <>
              <div className="flex justify-between">
                <dt className="text-muted">CGST</dt>
                <dd className="text-foreground">{formatCurrency(preview.cgst)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">SGST</dt>
                <dd className="text-foreground">{formatCurrency(preview.sgst)}</dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <dt className="text-muted">IGST</dt>
              <dd className="text-foreground">{formatCurrency(preview.igst)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
            <dt className="text-foreground">Grand total</dt>
            <dd className="text-foreground">{formatCurrency(preview.grandTotal)}</dd>
          </div>
          {preview.grandTotal !== invoice.grandTotal && (
            <p className="text-right text-xs text-muted">was {formatCurrency(invoice.grandTotal)}</p>
          )}
        </dl>
        {!allRatesKnown && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            Some items come from an old pre-GST bill; their tax is worked out from the product&apos;s GST rate when you save.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {isSaving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
