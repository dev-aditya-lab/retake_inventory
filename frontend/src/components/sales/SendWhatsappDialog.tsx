"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useSendInvoiceWhatsappMutation } from "@/lib/redux/features/invoices/invoicesApi";
import { useSendNonGstBillWhatsappMutation } from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency } from "@/lib/format";

interface SendableInvoice {
  /** The bill number — an invoice number, or a non-GST bill number. */
  invoiceNumber: string;
  grandTotal: number;
  customer: { name: string; phone?: string };
}

/**
 * Resend a bill on WhatsApp. Prefilled with the number on the bill; staff can
 * type a different one (e.g. the customer wants it on another phone) — that
 * only changes where this message goes, not the number saved on the bill.
 */
export function SendWhatsappDialog({
  invoice,
  onClose,
  kind = "gst",
}: {
  invoice: SendableInvoice | null;
  onClose: () => void;
  /** Which kind of bill this is — each is sent through its own endpoint. */
  kind?: "gst" | "non_gst";
}) {
  return (
    <Modal open={!!invoice} onClose={onClose} title="Send bill on WhatsApp" size="sm">
      {/* Keyed so the form resets for each bill. */}
      {invoice && <SendForm key={invoice.invoiceNumber} invoice={invoice} kind={kind} onClose={onClose} />}
    </Modal>
  );
}

function SendForm({ invoice, kind, onClose }: { invoice: SendableInvoice; kind: "gst" | "non_gst"; onClose: () => void }) {
  const [sendInvoiceWhatsapp, { isLoading: isSendingInvoice }] = useSendInvoiceWhatsappMutation();
  const [sendBillWhatsapp, { isLoading: isSendingBill }] = useSendNonGstBillWhatsappMutation();
  const isLoading = isSendingInvoice || isSendingBill;
  const [phone, setPhone] = useState(invoice.customer.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const target = phone.trim();
    if (target.replace(/\D/g, "").length < 10) {
      setError("Enter a 10-digit mobile number.");
      return;
    }
    try {
      const isDifferent = target !== (invoice.customer.phone ?? "").trim();
      const phoneOverride = isDifferent ? target : undefined;
      if (kind === "gst") await sendInvoiceWhatsapp({ invoiceNumber: invoice.invoiceNumber, phone: phoneOverride }).unwrap();
      else await sendBillWhatsapp({ billNumber: invoice.invoiceNumber, phone: phoneOverride }).unwrap();
      setSentTo(target);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not send on WhatsApp — try again."));
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <CheckCircle2 size={36} className="text-success" aria-hidden />
        <p className="text-sm text-foreground">
          Bill {invoice.invoiceNumber} sent to <span className="font-medium">{sentTo}</span>.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="rounded-md bg-surface p-3 text-sm">
        <p className="font-medium text-foreground">{invoice.invoiceNumber}</p>
        <p className="text-muted">
          {invoice.customer.name} · {formatCurrency(invoice.grandTotal)}
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        WhatsApp number
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
          className="input"
        />
        {!invoice.customer.phone && (
          <span className="text-xs font-normal text-muted">This bill has no phone number — enter one to send to.</span>
        )}
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="flex items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground disabled:opacity-60"
      >
        <MessageCircle size={16} aria-hidden />
        {isLoading ? "Sending…" : "Send on WhatsApp"}
      </button>
    </form>
  );
}
