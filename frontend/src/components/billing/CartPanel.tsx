"use client";

import { useState } from "react";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { ScannerInput } from "@/components/scanner/ScannerInput";
import { PlaceOfSupplySelect } from "@/components/gst/PlaceOfSupplySelect";
import { BuyerBadge } from "@/components/gst/BuyerBadge";
import {
  useAddCartItemMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useUpdateCartMutation,
  useCheckoutMutation,
} from "@/lib/redux/features/carts/cartsApi";
import { useLazyLookupCustomerQuery } from "@/lib/redux/features/customers/customersApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency } from "@/lib/format";
import { gstinStateCode, looksLikeGstin } from "@/lib/gstCalc";
import { B2C_FULL_DETAILS_THRESHOLD, SUPPLIER_STATE_CODE } from "@/config/gst";
import type { CartData, PaymentMethod } from "@/types/cart";
import { PAYMENT_METHODS } from "@/types/cart";
import type { Invoice } from "@/types/invoice";

/**
 * One billing tab. Every price, tax and total shown comes from the server's
 * preview of the cart (`cart.preview`) — the same GST rules checkout applies —
 * so what the cashier sees is exactly what the tax invoice will say.
 */
export function CartPanel({ cart, onCheckedOut }: { cart: CartData; onCheckedOut: (invoice: Invoice) => void }) {
  const [addItem] = useAddCartItemMutation();
  const [updateItem] = useUpdateCartItemMutation();
  const [removeItem] = useRemoveCartItemMutation();
  const [updateCart] = useUpdateCartMutation();
  const [checkout, { isLoading: isCheckingOut }] = useCheckoutMutation();
  const [scanError, setScanError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const preview = cart.preview;
  const lineById = new Map(preview?.lines.map((line) => [line.productId, line]) ?? []);
  const isIntra = (preview?.supplyType ?? "intra") === "intra";
  const problems = preview?.problems ?? [];

  async function handleScan(code: string) {
    setScanError(null);
    try {
      await addItem({ id: cart.id, ean13: code, quantity: 1 }).unwrap();
    } catch (err) {
      setScanError(getApiErrorMessage(err, `Could not find a product for "${code}"`));
    }
  }

  async function handleCheckout() {
    setCheckoutError(null);
    try {
      const invoice = await checkout(cart.id).unwrap();
      onCheckedOut(invoice);
    } catch (err) {
      setCheckoutError(getApiErrorMessage(err, "Could not complete the sale — please try again."));
    }
  }

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
            {cart.items.map((item) => {
              const priced = lineById.get(item.productId);
              return (
                <li key={item.productId} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted">
                      {item.sku}
                      {priced &&
                        (preview?.priceMode === "inclusive"
                          ? ` · MRP ${formatCurrency(priced.unitPrice)}`
                          : ` · ${formatCurrency(priced.unitPrice)} + ${priced.gstRate}% GST`)}
                      {!priced && preview && " · can't be billed yet"}
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
                    {priced ? formatCurrency(priced.total) : "—"}
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
              );
            })}
          </ul>
        )}
      </div>

      <CustomerFields
        key={cart.id}
        cart={cart}
        grandTotal={preview?.grandTotal ?? 0}
        onSave={(customer) => updateCart({ id: cart.id, customer })}
      />
      <PaymentFields cart={cart} onSave={(updates) => updateCart({ id: cart.id, ...updates })} />

      {preview && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <BuyerBadge priceMode={preview.priceMode} />
            <span className="text-xs text-muted">
              {preview.placeOfSupply.name} · {isIntra ? "CGST + SGST" : "IGST"}
            </span>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Taxable value</dt>
              <dd className="text-foreground">{formatCurrency(preview.taxableValue)}</dd>
            </div>
            {isIntra ? (
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
            {preview.otherCharges && (
              <p className="text-xs text-muted">Includes other charges of {formatCurrency(preview.otherCharges.total)} (taxed at {preview.otherCharges.gstRate}%).</p>
            )}
            <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
              <dt className="text-foreground">Grand total</dt>
              <dd className="text-foreground">{formatCurrency(preview.grandTotal)}</dd>
            </div>
          </dl>
        </div>
      )}

      {problems.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-foreground">
          {problems.map((problem) => (
            <p key={problem} className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              {problem}
            </p>
          ))}
        </div>
      )}

      {checkoutError && <p className="text-sm text-danger">{checkoutError}</p>}

      <button
        type="button"
        onClick={handleCheckout}
        disabled={isCheckingOut || cart.items.length === 0 || problems.length > 0}
        className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {isCheckingOut ? "Generating invoice…" : "Generate tax invoice"}
      </button>
    </div>
  );
}

function CustomerFields({
  cart,
  grandTotal,
  onSave,
}: {
  cart: CartData;
  grandTotal: number;
  onSave: (customer: CartData["customer"]) => void;
}) {
  const [name, setName] = useState(cart.customer.name ?? "");
  const [phone, setPhone] = useState(cart.customer.phone ?? "");
  const [company, setCompany] = useState(cart.customer.company ?? "");
  const [gstin, setGstin] = useState(cart.customer.gstin ?? "");
  const [address, setAddress] = useState(cart.customer.address ?? "");
  const [lookupCustomer] = useLazyLookupCustomerQuery();
  const [returningCustomer, setReturningCustomer] = useState<string | null>(null);

  const stateCode = cart.customer.stateCode ?? "";
  const autoState = looksLikeGstin(gstin) ? gstinStateCode(gstin) : SUPPLIER_STATE_CODE;
  const outOfStateRetail = !gstin.trim() && (stateCode || autoState) !== SUPPLIER_STATE_CODE;
  const needsFullDetails = !gstin.trim() && grandTotal >= B2C_FULL_DETAILS_THRESHOLD;

  function current() {
    return { ...cart.customer, name, phone, company, gstin: gstin.trim().toUpperCase(), address };
  }

  function save() {
    onSave(current());
  }

  // Returning customer: fill in whatever the cashier left blank from the
  // customer directory. Never overwrites anything already typed.
  async function handlePhoneBlur() {
    let details = current();
    if (phone.replace(/\D/g, "").length >= 10) {
      try {
        const found = await lookupCustomer(phone.trim(), true).unwrap();
        setReturningCustomer(found?.name ?? null);
        if (found) {
          details = {
            ...details,
            name: name || found.name,
            company: company || found.company,
            gstin: gstin || found.gstin,
            email: details.email || found.email,
            address: address || found.address,
          };
          setName((v) => v || found.name);
          setCompany((v) => v || found.company);
          setGstin((v) => v || found.gstin);
          setAddress((v) => v || found.address);
        }
      } catch {
        // Lookup is a convenience — billing carries on without it.
      }
    }
    onSave(details);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="mb-2 text-sm font-medium text-foreground">Customer</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} placeholder="Name *" className="input" />
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={handlePhoneBlur}
          placeholder="Phone"
          className="input"
        />
        <input
          value={gstin}
          maxLength={15}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          onBlur={save}
          placeholder="GSTIN (B2B)"
          aria-label="Customer GSTIN — makes this a B2B bill"
          className="input uppercase"
        />
        <input value={company} onChange={(e) => setCompany(e.target.value)} onBlur={save} placeholder="Company" className="input" />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onBlur={save}
          placeholder={outOfStateRetail || needsFullDetails ? "Address *" : "Address"}
          className="input col-span-2"
        />
        <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
          Place of supply
          <PlaceOfSupplySelect
            value={stateCode}
            autoCode={autoState}
            onChange={(code) => onSave({ ...current(), stateCode: code || undefined })}
          />
        </label>
      </div>
      {returningCustomer && (
        <p className="mt-2 text-xs text-success">Returning customer ({returningCustomer}) — saved details filled in.</p>
      )}
      {(outOfStateRetail || needsFullDetails) && !address.trim() && (
        <p className="mt-2 text-xs text-warning">
          {outOfStateRetail
            ? "An out-of-state buyer without a GSTIN needs their address on the bill."
            : `Retail bills of ${formatCurrency(B2C_FULL_DETAILS_THRESHOLD)} or more need the buyer's name and address.`}
        </p>
      )}
    </div>
  );
}

function PaymentFields({
  cart,
  onSave,
}: {
  cart: CartData;
  onSave: (updates: { otherCharges?: number; paymentMethod?: PaymentMethod }) => void;
}) {
  const [otherCharges, setOtherCharges] = useState(String(cart.otherCharges || ""));
  const inclusive = (cart.preview?.priceMode ?? "inclusive") === "inclusive";

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Other charges — packing/delivery ({inclusive ? "incl." : "excl."} GST, ₹)
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
