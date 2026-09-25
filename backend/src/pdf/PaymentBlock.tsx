import path from "node:path";
import { readFileSync } from "node:fs";
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { company } from "../config/company";
import { logger } from "../config/logger";

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

// The payment QR printed on bills with money still owing, read once into a Buffer (see
// SignatoryBlock.tsx for why not a path). A missing file must never take the server down —
// the bill then just prints the bank details without the QR.
function loadPaymentQr(): Buffer | null {
  const file = path.resolve(__dirname, "../assets/payment-qr.jpeg");
  try {
    return readFileSync(file);
  } catch {
    logger.warn(`Payment QR not found at ${file} — bills will show bank details without the QR.`);
    return null;
  }
}
const paymentQr = loadPaymentQr();

const styles = StyleSheet.create({
  wrapper: { flexDirection: "row", alignItems: "flex-start", marginTop: 10 },
  box: { width: 235, borderWidth: 0.75, borderColor: "#cac6c3", padding: 6 },
  payBox: { width: 280, marginLeft: 10, borderWidth: 0.75, borderColor: "#cac6c3", padding: 6 },
  payTitle: { fontSize: 8, color: "#5c564f", marginBottom: 4 },
  payRow: { flexDirection: "row", alignItems: "center" },
  // White padding around the QR is its quiet zone — scanners need it to find the code.
  qr: { width: 74, height: 74, backgroundColor: "#ffffff", padding: 5, marginRight: 8, objectFit: "contain" },
  payText: { flex: 1, fontSize: 8, color: "#1a1817" },
  payLine: { flexDirection: "row", paddingVertical: 1 },
  payLabel: { width: 62, color: "#5c564f" },
  payHint: { fontSize: 7.5, color: "#5c564f", marginBottom: 3 },
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

/** Whether a bill shows how to pay: while money is owing, or on every bill if the config says so. */
function showsHowToPay(payment: PdfPayment): boolean {
  return payment.balanceDue > 0 || company.payment.showOnBills === "always";
}

/**
 * The payment status, history and balance of a bill, and — while money is
 * owing — how to pay it (UPI QR and bank details). Shared by every invoice and bill PDF.
 */
export function PaymentBlock({ payment }: { payment: PdfPayment }) {
  return (
    <View style={styles.wrapper} wrap={false}>
      <SummaryBox payment={payment} />
      {showsHowToPay(payment) && <HowToPayBox />}
    </View>
  );
}

function HowToPayBox() {
  const { accountName, accountNumber, ifsc, upiId } = company.payment;
  return (
    <View style={styles.payBox}>
      <Text style={styles.payTitle}>Pay by UPI or bank transfer</Text>
      <View style={styles.payRow}>
        {paymentQr ? <Image src={paymentQr} style={styles.qr} /> : null}
        <View style={styles.payText}>
          {paymentQr ? <Text style={styles.payHint}>Scan with any UPI app</Text> : null}
          <View style={styles.payLine}>
            <Text style={styles.payLabel}>UPI ID</Text>
            <Text>{upiId}</Text>
          </View>
          <View style={styles.payLine}>
            <Text style={styles.payLabel}>Account name</Text>
            <Text>{accountName}</Text>
          </View>
          <View style={styles.payLine}>
            <Text style={styles.payLabel}>Account no.</Text>
            <Text>{accountNumber}</Text>
          </View>
          <View style={styles.payLine}>
            <Text style={styles.payLabel}>IFSC</Text>
            <Text>{ifsc}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function SummaryBox({ payment }: { payment: PdfPayment }) {
  const status = STATUS[payment.status];
  return (
    <View style={styles.box}>
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
