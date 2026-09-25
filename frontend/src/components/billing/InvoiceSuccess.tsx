"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle, Printer, Mail } from "lucide-react";
import { useSendInvoiceWhatsappMutation, useSendInvoiceEmailMutation } from "@/lib/redux/features/invoices/invoicesApi";
import {
  useSendNonGstBillWhatsappMutation,
  useSendNonGstBillEmailMutation,
} from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { formatCurrency, formatDate } from "@/lib/format";
import type { CompletedSale } from "@/types/cart";

type SendStatus = "idle" | "sent" | "error";

/** The parts of a finished sale the success screen shows, whichever kind of bill it is. */
function summarise(sale: CompletedSale) {
  if (sale.kind === "gst") {
    const { invoice } = sale;
    return {
      number: invoice.invoiceNumber,
      label: `Invoice ${invoice.invoiceNumber}`,
      totalLabel: "Grand total",
      customer: invoice.customer,
      itemCount: invoice.items.length,
      grandTotal: invoice.grandTotal,
      amountInWords: invoice.amountInWords,
      payment: invoice.payment,
    };
  }
  const { bill } = sale;
  return {
    number: bill.billNumber,
    label: `Non-GST bill ${bill.billNumber}`,
    totalLabel: "Total",
    customer: bill.customer,
    itemCount: bill.items.length,
    grandTotal: bill.grandTotal,
    amountInWords: bill.amountInWords,
    payment: bill.payment,
  };
}

export function InvoiceSuccess({ sale, onNewSale }: { sale: CompletedSale; onNewSale: () => void }) {
  const [sendInvoiceWhatsapp, { isLoading: isSendingInvoiceWhatsapp }] = useSendInvoiceWhatsappMutation();
  const [sendBillWhatsapp, { isLoading: isSendingBillWhatsapp }] = useSendNonGstBillWhatsappMutation();
  const [sendInvoiceEmail, { isLoading: isSendingInvoiceEmail }] = useSendInvoiceEmailMutation();
  const [sendBillEmail, { isLoading: isSendingBillEmail }] = useSendNonGstBillEmailMutation();
  const [whatsappStatus, setWhatsappStatus] = useState<SendStatus>("idle");
  const [emailStatus, setEmailStatus] = useState<SendStatus>("idle");

  const doc = summarise(sale);
  const isSendingWhatsapp = isSendingInvoiceWhatsapp || isSendingBillWhatsapp;
  const isSendingEmail = isSendingInvoiceEmail || isSendingBillEmail;

  async function handleSendWhatsapp() {
    setWhatsappStatus("idle");
    try {
      if (sale.kind === "gst") await sendInvoiceWhatsapp({ invoiceNumber: doc.number }).unwrap();
      else await sendBillWhatsapp({ billNumber: doc.number }).unwrap();
      setWhatsappStatus("sent");
    } catch {
      setWhatsappStatus("error");
    }
  }

  async function handleSendEmail() {
    setEmailStatus("idle");
    try {
      if (sale.kind === "gst") await sendInvoiceEmail(doc.number).unwrap();
      else await sendBillEmail(doc.number).unwrap();
      setEmailStatus("sent");
    } catch {
      setEmailStatus("error");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center">
      <CheckCircle2 size={40} className="text-success" aria-hidden />
      <h2 className="text-lg font-semibold text-foreground">Sale complete</h2>
      <p className="text-sm text-muted">{doc.label}</p>

      <dl className="w-full space-y-1 text-left text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Customer</dt>
          <dd className="text-foreground">{doc.customer.name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Items</dt>
          <dd className="text-foreground">{doc.itemCount}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt className="text-foreground">{doc.totalLabel}</dt>
          <dd className="text-foreground">₹{doc.grandTotal.toFixed(2)}</dd>
        </div>
        {doc.payment && doc.payment.balanceDue > 0 && (
          <>
            <div className="flex justify-between">
              <dt className="text-muted">Received now</dt>
              <dd className="text-foreground">{formatCurrency(doc.payment.amountPaid)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold text-chilli-700">
              <dt>Balance due</dt>
              <dd>{formatCurrency(doc.payment.balanceDue)}</dd>
            </div>
            {doc.payment.dueDate && <p className="text-xs text-muted">To be paid by {formatDate(doc.payment.dueDate)}</p>}
          </>
        )}
      </dl>
      <p className="text-xs text-muted">{doc.amountInWords}</p>

      <Link
        href={`/invoice/${doc.number}`}
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
          disabled={isSendingWhatsapp || !doc.customer.phone}
          title={!doc.customer.phone ? "No phone number on this bill" : undefined}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
        >
          <MessageCircle size={16} aria-hidden />
          {isSendingWhatsapp ? "Sending…" : "WhatsApp"}
        </button>
        <button
          type="button"
          onClick={handleSendEmail}
          disabled={isSendingEmail || !doc.customer.email}
          title={!doc.customer.email ? "No email on this bill" : undefined}
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
