import { formatCurrency } from "@/lib/format";
import type { PaymentSummary } from "@/types/payment";

/**
 * One small pill saying where a bill stands on money: Paid, Part paid (₹X
 * due), Unpaid (₹X due), Overdue, or Refund due. Nothing for a cancelled bill
 * that never took money — it would only say "Paid".
 */
export function PaymentStatusBadge({ payment, cancelled = false }: { payment: PaymentSummary; cancelled?: boolean }) {
  if (cancelled && payment.amountPaid === 0) return null;

  let label: string;
  let tone: string;
  if (payment.refundDue > 0) {
    label = `Refund due ${formatCurrency(payment.refundDue)}`;
    tone = "bg-violet-100 text-violet-800";
  } else if (payment.balanceDue > 0) {
    const due = formatCurrency(payment.balanceDue);
    if (payment.overdue) {
      label = `Overdue · ${due} due`;
      tone = "bg-chilli-600 text-white";
    } else if (payment.paymentStatus === "partial") {
      label = `Part paid · ${due} due`;
      tone = "bg-amber-100 text-amber-800";
    } else {
      label = `Unpaid · ${due} due`;
      tone = "bg-chilli-100 text-chilli-700";
    }
  } else {
    label = "Paid";
    tone = "bg-leaf-100 text-leaf-700";
  }

  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}
