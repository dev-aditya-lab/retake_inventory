import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { company } from "../config/company";
import { UQC_CODES } from "../config/gst";
import { InvoiceBarcode, logoBuffer } from "./InvoicePdf";
import { SignatoryBlock } from "./SignatoryBlock";

// GST tax invoice / credit note layout carrying every particular CGST Rule 46
// (invoice) and Rule 53 (credit note) ask for: supplier and buyer GSTIN,
// serial number and date, place of supply with state name and code, HSN,
// quantity with unit, taxable value, rate and amount of tax per line, the
// reverse-charge statement, and a signatory block.

interface Amounts {
  taxableValue: number;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
}

export interface TaxDocPdfData {
  title: "TAX INVOICE" | "CREDIT NOTE";
  number: string;
  date: Date;
  /** Credit notes quote the invoice they reverse. */
  reference?: { number: string; date: Date };
  reason?: string;
  supplier: { legalName: string; address: string; gstin: string; stateCode: string; stateName: string };
  customer: { name: string; company?: string; address?: string; phone?: string; email?: string; gstin?: string };
  buyerType: "B2B" | "B2C";
  priceMode: "exclusive" | "inclusive";
  placeOfSupply: { code: string; name: string };
  supplyType: "intra" | "inter";
  items: (Amounts & { name: string; hsnCode?: string; uqc?: string; quantity: number; unitPrice: number; gstRate: number; total: number })[];
  otherChargesLine?: (Amounts & { description?: string; gstRate: number; total: number; hsnCode?: string }) | null;
  rateSummary: (Amounts & { gstRate: number })[];
  totals: Amounts & { totalTax: number; grandTotal: number };
  amountInWords: string;
  paymentMethod?: string;
  cancelled?: boolean;
  barcodeModules: string;
}

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

// Helvetica has no ₹ glyph, so amounts print as "Rs.".
const rs = (n: number | null | undefined) => `Rs. ${(n ?? 0).toFixed(2)}`;
const num = (n: number | null | undefined) => (n ?? 0).toFixed(2);
const tax = (a: Amounts) => (a.cgst ?? 0) + (a.sgst ?? 0) + (a.igst ?? 0);

const INK = "#1a1817";
const LINE = "#cac6c3";
const SOFT = "#e2e0de";
const MUTED = "#5c564f";
const BRAND = "#c81e2a";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: SOFT, paddingBottom: 10 },
  supplier: { flexDirection: "row", width: "62%" },
  logo: { width: 44, height: 44, marginRight: 8, borderRadius: 4 },
  supplierName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  titleBlock: { alignItems: "flex-end", width: "38%" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: BRAND },
  bold: { fontFamily: "Helvetica-Bold" },
  cancelled: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: "#a51722",
    color: "#a51722",
    padding: 5,
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  parties: { flexDirection: "row", marginTop: 10, borderWidth: 1, borderColor: SOFT },
  party: { width: "58%", padding: 7, borderRightWidth: 1, borderRightColor: SOFT },
  supplyInfo: { width: "42%", padding: 7 },
  label: { fontSize: 7, color: MUTED, fontFamily: "Helvetica-Bold", marginBottom: 2, textTransform: "uppercase" },
  kv: { flexDirection: "row", marginBottom: 2 },
  kvKey: { width: 78, color: MUTED },
  table: { marginTop: 10, borderWidth: 1, borderColor: LINE },
  th: { flexDirection: "row", backgroundColor: "#f0efee", borderBottomWidth: 1, borderBottomColor: LINE, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: SOFT },
  cell: { paddingVertical: 4, paddingHorizontal: 3 },
  cIdx: { width: "4%" },
  cName: { width: "25%" },
  cHsn: { width: "9%" },
  cQty: { width: "9%", textAlign: "right" },
  cRate: { width: "11%", textAlign: "right" },
  cTaxable: { width: "12%", textAlign: "right" },
  cGst: { width: "6%", textAlign: "right" },
  cTax: { width: "10%", textAlign: "right" },
  cTotal: { width: "14%", textAlign: "right" },
  bottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  summary: { width: "56%", borderWidth: 1, borderColor: LINE },
  sCol: { width: "20%", textAlign: "right" },
  sColRate: { width: "20%" },
  totals: { width: "40%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: LINE,
    marginTop: 3,
    paddingTop: 4,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  words: { marginTop: 8, fontFamily: "Helvetica-Oblique" },
  note: { fontSize: 7.5, color: MUTED, marginTop: 4 },
  paymentRow: { flexDirection: "row", marginTop: 8 },
  paymentItem: { flexDirection: "row", alignItems: "center", marginRight: 14 },
  checkbox: { width: 9, height: 9, borderWidth: 1, borderColor: BRAND, marginRight: 3, textAlign: "center", fontSize: 7 },
  signRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 },
});

export function TaxInvoicePdf({ doc }: { doc: TaxDocPdfData }) {
  const inclusive = doc.priceMode === "inclusive";
  const intra = doc.supplyType === "intra";
  const unit = (uqc?: string) => (uqc ? ` ${uqc}` : "");

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.supplier}>
            <Image src={logoBuffer} style={s.logo} />
            <View>
              <Text style={s.supplierName}>{doc.supplier.legalName}</Text>
              <Text style={s.small}>{doc.supplier.address}</Text>
              <Text style={s.small}>
                GSTIN: <Text style={s.bold}>{doc.supplier.gstin}</Text> · State: {doc.supplier.stateName} ({doc.supplier.stateCode})
              </Text>
              <Text style={s.small}>
                {company.contactNumber} · {company.email}
              </Text>
            </View>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>{doc.title}</Text>
            <Text style={s.bold}>{doc.number}</Text>
            <Text style={s.small}>Date: {doc.date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</Text>
            {doc.reference ? (
              <Text style={s.small}>
                Against invoice {doc.reference.number} dated{" "}
                {doc.reference.date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
              </Text>
            ) : null}
          </View>
        </View>

        {doc.cancelled ? <Text style={s.cancelled}>CANCELLED — this invoice is no longer valid</Text> : null}

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>Billed to</Text>
            <Text style={s.bold}>{doc.customer.name}</Text>
            {doc.customer.company ? <Text>{doc.customer.company}</Text> : null}
            {doc.customer.address ? <Text>{doc.customer.address}</Text> : null}
            {doc.customer.phone ? <Text>Phone: {doc.customer.phone}</Text> : null}
            {doc.customer.gstin ? (
              <Text>
                GSTIN: <Text style={s.bold}>{doc.customer.gstin}</Text>
              </Text>
            ) : (
              <Text style={s.small}>Unregistered buyer</Text>
            )}
          </View>
          <View style={s.supplyInfo}>
            <Text style={s.label}>Supply details</Text>
            <View style={s.kv}>
              <Text style={s.kvKey}>Place of supply</Text>
              <Text style={s.bold}>
                {doc.placeOfSupply.name} ({doc.placeOfSupply.code})
              </Text>
            </View>
            <View style={s.kv}>
              <Text style={s.kvKey}>Supply type</Text>
              <Text>{intra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}</Text>
            </View>
            <View style={s.kv}>
              <Text style={s.kvKey}>Reverse charge</Text>
              <Text>No</Text>
            </View>
            {doc.reason ? (
              <View style={s.kv}>
                <Text style={s.kvKey}>Reason</Text>
                <Text>{doc.reason}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.cell, s.cIdx]}>#</Text>
            <Text style={[s.cell, s.cName]}>Item</Text>
            <Text style={[s.cell, s.cHsn]}>HSN</Text>
            <Text style={[s.cell, s.cQty]}>Qty</Text>
            <Text style={[s.cell, s.cRate]}>{inclusive ? "MRP" : "Rate"}</Text>
            <Text style={[s.cell, s.cTaxable]}>Taxable</Text>
            <Text style={[s.cell, s.cGst]}>GST</Text>
            <Text style={[s.cell, s.cTax]}>Tax</Text>
            <Text style={[s.cell, s.cTotal]}>Amount</Text>
          </View>
          {doc.items.map((item, i) => (
            <View style={s.tr} key={`${item.name}-${i}`} wrap={false}>
              <Text style={[s.cell, s.cIdx]}>{i + 1}</Text>
              <Text style={[s.cell, s.cName]}>{item.name}</Text>
              <Text style={[s.cell, s.cHsn]}>{item.hsnCode}</Text>
              <Text style={[s.cell, s.cQty]}>
                {item.quantity}
                {unit(item.uqc)}
              </Text>
              <Text style={[s.cell, s.cRate]}>{num(item.unitPrice)}</Text>
              <Text style={[s.cell, s.cTaxable]}>{num(item.taxableValue)}</Text>
              <Text style={[s.cell, s.cGst]}>{item.gstRate}%</Text>
              <Text style={[s.cell, s.cTax]}>{num(tax(item))}</Text>
              <Text style={[s.cell, s.cTotal]}>{num(item.total)}</Text>
            </View>
          ))}
          {doc.otherChargesLine ? (
            <View style={s.tr} wrap={false}>
              <Text style={[s.cell, s.cIdx]}></Text>
              <Text style={[s.cell, s.cName]}>{doc.otherChargesLine.description || "Other charges"}</Text>
              <Text style={[s.cell, s.cHsn]}>{doc.otherChargesLine.hsnCode}</Text>
              <Text style={[s.cell, s.cQty]}></Text>
              <Text style={[s.cell, s.cRate]}></Text>
              <Text style={[s.cell, s.cTaxable]}>{num(doc.otherChargesLine.taxableValue)}</Text>
              <Text style={[s.cell, s.cGst]}>{doc.otherChargesLine.gstRate}%</Text>
              <Text style={[s.cell, s.cTax]}>{num(tax(doc.otherChargesLine))}</Text>
              <Text style={[s.cell, s.cTotal]}>{num(doc.otherChargesLine.total)}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={s.summary}>
            <View style={s.th}>
              <Text style={[s.cell, s.sColRate]}>GST rate</Text>
              <Text style={[s.cell, s.sCol]}>Taxable</Text>
              {intra ? (
                <>
                  <Text style={[s.cell, s.sCol]}>CGST</Text>
                  <Text style={[s.cell, s.sCol]}>SGST</Text>
                </>
              ) : (
                <Text style={[s.cell, s.sCol]}>IGST</Text>
              )}
              <Text style={[s.cell, s.sCol]}>Total tax</Text>
            </View>
            {doc.rateSummary.map((row) => (
              <View style={s.tr} key={row.gstRate}>
                <Text style={[s.cell, s.sColRate]}>
                  {row.gstRate}%{intra ? ` (${row.gstRate / 2}% + ${row.gstRate / 2}%)` : ""}
                </Text>
                <Text style={[s.cell, s.sCol]}>{num(row.taxableValue)}</Text>
                {intra ? (
                  <>
                    <Text style={[s.cell, s.sCol]}>{num(row.cgst)}</Text>
                    <Text style={[s.cell, s.sCol]}>{num(row.sgst)}</Text>
                  </>
                ) : (
                  <Text style={[s.cell, s.sCol]}>{num(row.igst)}</Text>
                )}
                <Text style={[s.cell, s.sCol]}>{num(tax(row))}</Text>
              </View>
            ))}
          </View>

          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text>Taxable value</Text>
              <Text>{rs(doc.totals.taxableValue)}</Text>
            </View>
            {intra ? (
              <>
                <View style={s.totalRow}>
                  <Text>CGST</Text>
                  <Text>{rs(doc.totals.cgst)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text>SGST</Text>
                  <Text>{rs(doc.totals.sgst)}</Text>
                </View>
              </>
            ) : (
              <View style={s.totalRow}>
                <Text>IGST</Text>
                <Text>{rs(doc.totals.igst)}</Text>
              </View>
            )}
            <View style={s.grandRow}>
              <Text>{doc.title === "CREDIT NOTE" ? "Credit amount" : "Grand total"}</Text>
              <Text>{rs(doc.totals.grandTotal)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.words}>Amount in words: {doc.amountInWords}</Text>
        {inclusive ? <Text style={s.note}>Prices shown are MRP, inclusive of GST.</Text> : null}

        {doc.paymentMethod ? (
          <View style={s.paymentRow}>
            {PAYMENT_METHODS.map((m) => (
              <View key={m.value} style={s.paymentItem}>
                <Text style={s.checkbox}>{doc.paymentMethod === m.value ? "X" : ""}</Text>
                <Text>{m.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.signRow} wrap={false}>
          <View>
            <Text style={s.note}>This is a computer generated {doc.title.toLowerCase()}.</Text>
            <Text style={s.note}>
              Goods once sold will only be exchanged as per store policy. Subject to {company.city} jurisdiction.
            </Text>
            <Text style={s.note}>Units: {Object.entries(UQC_CODES).filter(([code]) => doc.items.some((i) => i.uqc === code)).map(([code, label]) => `${code} = ${label}`).join(", ")}</Text>
          </View>
          <SignatoryBlock legalName={doc.supplier.legalName} />
        </View>

        <View style={{ marginTop: 14, alignItems: "flex-end" }} wrap={false}>
          <InvoiceBarcode modules={doc.barcodeModules} value={doc.number} />
        </View>
      </Page>
    </Document>
  );
}
