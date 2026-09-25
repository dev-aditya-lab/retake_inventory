import { View, Text, StyleSheet } from "@react-pdf/renderer";

/** What a bill's PDF says about money: every payment received, what's left, and by when. */
export interface PdfPayment {
  status: "unpaid" | "partial" | "paid" | "refund_due";
  overdue: boolean;
  amountPaid: number;
  balanceDue: number;
  refundDue: number;
  dueDate: Date | null;
  /** Payments and refunds, oldest first. */
  entries: { date: Date; method: string; kind: "payment" | "refund"; amount: number }[];
}

const METHOD_LABELS: Record<string, string> = { cash: "Cash", cheque: "Cheque", upi: "UPI", bank_transfer: "Bank transfer" };
const STATUS: Record<PdfPayment["status"], { label: string; color: string }> = {
  paid: { label: "PAID", color: "#15803d" },
  partial: { label: "PART PAID", color: "#b45309" },
  unpaid: { label: "UNPAID", color: "#c81e2a" },
  refund_due: { label: "REFUND DUE", color: "#7c3aed" },
};

const styles = StyleSheet.create({
  box: { width: 250, marginTop: 10, borderWidth: 0.75, borderColor: "#cac6c3", padding: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  title: { fontSize: 8, color: "#5c564f" },
  status: { fontSize: 10, fontWeight: 700 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5, fontSize: 8.5 },
  entry: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1, fontSize: 8, color: "#5c564f" },
  divider: { borderTopWidth: 0.5, borderTopColor: "#cac6c3", marginTop: 3, paddingTop: 3 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, fontSize: 10, fontWeight: 700 },
  dueLine: { fontSize: 8, marginTop: 2 },
});

const dateText = (date: Date) => date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
const rs = (n: number) => `Rs. ${n.toFixed(2)}`;

/** The payment status, history and balance of a bill — shared by every invoice and bill PDF. */
export function PaymentBlock({ payment }: { payment: PdfPayment }) {
  const status = STATUS[payment.status];
  return (
    <View style={styles.box} wrap={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Payment</Text>
        <Text style={{ ...styles.status, color: status.color }}>{status.label}</Text>
      </View>

      {payment.entries.map((entry, i) => (
        <View style={styles.entry} key={`${entry.date.getTime()}-${i}`}>
          <Text>
            {dateText(entry.date)} · {METHOD_LABELS[entry.method] ?? entry.method}
            {entry.kind === "refund" ? " (refund)" : ""}
          </Text>
          <Text>
            {entry.kind === "refund" ? "- " : ""}
            {rs(entry.amount)}
          </Text>
        </View>
      ))}

      <View style={{ ...styles.row, ...(payment.entries.length > 0 ? styles.divider : {}) }}>
        <Text>Amount paid</Text>
        <Text>{rs(payment.amountPaid)}</Text>
      </View>

      {payment.balanceDue > 0 && (
        <>
          <View style={styles.balanceRow}>
            <Text>Balance due</Text>
            <Text style={{ color: "#c81e2a" }}>{rs(payment.balanceDue)}</Text>
          </View>
          {payment.dueDate && (
            <Text style={{ ...styles.dueLine, color: payment.overdue ? "#c81e2a" : "#5c564f" }}>
              Please pay by {dateText(payment.dueDate)}
              {payment.overdue ? " (overdue)" : ""}
            </Text>
          )}
        </>
      )}

      {payment.refundDue > 0 && (
        <View style={styles.balanceRow}>
          <Text>Refund due to customer</Text>
          <Text style={{ color: "#7c3aed" }}>{rs(payment.refundDue)}</Text>
        </View>
      )}
    </View>
  );
}
