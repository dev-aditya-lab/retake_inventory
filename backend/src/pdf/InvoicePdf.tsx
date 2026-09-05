import path from "node:path";
import { readFileSync } from "node:fs";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { company } from "../config/company";

export interface InvoicePdfData {
  invoiceNumber: string;
  billingDate: Date;
  customer: {
    name: string;
    company?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
  items: { name: string; hsnCode?: string; quantity: number; unitPrice: number; total: number }[];
  gst: {
    enabled: boolean;
    type?: "CGST_SGST" | "IGST";
    percentage: number;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
  };
  otherCharges: number;
  subtotal: number;
  grandTotal: number;
  amountInWords: string;
  paymentMethod: string;
  barcodePng: Buffer;
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
  invoiceTitle: { fontSize: 16, fontWeight: 700, color: "#c81e2a", textAlign: "right" },
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
  colIndex: { width: "6%" },
  colName: { width: "34%" },
  colHsn: { width: "14%" },
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
  barcode: { width: 140, height: 44 },
});

// Read into a Buffer (rather than passing the path string as `src`) because
// @react-pdf/image resolves string sources through its own URL parser, which
// misreads a Windows absolute path's drive letter ("C:\...") as a URL scheme
// and tries to fetch it remotely instead of reading it from disk — silently
// dropping the logo. A Buffer skips that resolution path entirely.
const logoBuffer = readFileSync(path.resolve(__dirname, "../assets/logo.png"));

export function InvoicePdf({ invoice }: { invoice: InvoicePdfData }) {
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
              <Text style={styles.small}>
                GSTIN: {company.gstin} · {company.contactNumber}
              </Text>
              <Text style={styles.small}>
                {company.email} · {company.website}
              </Text>
            </View>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text>{invoice.invoiceNumber}</Text>
            <Text style={styles.small}>{invoice.billingDate.toLocaleDateString("en-IN")}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Billed to</Text>
          <Text>{invoice.customer.name}</Text>
          {invoice.customer.company ? <Text>{invoice.customer.company}</Text> : null}
          {invoice.customer.address ? <Text>{invoice.customer.address}</Text> : null}
          {invoice.customer.phone ? <Text>{invoice.customer.phone}</Text> : null}
          {invoice.customer.email ? <Text>{invoice.customer.email}</Text> : null}
          {invoice.customer.gstin ? <Text>GSTIN: {invoice.customer.gstin}</Text> : null}
        </View>

        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colIndex}>#</Text>
            <Text style={styles.colName}>Item</Text>
            <Text style={styles.colHsn}>HSN</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {invoice.items.map((item, i) => (
            <View style={styles.tableRow} key={`${item.name}-${i}`}>
              <Text style={styles.colIndex}>{i + 1}</Text>
              <Text style={styles.colName}>{item.name}</Text>
              <Text style={styles.colHsn}>{item.hsnCode || "-"}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colRate}>Rs. {item.unitPrice.toFixed(2)}</Text>
              <Text style={styles.colTotal}>Rs. {item.total.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>Rs. {invoice.subtotal.toFixed(2)}</Text>
          </View>
          {invoice.gst.enabled && invoice.gst.type === "CGST_SGST" && (
            <>
              <View style={styles.totalsRow}>
                <Text>CGST</Text>
                <Text>Rs. {(invoice.gst.cgstAmount ?? 0).toFixed(2)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text>SGST</Text>
                <Text>Rs. {(invoice.gst.sgstAmount ?? 0).toFixed(2)}</Text>
              </View>
            </>
          )}
          {invoice.gst.enabled && invoice.gst.type === "IGST" && (
            <View style={styles.totalsRow}>
              <Text>IGST</Text>
              <Text>Rs. {(invoice.gst.igstAmount ?? 0).toFixed(2)}</Text>
            </View>
          )}
          {invoice.otherCharges > 0 && (
            <View style={styles.totalsRow}>
              <Text>Other charges</Text>
              <Text>Rs. {invoice.otherCharges.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text>Grand Total</Text>
            <Text>Rs. {invoice.grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.words}>Amount in words: {invoice.amountInWords}</Text>

        <View style={styles.paymentRow}>
          {PAYMENT_METHODS.map((m) => (
            <View key={m.value} style={styles.paymentItem}>
              <Text style={styles.checkbox}>{invoice.paymentMethod === m.value ? "X" : ""}</Text>
              <Text>{m.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footerNote}>This is a computer generated invoice and does not require signature.</Text>
        <Text style={styles.footerNote}>
          Goods once sold will only be exchanged as per store policy. All disputes are subject to {company.city}{" "}
          jurisdiction.
        </Text>

        <View style={styles.footerRow}>
          <View>
            <Text style={styles.small}>{company.legalName}</Text>
            <Text style={styles.small}>{company.website}</Text>
          </View>
          <Image src={invoice.barcodePng} style={styles.barcode} />
        </View>
      </Page>
    </Document>
  );
}
