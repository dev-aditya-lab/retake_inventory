import { company } from "@/config/company";
import { HowToPayView } from "./PaymentQr";
import { PAYMENT_METHOD_LABELS, type PaymentEntry, type PaymentSummary } from "@/types/payment";

const money = (n: number) => n.toFixed(2);
const inIndia = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

const STATUS: Record<PaymentSummary["paymentStatus"], { label: string; color: string }> = {
  paid: { label: "PAID", color: "text-leaf-700" },
  partial: { label: "PART PAID", color: "text-amber-700" },
  unpaid: { label: "UNPAID", color: "text-chilli-700" },
  refund_due: { label: "REFUND DUE", color: "text-violet-700" },
};

/**
 * What a bill says about money, on screen and in print: the status, every
 * payment received, what has been paid, and what is still owing by when. It's
 * the customer's receipt too — the WhatsApp link opens this page, so after a
 * payment is recorded they see the new balance. While money is owing it also
 * shows how to pay it: the UPI QR and the bank details.
 */
export function PaymentSummaryView({
  payment,
  entries = [],
  cancelled = false,
}: {
  payment: PaymentSummary;
  entries?: PaymentEntry[];
  cancelled?: boolean;
}) {
  // A cancelled bill nobody paid would only say "PAID".
  if (cancelled && payment.amountPaid === 0) return null;
  const status = STATUS[payment.paymentStatus];
  const sorted = [...entries].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  const showHowToPay = payment.balanceDue > 0 || company.payment.showOnBills === "always";

  return (
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start print:flex-row">
      <div className="w-full rounded-md border border-ink-200 p-3 text-xs sm:w-72 print:break-inside-avoid">
        <div className="flex items-center justify-between">
          <span className="text-ink-500">Payment</span>
          <span className={`text-sm font-bold ${status.color}`}>{status.label}</span>
        </div>

        {sorted.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-ink-600">
            {sorted.map((entry) => (
              <li key={entry._id} className="flex justify-between gap-2">
                <span>
                  {inIndia(entry.receivedAt)} · {PAYMENT_METHOD_LABELS[entry.method] ?? entry.method}
                  {entry.kind === "refund" ? " (refund)" : ""}
                </span>
                <span>
                  {entry.kind === "refund" ? "− " : ""}₹{money(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className={`flex justify-between ${sorted.length > 0 ? "mt-1.5 border-t border-ink-200 pt-1.5" : "mt-1.5"}`}>
          <span className="text-ink-600">Amount paid</span>
          <span>₹{money(payment.amountPaid)}</span>
        </div>

        {payment.balanceDue > 0 && (
          <>
            <div className="mt-0.5 flex justify-between text-sm font-bold">
              <span>Balance due</span>
              <span className="text-chilli-700">₹{money(payment.balanceDue)}</span>
            </div>
            {payment.dueDate && (
              <p className={`mt-0.5 ${payment.overdue ? "font-medium text-chilli-700" : "text-ink-600"}`}>
                Please pay by {inIndia(payment.dueDate)}
                {payment.overdue ? " (overdue)" : ""}
              </p>
            )}
          </>
        )}

        {payment.refundDue > 0 && (
          <div className="mt-0.5 flex justify-between text-sm font-bold">
            <span>Refund due to customer</span>
            <span className="text-violet-700">₹{money(payment.refundDue)}</span>
          </div>
        )}
      </div>
      {showHowToPay && <HowToPayView />}
    </div>
  );
}
