"use client";

import { useState } from "react";
import { AlertTriangle, Minus, Plus, QrCode, Trash2 } from "lucide-react";
import { ScannerInput } from "@/components/scanner/ScannerInput";
import { PlaceOfSupplySelect } from "@/components/gst/PlaceOfSupplySelect";
import { BuyerBadge } from "@/components/gst/BuyerBadge";
import { PaymentQrDialog } from "@/components/payments/PaymentQr";
import {
  useAddCartItemMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useUpdateCartMutation,
  useCheckoutMutation,
  useCheckoutNonGstMutation,
} from "@/lib/redux/features/carts/cartsApi";
import { useLazyLookupCustomerQuery } from "@/lib/redux/features/customers/customersApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency, formatDate } from "@/lib/format";
import { gstinStateCode, looksLikeGstin } from "@/lib/gstCalc";
import { B2C_FULL_DETAILS_THRESHOLD, SUPPLIER_STATE_CODE } from "@/config/gst";
import type { CartData, CompletedSale, PaymentMethod, PaymentPreview } from "@/types/cart";
import type { Product } from "@/types/product";
import { PAYMENT_METHODS } from "@/types/cart";

type PayMode = "full" | "part" | "later";

/** How the cart is currently set to be paid, read back from what the server has saved. */
const payModeOf = (cart: CartData): PayMode => (cart.amountReceived === undefined ? "full" : cart.amountReceived === 0 ? "later" : "part");

/** What the server should bill as "received now" for what is on screen: null = the whole total. */
const amountReceivedFor = (mode: PayMode, receivedText: string): number | null =>
  mode === "full" ? null : mode === "later" ? 0 : Math.max(0, Number(receivedText) || 0);

/** What a cart line needs to show: its price, its total and — on GST bills — its rate. */
interface PricedLine {
  unitPrice: number;
  total: number;
  gstRate?: number;
}

/**
 * One billing tab. Every price, tax and total shown comes from the server's
 * preview of the cart (`cart.preview`) — the same rules checkout applies — so
 * what the cashier sees is exactly what the bill will say.
 *
 * Two checkboxes shape the bill: "B2B" picks the price list, and "GST
 * applicable" picks the kind of bill. Ticking GST off makes a non-GST bill —
 * a separate bill number, section and records, never part of a GST return.
 */
export function CartPanel({ cart, onCheckedOut }: { cart: CartData; onCheckedOut: (sale: CompletedSale) => void }) {
  const [addItem] = useAddCartItemMutation();
  const [updateItem] = useUpdateCartItemMutation();
  const [removeItem] = useRemoveCartItemMutation();
  const [updateCart] = useUpdateCartMutation();
  // The payment choice lives here (not inside the payment card) so checkout can send exactly what is on screen.
  const [payMode, setPayMode] = useState<PayMode>(() => payModeOf(cart));
  const [receivedText, setReceivedText] = useState(() => (cart.amountReceived ? String(cart.amountReceived) : ""));
  const [checkout, { isLoading: isCheckingOutGst }] = useCheckoutMutation();
  const [checkoutNonGst, { isLoading: isCheckingOutNonGst }] = useCheckoutNonGstMutation();
  const [scanError, setScanError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const gstApplicable = cart.gstApplicable !== false;
  const isCheckingOut = isCheckingOutGst || isCheckingOutNonGst;

  const preview = cart.preview;
  // Narrowed views of the preview: the GST one carries tax, the non-GST one doesn't.
  const gstPreview = preview?.gstApplicable ? preview : undefined;
  const nonGstPreview = preview && !preview.gstApplicable ? preview : undefined;
  const lineById = new Map<string, PricedLine>(preview?.lines.map((line) => [line.productId, line]) ?? []);
  const isIntra = (gstPreview?.supplyType ?? "intra") === "intra";
  const problems = preview?.problems ?? [];

  async function handleScan(code: string) {
    setScanError(null);
    try {
      await addItem({ id: cart.id, ean13: code, quantity: 1 }).unwrap();
    } catch (err) {
      setScanError(getApiErrorMessage(err, `Could not find a product for "${code}"`));
    }
  }

  // Picked from the typed-search list (a barcode that wouldn't scan): add the product directly.
  async function handlePickProduct(product: Product) {
    setScanError(null);
    try {
      await addItem({ id: cart.id, productId: product._id, quantity: 1 }).unwrap();
    } catch (err) {
      setScanError(getApiErrorMessage(err, `Could not add "${product.name}"`));
    }
  }

  async function handleCheckout() {
    setCheckoutError(null);
    try {
      // The server bills what it has saved. An amount that was just typed may not have been sent yet
      // (the field's blur can land after this tap), so send it now — money must never depend on that race.
      await updateCart({ id: cart.id, amountReceived: amountReceivedFor(payMode, receivedText) }).unwrap();
      if (gstApplicable) {
        onCheckedOut({ kind: "gst", invoice: await checkout(cart.id).unwrap() });
      } else {
        onCheckedOut({ kind: "non_gst", bill: await checkoutNonGst(cart.id).unwrap() });
      }
    } catch (err) {
      setCheckoutError(getApiErrorMessage(err, "Could not complete the sale — please try again."));
    }
  }

  function linePriceNote(priced: PricedLine) {
    if (nonGstPreview) return ` · ${nonGstPreview.priceList === "retail" ? "MRP" : "B2B"} ${formatCurrency(priced.unitPrice)}`;
    if (gstPreview?.priceMode === "inclusive") return ` · MRP ${formatCurrency(priced.unitPrice)}`;
    return ` · ${formatCurrency(priced.unitPrice)} + ${priced.gstRate}% GST`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <ScannerInput
          onScan={handleScan}
          onPickProduct={handlePickProduct}
          placeholder="Scan a barcode, or type a name / last digits…"
        />
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
                      {priced && linePriceNote(priced)}
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
        gstApplicable={gstApplicable}
        grandTotal={preview?.grandTotal ?? 0}
        onSave={(customer) => updateCart({ id: cart.id, customer })}
      />
      <PaymentFields
        key={cart.id}
        cart={cart}
        gstApplicable={gstApplicable}
        payMode={payMode}
        receivedText={receivedText}
        onPayModeChange={setPayMode}
        onReceivedTextChange={setReceivedText}
        onSave={(updates) => updateCart({ id: cart.id, ...updates })}
      />
      <BillTypeFields cart={cart} onSave={(updates) => updateCart({ id: cart.id, ...updates })} />

      {gstPreview && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <BuyerBadge priceMode={gstPreview.priceMode} />
            <span className="text-xs text-muted">
              {gstPreview.placeOfSupply.name} · {isIntra ? "CGST + SGST" : "IGST"}
            </span>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Taxable value</dt>
              <dd className="text-foreground">{formatCurrency(gstPreview.taxableValue)}</dd>
            </div>
            {isIntra ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted">CGST</dt>
                  <dd className="text-foreground">{formatCurrency(gstPreview.cgst)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">SGST</dt>
                  <dd className="text-foreground">{formatCurrency(gstPreview.sgst)}</dd>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <dt className="text-muted">IGST</dt>
                <dd className="text-foreground">{formatCurrency(gstPreview.igst)}</dd>
              </div>
            )}
            {gstPreview.otherCharges && (
              <p className="text-xs text-muted">
                Includes other charges of {formatCurrency(gstPreview.otherCharges.total)} (taxed at{" "}
                {gstPreview.otherCharges.gstRate}%).
              </p>
            )}
            <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
              <dt className="text-foreground">Grand total</dt>
              <dd className="text-foreground">{formatCurrency(gstPreview.grandTotal)}</dd>
            </div>
            <BalanceLines payment={gstPreview.payment} />
          </dl>
        </div>
      )}

      {nonGstPreview && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">Non-GST bill</span>
            <span className="text-xs text-muted">{nonGstPreview.priceList === "b2b" ? "B2B price" : "Retail MRP"} · no tax added</span>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Items total</dt>
              <dd className="text-foreground">{formatCurrency(nonGstPreview.subtotal)}</dd>
            </div>
            {nonGstPreview.otherCharges > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Other charges</dt>
                <dd className="text-foreground">{formatCurrency(nonGstPreview.otherCharges)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
              <dt className="text-foreground">Total</dt>
              <dd className="text-foreground">{formatCurrency(nonGstPreview.grandTotal)}</dd>
            </div>
            <BalanceLines payment={nonGstPreview.payment} />
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
        {isCheckingOut
          ? gstApplicable
            ? "Generating invoice…"
            : "Generating bill…"
          : gstApplicable
            ? "Generate tax invoice"
            : "Generate bill (no GST)"}
      </button>
    </div>
  );
}

/**
 * The two choices that shape a bill, kept small and out of the way: one line
 * of checkboxes just above the bill summary. They're independent — B2B only
 * picks the price list, and a GSTIN typed above never flips it.
 */
function BillTypeFields({
  cart,
  onSave,
}: {
  cart: CartData;
  onSave: (updates: { isB2b?: boolean; gstApplicable?: boolean }) => void;
}) {
  const gstApplicable = cart.gstApplicable !== false;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5">
        <CheckboxItem
          checked={cart.isB2b === true}
          onChange={(checked) => onSave({ isB2b: checked })}
          label="B2B"
          title="Bill at the B2B price instead of the retail MRP"
        />
        <CheckboxItem
          checked={gstApplicable}
          onChange={(checked) => onSave({ gstApplicable: checked })}
          label="GST applicable"
          title="Untick to make a non-GST bill"
        />
      </div>
      {!gstApplicable && (
        <p className="text-xs text-muted">Non-GST bill — its own bill number, no tax, kept out of GST returns.</p>
      )}
    </div>
  );
}

function CheckboxItem({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  title: string;
}) {
  return (
    // Vertical padding keeps a comfortable tap area without a big control.
    <label title={title} className="flex cursor-pointer items-center gap-1.5 py-1.5 text-xs font-medium text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary"
      />
      {label}
    </label>
  );
}

function CustomerFields({
  cart,
  gstApplicable,
  grandTotal,
  onSave,
}: {
  cart: CartData;
  gstApplicable: boolean;
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
  // GST-only rules: the buyer's state and the ₹50,000 name-and-address rule mean nothing on a non-GST bill.
  const outOfStateRetail = gstApplicable && !gstin.trim() && (stateCode || autoState) !== SUPPLIER_STATE_CODE;
  const needsFullDetails = gstApplicable && !gstin.trim() && grandTotal >= B2C_FULL_DETAILS_THRESHOLD;

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
        {gstApplicable && (
          <input
            value={gstin}
            maxLength={15}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            onBlur={save}
            placeholder="GSTIN (if any)"
            aria-label="Customer GSTIN — goes on the tax invoice"
            className="input uppercase"
          />
        )}
        <input value={company} onChange={(e) => setCompany(e.target.value)} onBlur={save} placeholder="Company" className="input" />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onBlur={save}
          placeholder={outOfStateRetail || needsFullDetails ? "Address *" : "Address"}
          className="input col-span-2"
        />
        {gstApplicable && (
          <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
            Place of supply
            <PlaceOfSupplySelect
              value={stateCode}
              autoCode={autoState}
              onChange={(code) => onSave({ ...current(), stateCode: code || undefined })}
            />
          </label>
        )}
      </div>
      {returningCustomer && (
        <p className="mt-2 text-xs text-success">Returning customer ({returningCustomer}) — saved details filled in.</p>
      )}
      {gstApplicable && gstin.trim() && cart.isB2b !== true && (
        <p className="mt-2 text-xs text-muted">
          GSTIN added — the GSTIN goes on the invoice, but it&apos;s billed at retail MRP. Tick B2B above for the B2B price.
        </p>
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

/** "Received now" and "Balance due" under a bill's total — only when something is being left owing. */
function BalanceLines({ payment }: { payment: PaymentPreview }) {
  if (payment.balanceDue <= 0) return null;
  return (
    <>
      <div className="flex justify-between">
        <dt className="text-muted">Received now</dt>
        <dd className="text-foreground">{formatCurrency(payment.amountReceived)}</dd>
      </div>
      <div className="flex justify-between text-base font-semibold text-chilli-700">
        <dt>Balance due</dt>
        <dd>{formatCurrency(payment.balanceDue)}</dd>
      </div>
      {payment.dueDate && <p className="text-xs text-muted">To be paid by {formatDate(payment.dueDate)}</p>}
    </>
  );
}

const PAY_MODES: { value: PayMode; label: string }[] = [
  { value: "full", label: "Paid in full" },
  { value: "part", label: "Advance / part" },
  { value: "later", label: "Pay later" },
];
const DUE_DAY_CHOICES = [7, 15, 30];

/** YYYY-MM-DD, `offsetDays` from today, in the user's own calendar. */
const localDay = (offsetDays = 0) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toLocaleDateString("en-CA");
};

function PaymentFields({
  cart,
  gstApplicable,
  payMode,
  receivedText,
  onPayModeChange,
  onReceivedTextChange,
  onSave,
}: {
  cart: CartData;
  gstApplicable: boolean;
  payMode: PayMode;
  receivedText: string;
  onPayModeChange: (mode: PayMode) => void;
  onReceivedTextChange: (text: string) => void;
  onSave: (updates: {
    otherCharges?: number;
    paymentMethod?: PaymentMethod;
    amountReceived?: number | null;
    dueDate?: string | null;
  }) => void;
}) {
  const [otherCharges, setOtherCharges] = useState(String(cart.otherCharges || ""));
  const [showQr, setShowQr] = useState(false);
  const inclusive = cart.isB2b !== true;
  const chargesLabel = gstApplicable
    ? `Other charges — packing/delivery (${inclusive ? "incl." : "excl."} GST, ₹)`
    : "Other charges — packing/delivery (₹)";

  const payment = cart.preview?.payment;
  const grandTotal = cart.preview?.grandTotal ?? 0;
  const balanceDue = payment?.balanceDue ?? 0;
  const handingOverNow = payMode !== "later";

  function chooseMode(mode: PayMode) {
    onPayModeChange(mode);
    if (mode === "full") onSave({ amountReceived: null, dueDate: null });
    // "Part" starts at 0 until an amount is typed, so a forgotten amount shows the whole bill as still owing —
    // never as quietly paid.
    else onSave({ amountReceived: mode === "later" ? 0 : Math.max(0, Number(receivedText) || 0) });
    if (mode === "later") onReceivedTextChange("");
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        {chargesLabel}
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
        <p className="mb-1.5 text-sm font-medium text-foreground">Payment</p>
        <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-background p-0.5" role="group" aria-label="How much is being paid now">
          {PAY_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={payMode === m.value}
              onClick={() => chooseMode(m.value)}
              className={`rounded px-2 py-2 text-xs font-medium ${payMode === m.value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-ink-100"}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {payMode === "part" && (
          <label className="mt-2 flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Amount received now (₹)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              max={grandTotal || undefined}
              value={receivedText}
              onChange={(e) => onReceivedTextChange(e.target.value)}
              onBlur={() => onSave({ amountReceived: amountReceivedFor("part", receivedText) })}
              placeholder="e.g. 500"
              className="input"
            />
          </label>
        )}
      </div>

      {handingOverNow && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Paid by</p>
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-ink-100"
            >
              <QrCode size={14} aria-hidden />
              Show QR
            </button>
          </div>
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
      )}

      <PaymentQrDialog open={showQr} onClose={() => setShowQr(false)} amount={payment && payment.amountReceived > 0 ? payment.amountReceived : undefined} />

      {balanceDue > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-foreground">
            {formatCurrency(balanceDue)} will be left to pay
          </p>
          <p className="mt-0.5 text-xs text-muted">Collect it by (optional):</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {DUE_DAY_CHOICES.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={cart.dueDate === localDay(days)}
                onClick={() => onSave({ dueDate: localDay(days) })}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  cart.dueDate === localDay(days) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-ink-100"
                }`}
              >
                {days} days
              </button>
            ))}
            <input
              type="date"
              value={cart.dueDate ?? ""}
              min={localDay()}
              onChange={(e) => onSave({ dueDate: e.target.value || null })}
              aria-label="Balance due by"
              className="input w-auto py-1.5 text-xs"
            />
            {cart.dueDate && (
              <button type="button" onClick={() => onSave({ dueDate: null })} className="px-1.5 text-xs font-medium text-muted underline">
                Clear
              </button>
            )}
          </div>
          {!cart.customer.phone?.trim() && (
            <p className="mt-2 text-xs text-warning">Add the customer&apos;s phone number so you can follow up on this amount.</p>
          )}
        </div>
      )}
    </div>
  );
}
