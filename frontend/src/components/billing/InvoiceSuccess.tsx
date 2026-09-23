"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle, Printer, Mail } from "lucide-react";
import { useSendInvoiceWhatsappMutation, useSendInvoiceEmailMutation } from "@/lib/redux/features/invoices/invoicesApi";
import type { Invoice } from "@/types/invoice";

type SendStatus = "idle" | "sent" | "error";

export function InvoiceSuccess({ invoice, onNewSale }: { invoice: Invoice; onNewSale: () => void }) {
  const [sendWhatsapp, { isLoading: isSendingWhatsapp }] = useSendInvoiceWhatsappMutation();
  const [sendEmail, { isLoading: isSendingEmail }] = useSendInvoiceEmailMutation();
  const [whatsappStatus, setWhatsappStatus] = useState<SendStatus>("idle");
  const [emailStatus, setEmailStatus] = useState<SendStatus>("idle");

  async function handleSendWhatsapp() {
    setWhatsappStatus("idle");
    try {
      await sendWhatsapp({ invoiceNumber: invoice.invoiceNumber }).unwrap();
      setWhatsappStatus("sent");
    } catch {
      setWhatsappStatus("error");
    }
  }

  async function handleSendEmail() {
    setEmailStatus("idle");
    try {
      await sendEmail(invoice.invoiceNumber).unwrap();
      setEmailStatus("sent");
    } catch {
      setEmailStatus("error");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center">
      <CheckCircle2 size={40} className="text-success" aria-hidden />
      <h2 className="text-lg font-semibold text-foreground">Sale complete</h2>
      <p className="text-sm text-muted">Invoice {invoice.invoiceNumber}</p>

      <dl className="w-full space-y-1 text-left text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Customer</dt>
          <dd className="text-foreground">{invoice.customer.name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Items</dt>
          <dd className="text-foreground">{invoice.items.length}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt className="text-foreground">Grand total</dt>
          <dd className="text-foreground">₹{invoice.grandTotal.toFixed(2)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">{invoice.amountInWords}</p>

      <Link
        href={`/invoice/${invoice.invoiceNumber}`}
        target="_blank"
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100"
      >
        <Printer size={16} aria-hidden />
        View / Print / Download
      </Link>

      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={handleSendWhatsapp}
          disabled={isSendingWhatsapp || !invoice.customer.phone}
          title={!invoice.customer.phone ? "No phone number on this invoice" : undefined}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
        >
          <MessageCircle size={16} aria-hidden />
          {isSendingWhatsapp ? "Sending…" : "WhatsApp"}
        </button>
        <button
          type="button"
          onClick={handleSendEmail}
          disabled={isSendingEmail || !invoice.customer.email}
          title={!invoice.customer.email ? "No email on this invoice" : undefined}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
        >
          <Mail size={16} aria-hidden />
          {isSendingEmail ? "Sending…" : "Email"}
        </button>
      </div>
      {whatsappStatus === "sent" && <p className="text-xs text-success">Sent via WhatsApp</p>}
      {whatsappStatus === "error" && <p className="text-xs text-danger">Could not send WhatsApp — try again.</p>}
      {emailStatus === "sent" && <p className="text-xs text-success">Sent via email</p>}
      {emailStatus === "error" && <p className="text-xs text-danger">Could not send email — try again.</p>}

      <button
        type="button"
        onClick={onNewSale}
        className="mt-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
      >
        Start next sale
      </button>
    </div>
  );
}
