"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import {
  useDeleteInvoicePaymentMutation,
  useGetInvoiceQuery,
  useRecordInvoicePaymentMutation,
  useSetInvoiceDueDateMutation,
} from "@/lib/redux/features/invoices/invoicesApi";
import {
  useDeleteNonGstBillPaymentMutation,
  useGetNonGstBillQuery,
  useRecordNonGstBillPaymentMutation,
  useSetNonGstBillDueDateMutation,
} from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/types/cart";
import { PAYMENT_METHOD_LABELS } from "@/types/payment";

/** Which bill the dialog is about. GST invoices and non-GST bills live in separate places, so the kind matters. */
export interface PaymentsTarget {
  kind: "gst" | "non_gst";
  number: string;
}

const LAST_METHOD_KEY = "retake.lastPaymentMethod";

function loadLastMethod(): PaymentMethod {
  try {
    const saved = localStorage.getItem(LAST_METHOD_KEY);
    return PAYMENT_METHODS.some((m) => m.value === saved) ? (saved as PaymentMethod) : "cash";
  } catch {
    return "cash";
  }
}

/** Today as YYYY-MM-DD in the user's own calendar. */
const todayLocal = () => new Date().toLocaleDateString("en-CA");
/** A due-date instant (midnight India) as YYYY-MM-DD. */
const dayInIndia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * Everything about the money on one bill: what's been paid and what's owing,
 * the history, and a form to record the next payment — an advance, a
 * part-payment, the rest — or a refund. Works for both kinds of bill.
 */
export function PaymentsDialog({ target, isAdmin, onClose }: { target: PaymentsTarget | null; isAdmin: boolean; onClose: () => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title="Payments" size="md">
      {/* Keyed so the form starts fresh for each bill. */}
      {target && <PaymentsBody key={`${target.kind}:${target.number}`} target={target} isAdmin={isAdmin} onClose={onClose} />}
    </Modal>
  );
}

function PaymentsBody({ target, isAdmin, onClose }: { target: PaymentsTarget; isAdmin: boolean; onClose: () => void }) {
  const isGst = target.kind === "gst";
  const invoiceQuery = useGetInvoiceQuery(target.number, { skip: !isGst });
  const billQuery = useGetNonGstBillQuery(target.number, { skip: isGst });
  const [recordInvoice, { isLoading: isRecordingInvoice }] = useRecordInvoicePaymentMutation();
  const [recordBill, { isLoading: isRecordingBill }] = useRecordNonGstBillPaymentMutation();
  const [deleteInvoice, { isLoading: isDeletingInvoice }] = useDeleteInvoicePaymentMutation();
  const [deleteBill, { isLoading: isDeletingBill }] = useDeleteNonGstBillPaymentMutation();
  const [setInvoiceDue, { isLoading: isSettingInvoiceDue }] = useSetInvoiceDueDateMutation();
  const [setBillDue, { isLoading: isSettingBillDue }] = useSetNonGstBillDueDateMutation();

  const query = isGst ? invoiceQuery : billQuery;
  const bill = isGst ? invoiceQuery.data : billQuery.data;
  const payment = bill?.payment;
  const entries = bill?.payments ?? [];
  const cancelled = bill?.status === "void";
  const returned = isGst ? (invoiceQuery.data?.creditedTotal ?? 0) : 0;
  const isBusy = isRecordingInvoice || isRecordingBill || isDeletingInvoice || isDeletingBill || isSettingInvoiceDue || isSettingBillDue;

  // Form state. `amount` stays null until typed, so it follows the balance as it changes.
  const [mode, setMode] = useState<"payment" | "refund">("payment");
  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>(loadLastMethod);
  const [date, setDate] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [dueInput, setDueInput] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (query.isLoading || !bill || !payment) {
    return query.isError ? (
      <p className="text-sm text-danger">Could not load this bill. Close and try again.</p>
    ) : (
      <p className="text-sm text-muted">Loading…</p>
    );
  }

  // Refunds only make sense while money is owed back.
  const effectiveMode: "payment" | "refund" = payment.refundDue > 0 && (mode === "refund" || payment.balanceDue === 0) ? "refund" : "payment";
  const limit = effectiveMode === "refund" ? payment.refundDue : payment.balanceDue;
  const amountText = amount ?? (limit > 0 ? String(limit) : "");
  const dueValue = dueInput ?? (payment.dueDate ? dayInIndia(payment.dueDate) : "");
  const number = target.number;
  const customerName = bill.customer.name;

  async function handleRecord(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const value = Number(amountText);
    if (!Number.isFinite(value) || value <= 0) return setMessage({ tone: "error", text: "Enter an amount greater than zero." });
    if (value > limit + 0.005) {
      return setMessage({ tone: "error", text: `Only ${formatCurrency(limit)} ${effectiveMode === "refund" ? "can be refunded" : "is due"} on this bill.` });
    }
    const body = {
      amount: value,
      method,
      kind: effectiveMode,
      // Today = "now" (the server stamps the time); an earlier day is recorded at noon that day.
      receivedAt: date === todayLocal() ? undefined : new Date(`${date}T12:00:00`).toISOString(),
      note: note.trim() || undefined,
    };
    try {
      if (isGst) await recordInvoice({ invoiceNumber: number, ...body }).unwrap();
      else await recordBill({ billNumber: number, ...body }).unwrap();
      try {
        localStorage.setItem(LAST_METHOD_KEY, method);
      } catch {
        // Remembering the method is a convenience only.
      }
      setMessage({ tone: "ok", text: `${effectiveMode === "refund" ? "Refund" : "Payment"} of ${formatCurrency(value)} recorded.` });
      setAmount(null);
      setNote("");
      setDate(todayLocal());
    } catch (err) {
      setMessage({ tone: "error", text: getApiErrorMessage(err, "Could not record it — try again.") });
    }
  }

  async function handleDelete(paymentId: string) {
    setMessage(null);
    try {
      if (isGst) await deleteInvoice({ invoiceNumber: number, paymentId }).unwrap();
      else await deleteBill({ billNumber: number, paymentId }).unwrap();
      setConfirmingId(null);
      setAmount(null);
      setMessage({ tone: "ok", text: "Entry removed." });
    } catch (err) {
      setMessage({ tone: "error", text: getApiErrorMessage(err, "Could not remove it — try again.") });
    }
  }

  async function handleDueDate(next: string | null) {
    setMessage(null);
    try {
      if (isGst) await setInvoiceDue({ invoiceNumber: number, dueDate: next }).unwrap();
      else await setBillDue({ billNumber: number, dueDate: next }).unwrap();
      setDueInput(null);
      setMessage({ tone: "ok", text: next ? "Due date saved." : "Due date cleared." });
    } catch (err) {
      setMessage({ tone: "error", text: getApiErrorMessage(err, "Could not save the due date — try again.") });
    }
  }

  const sorted = [...entries].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  const settled = payment.balanceDue === 0 && payment.refundDue === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-surface p-3 text-sm">
        <p className="font-medium text-foreground">{number}</p>
        <p className="text-muted">{customerName}</p>
        <dl className="mt-2 space-y-1">
          <div className="flex justify-between">
            <dt className="text-muted">Bill total</dt>
            <dd className="text-foreground">{formatCurrency(bill.grandTotal)}</dd>
          </div>
          {returned > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Returned (credit notes)</dt>
              <dd className="text-foreground">− {formatCurrency(returned)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Paid so far</dt>
            <dd className="text-foreground">{formatCurrency(payment.amountPaid)}</dd>
          </div>
          {payment.refundDue > 0 ? (
            <div className="flex justify-between text-base font-semibold">
              <dt className="text-foreground">Refund due to customer</dt>
              <dd className="text-violet-700">{formatCurrency(payment.refundDue)}</dd>
            </div>
          ) : (
            <div className="flex justify-between text-base font-semibold">
              <dt className="text-foreground">Balance due</dt>
              <dd className={payment.balanceDue > 0 ? "text-chilli-700" : "text-leaf-700"}>{formatCurrency(payment.balanceDue)}</dd>
            </div>
          )}
        </dl>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PaymentStatusBadge payment={payment} cancelled={cancelled} />
          {cancelled && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">Bill cancelled</span>}
          {payment.balanceDue > 0 && payment.dueDate && (
            <span className="text-xs text-muted">Due by {formatDate(payment.dueDate)}</span>
          )}
        </div>
      </div>

      {sorted.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground">Payments received</h3>
          <ul className="mt-1 divide-y divide-border rounded-md border border-border">
            {sorted.map((entry) => (
              <li key={entry._id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-foreground">
                    {formatDate(entry.receivedAt)} · {PAYMENT_METHOD_LABELS[entry.method] ?? entry.method}
                    {entry.kind === "refund" && <span className="ml-1 text-violet-700">(refund)</span>}
                  </p>
                  {entry.note && <p className="truncate text-xs text-muted">{entry.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-medium text-foreground">
                    {entry.kind === "refund" ? "− " : ""}
                    {formatCurrency(entry.amount)}
                  </span>
                  {isAdmin &&
                    (confirmingId === entry._id ? (
                      <span className="flex items-center gap-1 text-xs">
                        <button type="button" disabled={isBusy} onClick={() => void handleDelete(entry._id)} className="rounded bg-danger px-2 py-1 font-medium text-white disabled:opacity-60">
                          Remove
                        </button>
                        <button type="button" onClick={() => setConfirmingId(null)} className="rounded px-2 py-1 text-muted hover:bg-ink-100">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(entry._id)}
                        aria-label="Remove this entry"
                        className="rounded p-1 text-muted hover:bg-chilli-50 hover:text-danger"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {settled ? (
        <p className="flex items-center gap-2 rounded-md bg-leaf-50 p-3 text-sm text-foreground">
          <CheckCircle2 size={18} className="shrink-0 text-success" aria-hidden />
          {cancelled ? "This bill was cancelled and nothing is owed either way." : "Fully paid — nothing more to collect."}
        </p>
      ) : (
        <form onSubmit={handleRecord} className="flex flex-col gap-3 rounded-md border border-border p-3">
          {payment.refundDue > 0 && payment.balanceDue > 0 && (
            <div className="inline-flex self-start rounded-md border border-border p-0.5 text-xs">
              {(["payment", "refund"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setAmount(null);
                  }}
                  className={`rounded px-3 py-1.5 font-medium ${effectiveMode === m ? "bg-primary text-primary-foreground" : "text-muted"}`}
                >
                  {m === "payment" ? "Payment received" : "Refund given"}
                </button>
              ))}
            </div>
          )}
          <h3 className="text-sm font-semibold text-foreground">{effectiveMode === "refund" ? "Record a refund" : "Record a payment"}</h3>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            {effectiveMode === "refund" ? "Amount handed back (₹)" : "Amount received (₹)"}
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amountText}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
              required
            />
            <span className="text-xs font-normal text-muted">
              {effectiveMode === "refund" ? "Up to" : "Up to the balance,"} {formatCurrency(limit)}
            </span>
          </label>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">How</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={method === m.value}
                  onClick={() => setMethod(m.value)}
                  className={`rounded-md border px-3 py-2 text-xs font-medium ${
                    method === m.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-ink-100"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Date
              <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value || todayLocal())} className="input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Note (optional)
              <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cheque no." className="input" />
            </label>
          </div>

          {message && (
            <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-danger" : "text-success"}`}>
              {message.text}
            </p>
          )}
          <button type="submit" disabled={isBusy} className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {isBusy ? "Saving…" : effectiveMode === "refund" ? "Record refund" : "Record payment"}
          </button>
        </form>
      )}

      {settled && message && (
        <p role="status" className={`text-sm ${message.tone === "error" ? "text-danger" : "text-success"}`}>
          {message.text}
        </p>
      )}

      {payment.balanceDue > 0 && !cancelled && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-foreground">
            Balance due by
            <input type="date" value={dueValue} min={dayInIndia(bill.billingDate)} onChange={(e) => setDueInput(e.target.value)} className="input" />
          </label>
          <button
            type="button"
            disabled={isBusy || !dueValue || dueValue === (payment.dueDate ? dayInIndia(payment.dueDate) : "")}
            onClick={() => void handleDueDate(dueValue)}
            className="rounded-md border border-border px-3 py-2.5 text-xs font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
          >
            Save date
          </button>
          {payment.dueDate && (
            <button type="button" disabled={isBusy} onClick={() => void handleDueDate(null)} className="rounded-md px-3 py-2.5 text-xs font-medium text-muted hover:bg-ink-100 disabled:opacity-50">
              Clear
            </button>
          )}
        </div>
      )}

      <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100">
        Done
      </button>
    </div>
  );
}
