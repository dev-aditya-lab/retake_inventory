"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { company } from "@/config/company";
import { formatCurrency } from "@/lib/format";

const { accountName, accountNumber, ifsc, upiId, bigQrUrl, smallQrUrl } = company.payment;

const DETAILS: { label: string; value: string }[] = [
  { label: "Account name", value: accountName },
  { label: "Account number", value: accountNumber },
  { label: "IFSC", value: ifsc },
  { label: "UPI ID", value: upiId },
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure page and permission — the value is on screen to read out instead.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
      className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-ink-100"
    >
      {copied ? <Check size={13} className="text-success" aria-hidden /> : <Copy size={13} aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** The bank account and UPI ID, each with a copy button — for a customer paying by bank transfer instead of the QR. */
export function PaymentDetails() {
  return (
    <dl className="w-full divide-y divide-border rounded-md border border-border text-sm">
      {DETAILS.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="break-all font-medium text-foreground">{value}</dd>
          </div>
          <CopyButton value={value} label={label} />
        </div>
      ))}
    </dl>
  );
}

/**
 * What staff show a customer to take a payment: the big UPI QR, the amount to
 * ask for, and the account details as a fallback. The QR is a fixed merchant
 * code with no amount inside, so the customer types the amount — shown large
 * above it. Served from /public, which the service worker keeps, so it still
 * opens with no signal in the market.
 */
export function PaymentQrPanel({ amount }: { amount?: number }) {
  return (
    <div className="flex flex-col items-center gap-4">
      {amount !== undefined && amount > 0 && (
        <div className="text-center">
          <p className="text-sm text-muted">Customer pays</p>
          <p className="text-3xl font-bold text-foreground">{formatCurrency(amount)}</p>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- a static file from /public, kept by the service worker for offline use */}
      <img src={bigQrUrl} alt="Payment QR code — scan with any UPI app" width={1200} height={1600} className="h-auto w-full max-w-xs rounded-xl" />
      <p className="text-center text-xs text-muted">
        Scan with any UPI app{amount ? ` and enter ${formatCurrency(amount)}` : ""}. When it&apos;s paid, check the credit in your
        slice app or SMS, then record it as a UPI payment.
      </p>
      <PaymentDetails />
    </div>
  );
}

/** The payment QR in a pop-up — opened from the billing counter and from a bill's payments. */
export function PaymentQrDialog({ open, onClose, amount }: { open: boolean; onClose: () => void; amount?: number }) {
  return (
    <Modal open={open} onClose={onClose} title="Payment QR" size="sm">
      <PaymentQrPanel amount={amount} />
    </Modal>
  );
}

/**
 * "How to pay" for a bill (on screen and in print): the small QR and the bank
 * details, so a customer can settle what's owing straight from the bill.
 */
export function HowToPayView() {
  return (
    <div className="w-full rounded-md border border-ink-200 p-3 text-xs sm:w-72 print:break-inside-avoid">
      <p className="text-ink-500">Pay by UPI or bank transfer</p>
      <div className="mt-2 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static QR from /public; must be loaded before window.print() */}
        <img src={smallQrUrl} alt="UPI payment QR code" width={96} height={95} className="h-24 w-24 shrink-0 bg-white p-1" />
        <dl className="min-w-0 space-y-0.5">
          <p className="text-ink-500">Scan with any UPI app</p>
          {DETAILS.map(({ label, value }) => (
            <div key={label}>
              <dt className="inline text-ink-500">{label.replace("Account number", "Account no.")}: </dt>
              <dd className="inline break-all font-medium text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
