"use client";

import { useState, type FormEvent } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useUpdateNonGstBillMutation } from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/types/cart";
import type { NonGstBill, PriceList } from "@/types/nonGstBill";
import type { Product } from "@/types/product";
import { AddProductPicker, Field } from "./billEditParts";

interface Line {
  product: string;
  name: string;
  /** Extra context for newly added lines ("Powder · 100g"); billed lines only keep their name. */
  detail?: string;
  quantity: string;
  unitPrice: string;
}

// Mirrors the backend's rounding so the preview matches the saved bill.
const round2 = (n: number) => Math.round(n * 100) / 100;
const toNumber = (value: string) => (value.trim() === "" ? NaN : Number(value));

/** Edit a non-GST bill: customer, items, prices and payment. No tax anywhere — the total is just the lines plus other charges. */
export function NonGstBillEditForm({ bill, onSaved }: { bill: NonGstBill; onSaved: () => void }) {
  const [updateBill, { isLoading: isSaving }] = useUpdateNonGstBillMutation();

  const [customer, setCustomer] = useState({
    name: bill.customer.name ?? "",
    phone: bill.customer.phone ?? "",
    company: bill.customer.company ?? "",
    email: bill.customer.email ?? "",
    address: bill.customer.address ?? "",
  });
  const [priceList, setPriceList] = useState<PriceList>(bill.priceList);
  const [lines, setLines] = useState<Line[]>(
    bill.items.map((item) => ({
      product: item.product,
      name: item.name,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  );
  const [otherCharges, setOtherCharges] = useState(bill.otherCharges ? String(bill.otherCharges) : "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(bill.paymentMethod as PaymentMethod);
  const [note, setNote] = useState(bill.note ?? "");
  const [error, setError] = useState<string | null>(null);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function stepQuantity(index: number, step: 1 | -1) {
    const current = Math.max(0, Math.floor(toNumber(lines[index]!.quantity)) || 0);
    updateLine(index, { quantity: String(Math.max(1, current + step)) });
  }

  function addProduct(product: Product): string | null {
    const price = priceList === "b2b" ? product.sellingPrice : product.mrp;
    if (!price || price <= 0) return `Set this product's ${priceList === "b2b" ? "B2B price" : "MRP"} first.`;
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
          quantity: "1",
          unitPrice: String(price),
        },
      ];
    });
    return null;
  }

  const lineTotals = lines.map((line) => round2((toNumber(line.quantity) || 0) * (toNumber(line.unitPrice) || 0)));
  const subtotal = lineTotals.reduce((sum, total) => round2(sum + total), 0);
  const charges = toNumber(otherCharges) || 0;
  const grandTotal = round2(subtotal + charges);

  function validate(): string | null {
    if (!customer.name.trim()) return "Customer name is required.";
    if (lines.length === 0) return "A bill needs at least one item — add one, or delete the whole bill instead.";
    for (const line of lines) {
      const qty = toNumber(line.quantity);
      if (!Number.isInteger(qty) || qty < 1) return `Quantity for "${line.name}" must be a whole number of at least 1.`;
      const price = toNumber(line.unitPrice);
      if (!Number.isFinite(price) || price < 0) return `Enter a valid price for "${line.name}".`;
    }
    const extra = toNumber(otherCharges);
    if (otherCharges && (!Number.isFinite(extra) || extra < 0)) return "Other charges can't be negative.";
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
      await updateBill({
        billNumber: bill.billNumber,
        customer: {
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          company: customer.company.trim(),
          email: customer.email.trim(),
          address: customer.address.trim(),
        },
        priceList,
        items: lines.map((line) => ({
          product: line.product,
          quantity: toNumber(line.quantity),
          unitPrice: toNumber(line.unitPrice),
        })),
        otherCharges: charges,
        paymentMethod,
        note: note.trim(),
      }).unwrap();
      onSaved();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save the bill — try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Customer</h2>
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
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Items</h2>
        <p className="mt-0.5 text-xs text-muted">Changing quantities updates stock automatically when you save.</p>

        <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={priceList === "b2b"}
            onChange={(e) => setPriceList(e.target.checked ? "b2b" : "retail")}
            className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary"
          />
          B2B
          <span className="font-normal text-muted">— products you add use the B2B price; untick for MRP</span>
        </label>

        {lines.length === 0 ? (
          <p className="mt-3 rounded-md bg-surface p-3 text-sm text-muted">No items — add at least one below.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {lines.map((line, index) => (
              <li key={line.product} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{line.name}</p>
                    {line.detail && <p className="text-xs text-muted">{line.detail} · new</p>}
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
                    <span className="text-xs text-muted">Price (₹)</span>
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
                  <p className="ml-auto pb-2.5 text-right text-sm font-medium text-foreground">
                    {formatCurrency(lineTotals[index] ?? 0)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <AddProductPicker onAdd={addProduct} />
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Payment</h2>
        <Field label="Other charges — packing/delivery (₹)">
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

        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium text-foreground">Payment method</p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={paymentMethod === m.value}
                onClick={() => setPaymentMethod(m.value)}
                className={`rounded-md border px-3 py-2 text-xs font-medium ${
                  paymentMethod === m.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:bg-ink-100"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Note" className="mt-3">
          <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="input" />
        </Field>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Items total</dt>
            <dd className="text-foreground">{formatCurrency(subtotal)}</dd>
          </div>
          {charges > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Other charges</dt>
              <dd className="text-foreground">{formatCurrency(charges)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
            <dt className="text-foreground">Total</dt>
            <dd className="text-foreground">{formatCurrency(grandTotal)}</dd>
          </div>
          {grandTotal !== bill.grandTotal && (
            <p className="text-right text-xs text-muted">was {formatCurrency(bill.grandTotal)}</p>
          )}
        </dl>
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
