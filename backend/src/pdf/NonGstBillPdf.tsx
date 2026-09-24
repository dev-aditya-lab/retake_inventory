import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { company } from "../config/company";
import { InvoiceBarcode, logoBuffer } from "./InvoicePdf";
import { SignatoryBlock } from "./SignatoryBlock";

export interface NonGstBillPdfData {
  billNumber: string;
  billingDate: Date;
  customer: { name: string; company?: string; address?: string; phone?: string; email?: string };
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  priceList: "b2b" | "retail";
  otherCharges: number;
  subtotal: number;
  grandTotal: number;
  amountInWords: string;
  paymentMethod: string;
  /** Cancelled bills still render (the customer's link keeps working) but are clearly marked. */
  cancelled?: boolean;
  /** CODE128 module pattern for the bill number ("1" = bar), drawn as vector bars. */
  barcodeModules: string;
}

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1a1817" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e0de",
    paddingBottom: 12,
    marginBottom: 12,
  },
  companyBlock: { flexDirection: "row" },
  logo: { width: 48, height: 48, marginRight: 8, borderRadius: 4 },
  companyName: { fontSize: 13, fontWeight: 700 },
  small: { fontSize: 8, color: "#5c564f" },
  title: { fontSize: 16, fontWeight: 700, color: "#c81e2a", textAlign: "right" },
  section: { marginBottom: 10 },
  label: { fontSize: 9, fontWeight: 700, marginBottom: 2 },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cac6c3",
    paddingBottom: 4,
    fontWeight: 700,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e0de", paddingVertical: 4 },
  colIndex: { width: "7%" },
  colName: { width: "47%" },
  colQty: { width: "12%", textAlign: "right" },
  colRate: { width: "17%", textAlign: "right" },
  colTotal: { width: "17%", textAlign: "right" },
  totalsBlock: { alignSelf: "flex-end", width: 220, marginTop: 10 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#cac6c3",
    paddingTop: 4,
    marginTop: 4,
    fontSize: 12,
    fontWeight: 700,
  },
  words: { fontSize: 9, fontStyle: "italic", marginTop: 8 },
  paymentRow: { flexDirection: "row", marginTop: 10 },
  paymentItem: { flexDirection: "row", alignItems: "center", marginRight: 16 },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: "#c81e2a",
    marginRight: 4,
    textAlign: "center",
    fontSize: 8,
  },
  footerNote: { fontSize: 8, color: "#7c756f", marginTop: 12 },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#e2e0de",
    paddingTop: 8,
    marginTop: 20,
  },
  cancelledBanner: {
    borderWidth: 1.5,
    borderColor: "#a51722",
    color: "#a51722",
    padding: 6,
    marginBottom: 10,
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
  },
});

/**
 * A bill with no GST. It is deliberately not a tax invoice: no GSTIN, HSN,
 * tax columns or "TAX INVOICE" heading — just what was bought and what was paid.
 */
export function NonGstBillPdf({ bill }: { bill: NonGstBillPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.companyBlock}>
            <Image src={logoBuffer} style={styles.logo} />
            <View>
              <Text style={styles.companyName}>{company.legalName}</Text>
              <Text style={styles.small}>
                {company.address}, {company.city}, {company.state} {company.pincode}
              </Text>
              <Text style={styles.small}>{company.contactNumber}</Text>
              <Text style={styles.small}>
                {company.email} · {company.website}
              </Text>
            </View>
          </View>
          <View>
            <Text style={styles.title}>BILL</Text>
            <Text>{bill.billNumber}</Text>
            <Text style={styles.small}>{bill.billingDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</Text>
          </View>
        </View>

        {bill.cancelled ? <Text style={styles.cancelledBanner}>CANCELLED — this bill is no longer valid</Text> : null}

        <View style={styles.section}>
          <Text style={styles.label}>Billed to</Text>
          <Text>{bill.customer.name}</Text>
          {bill.customer.company ? <Text>{bill.customer.company}</Text> : null}
          {bill.customer.address ? <Text>{bill.customer.address}</Text> : null}
          {bill.customer.phone ? <Text>{bill.customer.phone}</Text> : null}
          {bill.customer.email ? <Text>{bill.customer.email}</Text> : null}
        </View>

        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colIndex}>#</Text>
            <Text style={styles.colName}>Item</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>{bill.priceList === "retail" ? "MRP" : "Rate"}</Text>
            <Text style={styles.colTotal}>Amount</Text>
          </View>
          {bill.items.map((item, i) => (
            <View style={styles.tableRow} key={`${item.name}-${i}`}>
              <Text style={styles.colIndex}>{i + 1}</Text>
              <Text style={styles.colName}>{item.name}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colRate}>Rs. {item.unitPrice.toFixed(2)}</Text>
              <Text style={styles.colTotal}>Rs. {item.total.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Items total</Text>
            <Text>Rs. {bill.subtotal.toFixed(2)}</Text>
          </View>
          {bill.otherCharges > 0 && (
            <View style={styles.totalsRow}>
              <Text>Other charges</Text>
              <Text>Rs. {bill.otherCharges.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text>Total</Text>
            <Text>Rs. {bill.grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.words}>Amount in words: {bill.amountInWords}</Text>

        <View style={styles.paymentRow}>
          {PAYMENT_METHODS.map((m) => (
            <View key={m.value} style={styles.paymentItem}>
              <Text style={styles.checkbox}>{bill.paymentMethod === m.value ? "X" : ""}</Text>
              <Text>{m.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footerNote}>This is a computer generated bill. No GST is charged on it.</Text>
        <Text style={styles.footerNote}>
          Goods once sold will only be exchanged as per store policy. All disputes are subject to {company.city}{" "}
          jurisdiction.
        </Text>

        <View style={{ alignSelf: "flex-end", marginTop: 14 }} wrap={false}>
          <SignatoryBlock legalName={company.legalName} />
        </View>

        <View style={styles.footerRow}>
          <View>
            <Text style={styles.small}>{company.legalName}</Text>
            <Text style={styles.small}>{company.website}</Text>
          </View>
          <InvoiceBarcode modules={bill.barcodeModules} value={bill.billNumber} />
        </View>
      </Page>
    </Document>
  );
}
