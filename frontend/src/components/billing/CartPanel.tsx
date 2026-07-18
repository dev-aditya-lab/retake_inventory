"use client";

import { useState } from "react";
import { Trash2, Minus, Plus } from "lucide-react";
import { ScannerInput } from "@/components/scanner/ScannerInput";
import {
  useAddCartItemMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useUpdateCartMutation,
  useCheckoutMutation,
} from "@/lib/redux/features/carts/cartsApi";
import type { CartData, GstType, PaymentMethod } from "@/types/cart";
import { PAYMENT_METHODS } from "@/types/cart";
import type { Invoice } from "@/types/invoice";

export function CartPanel({ cart, onCheckedOut }: { cart: CartData; onCheckedOut: (invoice: Invoice) => void }) {
  const [addItem] = useAddCartItemMutation();
  const [updateItem] = useUpdateCartItemMutation();
  const [removeItem] = useRemoveCartItemMutation();
  const [updateCart] = useUpdateCartMutation();
  const [checkout, { isLoading: isCheckingOut }] = useCheckoutMutation();
  const [scanError, setScanError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleScan(code: string) {
    setScanError(null);
    try {
      await addItem({ id: cart.id, ean13: code, quantity: 1 }).unwrap();
    } catch (err) {
      const message =
        err && typeof err === "object" && "data" in err ? (err.data as { message?: string })?.message : undefined;
      setScanError(message ?? `Could not find a product for "${code}"`);
    }
  }

  async function handleCheckout() {
    setCheckoutError(null);
    try {
      const invoice = await checkout(cart.id).unwrap();
      onCheckedOut(invoice);
    } catch (err) {
      const message =
        err && typeof err === "object" && "data" in err ? (err.data as { message?: string })?.message : undefined;
      setCheckoutError(message ?? "Could not complete the sale — please try again.");
    }
  }

  const subtotal = cart.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const gstAmount = cart.gst.enabled ? subtotal * (cart.gst.percentage / 100) : 0;
  const grandTotal = subtotal + gstAmount + (cart.otherCharges || 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <ScannerInput onScan={handleScan} placeholder="Scan or type a product barcode…" />
        {scanError && <p className="mt-2 text-sm text-danger">{scanError}</p>}
      </div>

      <div className="rounded-lg border border-border bg-background">
        {cart.items.length === 0 ? (
          <p className="p-4 text-sm text-muted">No items yet — scan a product to add it.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cart.items.map((item) => (
              <li key={item.productId} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted">
                    {item.sku} · ₹{item.unitPrice.toFixed(2)} each
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateItem({ id: cart.id, productId: item.productId, quantity: item.quantity - 1 })}
                    className="rounded-md border border-border p-1.5 text-foreground hover:bg-ink-100"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateItem({ id: cart.id, productId: item.productId, quantity: item.quantity + 1 })}
                    className="rounded-md border border-border p-1.5 text-foreground hover:bg-ink-100"
                    aria-label="Increase quantity"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <p className="w-20 shrink-0 text-right text-sm font-medium text-foreground">
                  ₹{(item.quantity * item.unitPrice).toFixed(2)}
                </p>
                <button
                  type="button"
                  onClick={() => removeItem({ id: cart.id, productId: item.productId })}
                  className="shrink-0 text-danger hover:opacity-70"
                  aria-label="Remove item"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CustomerFields cart={cart} onSave={(customer) => updateCart({ id: cart.id, customer })} />
      <GstAndPaymentFields cart={cart} onSave={(updates) => updateCart({ id: cart.id, ...updates })} />

      <div className="rounded-lg border border-border bg-surface p-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="text-foreground">₹{subtotal.toFixed(2)}</dd>
          </div>
          {cart.gst.enabled && (
            <div className="flex justify-between">
              <dt className="text-muted">GST ({cart.gst.percentage}%)</dt>
              <dd className="text-foreground">₹{gstAmount.toFixed(2)}</dd>
            </div>
          )}
          {cart.otherCharges > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Other charges</dt>
              <dd className="text-foreground">₹{cart.otherCharges.toFixed(2)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
            <dt className="text-foreground">Grand total</dt>
            <dd className="text-foreground">₹{grandTotal.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      {checkoutError && <p className="text-sm text-danger">{checkoutError}</p>}

      <button
        type="button"
        onClick={handleCheckout}
        disabled={isCheckingOut || cart.items.length === 0}
        className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {isCheckingOut ? "Generating invoice…" : "Generate invoice"}
      </button>
    </div>
  );
}

function CustomerFields({
  cart,
  onSave,
}: {
  cart: CartData;
  onSave: (customer: CartData["customer"]) => void;
}) {
  const [name, setName] = useState(cart.customer.name ?? "");
  const [phone, setPhone] = useState(cart.customer.phone ?? "");
  const [company, setCompany] = useState(cart.customer.company ?? "");
  const [gstin, setGstin] = useState(cart.customer.gstin ?? "");

  function save() {
    onSave({ ...cart.customer, name, phone, company, gstin });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="mb-2 text-sm font-medium text-foreground">Customer (optional)</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} placeholder="Name" className="input" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={save} placeholder="Phone" className="input" />
        <input value={company} onChange={(e) => setCompany(e.target.value)} onBlur={save} placeholder="Company" className="input" />
        <input value={gstin} onChange={(e) => setGstin(e.target.value)} onBlur={save} placeholder="GSTIN" className="input" />
      </div>
    </div>
  );
}

function GstAndPaymentFields({
  cart,
  onSave,
}: {
  cart: CartData;
  onSave: (updates: { gst?: CartData["gst"]; otherCharges?: number; paymentMethod?: PaymentMethod }) => void;
}) {
  const [percentage, setPercentage] = useState(String(cart.gst.percentage || 5));
  const [otherCharges, setOtherCharges] = useState(String(cart.otherCharges || ""));

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={cart.gst.enabled}
          onChange={(e) =>
            onSave({ gst: { enabled: e.target.checked, type: cart.gst.type ?? "CGST_SGST", percentage: Number(percentage) } })
          }
        />
        Apply GST
      </label>

      {cart.gst.enabled && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            value={cart.gst.type ?? "CGST_SGST"}
            onChange={(e) => onSave({ gst: { ...cart.gst, type: e.target.value as GstType } })}
            className="input"
          >
            <option value="CGST_SGST">CGST + SGST (same state)</option>
            <option value="IGST">IGST (other state)</option>
          </select>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            onBlur={() => onSave({ gst: { ...cart.gst, percentage: Number(percentage) || 0 } })}
            placeholder="GST %"
            className="input"
          />
        </div>
      )}

      <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Other charges (₹)
        <input
          type="number"
          min="0"
          step="0.01"
          value={otherCharges}
          onChange={(e) => setOtherCharges(e.target.value)}
          onBlur={() => onSave({ otherCharges: Number(otherCharges) || 0 })}
          className="input"
        />
      </label>

      <div className="mt-3">
        <p className="mb-1.5 text-sm font-medium text-foreground">Payment method</p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onSave({ paymentMethod: m.value })}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                cart.paymentMethod === m.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground hover:bg-ink-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
