import { HSN_DESCRIPTION_MAX, MIN_HSN_DIGITS, isValidGstRate } from "../config/gst";
import { round2 } from "./gst";
import { isValidGstin } from "./gstin";
import { documentSequence, documentSeries, isGstValidDocumentNumber } from "./invoiceNumber";
import { formatGstDate, returnPeriodCode, type GstPeriod } from "./istDate";

// Builds the GSTR-1 JSON the GST portal accepts under Returns → GSTR-1 →
// Prepare Offline → Upload, plus the GSTR-3B sales figures that follow from
// it. Pure: documents in, JSON + checks out, so it's fully unit-tested.
//
// Field names and structure follow the portal's JSON schema as implemented by
// the open-source India Compliance app (github.com/resilient-tech/
// india-compliance, gst_india/utils/gstr_1/sections/*): b2b, b2cl, b2cs,
// cdnr, cdnur, hsn {hsn_b2b, hsn_b2c} (split since May 2025), doc_issue.

export type Gstr1Category = "B2B" | "B2CL" | "B2CS";

export interface RateRow {
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface HsnLine extends RateRow {
  hsnCode: string;
  description: string;
  uqc: string;
  quantity: number;
}

/** An invoice or credit note, reduced to what GSTR-1 needs. */
export interface ReturnDoc {
  kind: "invoice" | "credit-note";
  number: string;
  date: Date;
  category: Gstr1Category;
  buyerGstin: string;
  posCode: string;
  supplyType: "intra" | "inter";
  /** Document value including tax. */
  value: number;
  /** Invoices only: void = cancelled before filing (Table 13 only). */
  status: "paid" | "void" | "credited";
  rateSummary: RateRow[];
  /** Item lines plus other charges (quantity 0), for the HSN summary. */
  hsnLines: HsnLine[];
}

export interface Gstr1Issue {
  level: "error" | "warning";
  message: string;
  documents?: string[];
}

export interface Gstr1Input {
  supplierGstin: string;
  /** Months covered, first..last ("YYYY-MM"). The filing period is the last one. */
  periods: GstPeriod[];
  invoices: ReturnDoc[];
  creditNotes: ReturnDoc[];
}

interface Money {
  txval: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt: number;
}

function money(row: RateRow, supplyType: "intra" | "inter", sign = 1): Money & { rt: number } {
  return supplyType === "inter"
    ? { rt: row.gstRate, txval: round2(sign * row.taxableValue), iamt: round2(sign * row.igst), csamt: 0 }
    : {
        rt: row.gstRate,
        txval: round2(sign * row.taxableValue),
        camt: round2(sign * row.cgst),
        samt: round2(sign * row.sgst),
        csamt: 0,
      };
}

function itemsOf(doc: ReturnDoc) {
  return doc.rateSummary
    .filter((row) => row.gstRate > 0)
    .map((row, index) => ({ num: index + 1, itm_det: money(row, doc.supplyType) }));
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row);
  }
  return groups;
}

interface Totals {
  count: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
}

const emptyTotals = (): Totals => ({ count: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0 });

function addTotals(totals: Totals, doc: ReturnDoc, sign = 1) {
  totals.count += 1;
  for (const row of doc.rateSummary) {
    totals.taxableValue = round2(totals.taxableValue + sign * row.taxableValue);
    totals.igst = round2(totals.igst + sign * row.igst);
    totals.cgst = round2(totals.cgst + sign * row.cgst);
    totals.sgst = round2(totals.sgst + sign * row.sgst);
  }
}

/** Document ranges for Table 13, one row per number series. Missing numbers count as cancelled. */
function documentRanges(docs: ReturnDoc[]) {
  const bySeries = groupBy(docs, (doc) => documentSeries(doc.number));
  return [...bySeries.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, seriesDocs], index) => {
      const sorted = [...seriesDocs].sort((a, b) => documentSequence(a.number) - documentSequence(b.number));
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const totnum = documentSequence(last.number) - documentSequence(first.number) + 1;
      const cancelled = sorted.filter((doc) => doc.status === "void").length + (totnum - sorted.length);
      return { num: index + 1, from: first.number, to: last.number, totnum, cancel: cancelled, net_issue: totnum - cancelled };
    });
}

export function buildGstr1({ supplierGstin, periods, invoices, creditNotes }: Gstr1Input) {
  const issues: Gstr1Issue[] = [];
  const lastPeriod = periods[periods.length - 1]!;

  if (!isValidGstin(supplierGstin)) {
    issues.push({ level: "error", message: `Your company GSTIN "${supplierGstin}" isn't valid — fix it in config/company.ts.` });
  }

  const reportable = (doc: ReturnDoc) => doc.status !== "void";

  // ---- checks ---------------------------------------------------------------
  const allDocs = [...invoices, ...creditNotes];
  const longNumbers = allDocs.filter((doc) => !isGstValidDocumentNumber(doc.number));
  if (longNumbers.length > 0) {
    issues.push({
      level: "error",
      message: `${longNumbers.length} document number(s) are longer than GST's 16-character limit, so the portal will reject them.`,
      documents: longNumbers.map((d) => d.number),
    });
  }
  const badGstin = allDocs.filter((doc) => doc.category === "B2B" && !isValidGstin(doc.buyerGstin));
  if (badGstin.length > 0) {
    issues.push({ level: "error", message: "Some B2B bills have an invalid customer GSTIN.", documents: badGstin.map((d) => d.number) });
  }
  const badHsn = allDocs.filter(
    (doc) => reportable(doc) && doc.hsnLines.some((l) => !new RegExp(`^\\d{${MIN_HSN_DIGITS},8}$`).test(l.hsnCode)),
  );
  if (badHsn.length > 0) {
    issues.push({ level: "error", message: `Some lines have no HSN code of at least ${MIN_HSN_DIGITS} digits.`, documents: badHsn.map((d) => d.number) });
  }
  const badRate = allDocs.filter((doc) => reportable(doc) && doc.rateSummary.some((r) => !isValidGstRate(r.gstRate)));
  if (badRate.length > 0) {
    issues.push({ level: "error", message: "Some lines use a GST rate the portal doesn't accept.", documents: badRate.map((d) => d.number) });
  }
  const nilRated = allDocs.filter((doc) => reportable(doc) && doc.rateSummary.some((r) => r.gstRate === 0));
  if (nilRated.length > 0) {
    issues.push({
      level: "error",
      message: "Some bills contain 0% (nil-rated) items. These belong in GSTR-1 Table 8 and aren't filed automatically yet — report them with your CA.",
      documents: nilRated.map((d) => d.number),
    });
  }

  // ---- B2B (Table 4) --------------------------------------------------------
  const b2bInvoices = invoices.filter((d) => reportable(d) && d.category === "B2B");
  const b2b = [...groupBy(b2bInvoices, (d) => d.buyerGstin).entries()].map(([ctin, docs]) => ({
    ctin,
    inv: docs.map((doc) => ({
      inum: doc.number,
      idt: formatGstDate(doc.date),
      val: round2(doc.value),
      pos: doc.posCode,
      rchrg: "N",
      inv_typ: "R",
      itms: itemsOf(doc),
    })),
  }));

  // ---- B2CL (Table 5): inter-state retail bills above ₹1 lakh ---------------
  const b2clInvoices = invoices.filter((d) => reportable(d) && d.category === "B2CL");
  const b2cl = [...groupBy(b2clInvoices, (d) => d.posCode).entries()].map(([pos, docs]) => ({
    pos,
    inv: docs.map((doc) => ({
      inum: doc.number,
      idt: formatGstDate(doc.date),
      val: round2(doc.value),
      itms: itemsOf(doc),
    })),
  }));

  // ---- B2CS (Table 7): other retail, by place of supply + rate, net of credit notes
  const b2csRows = new Map<string, { pos: string; supplyType: "intra" | "inter"; row: RateRow }>();
  const addB2cs = (doc: ReturnDoc, sign: number) => {
    for (const r of doc.rateSummary.filter((x) => x.gstRate > 0)) {
      const key = `${doc.posCode}|${r.gstRate}`;
      const entry = b2csRows.get(key) ?? {
        pos: doc.posCode,
        supplyType: doc.supplyType,
        row: { gstRate: r.gstRate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
      };
      entry.row.taxableValue = round2(entry.row.taxableValue + sign * r.taxableValue);
      entry.row.cgst = round2(entry.row.cgst + sign * r.cgst);
      entry.row.sgst = round2(entry.row.sgst + sign * r.sgst);
      entry.row.igst = round2(entry.row.igst + sign * r.igst);
      b2csRows.set(key, entry);
    }
  };
  invoices.filter((d) => reportable(d) && d.category === "B2CS").forEach((d) => addB2cs(d, 1));
  creditNotes.filter((d) => d.category === "B2CS").forEach((d) => addB2cs(d, -1));
  const b2cs = [...b2csRows.values()]
    .filter(({ row }) => row.taxableValue !== 0)
    .sort((a, b) => a.pos.localeCompare(b.pos) || a.row.gstRate - b.row.gstRate)
    .map(({ pos, supplyType, row }) => ({
      sply_ty: supplyType === "intra" ? "INTRA" : "INTER",
      pos,
      typ: "OE",
      ...money(row, supplyType),
    }));
  const negativeB2cs = b2cs.filter((r) => r.txval < 0);
  if (negativeB2cs.length > 0) {
    issues.push({
      level: "warning",
      message: "Retail returns this period are larger than retail sales for some state/rate, giving a negative B2CS row. Check with your CA before filing.",
    });
  }

  // ---- Credit notes: CDNR (registered), CDNUR (against B2CL bills) -----------
  const noteItems = (doc: ReturnDoc) => doc.rateSummary.filter((r) => r.gstRate > 0).map((row, index) => ({ num: index + 1, itm_det: money(row, doc.supplyType) }));
  const cdnrNotes = creditNotes.filter((d) => d.category === "B2B");
  const cdnr = [...groupBy(cdnrNotes, (d) => d.buyerGstin).entries()].map(([ctin, docs]) => ({
    ctin,
    nt: docs.map((doc) => ({
      ntty: "C",
      nt_num: doc.number,
      nt_dt: formatGstDate(doc.date),
      pos: doc.posCode,
      rchrg: "N",
      inv_typ: "R",
      val: round2(doc.value),
      itms: noteItems(doc),
    })),
  }));
  const cdnur = creditNotes
    .filter((d) => d.category === "B2CL")
    .map((doc) => ({
      typ: "B2CL",
      ntty: "C",
      nt_num: doc.number,
      nt_dt: formatGstDate(doc.date),
      pos: doc.posCode,
      val: round2(doc.value),
      itms: noteItems(doc),
    }));

  // ---- HSN summary (Table 12), split B2B / B2C ----------------------------------
  const hsnTable = (sales: ReturnDoc[], returns: ReturnDoc[]) => {
    const rows = new Map<string, HsnLine>();
    const add = (doc: ReturnDoc, sign: number) => {
      for (const line of doc.hsnLines.filter((l) => l.gstRate > 0)) {
        const key = `${line.hsnCode}|${line.uqc}|${line.gstRate}`;
        const row = rows.get(key) ?? { ...line, quantity: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
        row.quantity = round2(row.quantity + sign * line.quantity);
        row.taxableValue = round2(row.taxableValue + sign * line.taxableValue);
        row.cgst = round2(row.cgst + sign * line.cgst);
        row.sgst = round2(row.sgst + sign * line.sgst);
        row.igst = round2(row.igst + sign * line.igst);
        rows.set(key, row);
      }
    };
    sales.forEach((d) => add(d, 1));
    returns.forEach((d) => add(d, -1));
    return [...rows.values()]
      .filter((row) => row.taxableValue !== 0 || row.quantity !== 0)
      .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.gstRate - b.gstRate)
      .map((row, index) => ({
        num: index + 1,
        hsn_sc: row.hsnCode,
        desc: row.description.trim().slice(0, HSN_DESCRIPTION_MAX).trimEnd(),
        uqc: row.uqc,
        qty: row.quantity,
        rt: row.gstRate,
        txval: row.taxableValue,
        iamt: row.igst,
        camt: row.cgst,
        samt: row.sgst,
        csamt: 0,
      }));
  };
  const hsnB2b = hsnTable(b2bInvoices, cdnrNotes);
  const hsnB2c = hsnTable(
    invoices.filter((d) => reportable(d) && d.category !== "B2B"),
    creditNotes.filter((d) => d.category !== "B2B"),
  );

  // ---- Documents issued (Table 13) --------------------------------------------
  const invoiceRanges = documentRanges(invoices.filter((d) => isGstValidDocumentNumber(d.number)));
  const noteRanges = documentRanges(creditNotes.filter((d) => isGstValidDocumentNumber(d.number)));
  const docDetails = [
    ...(invoiceRanges.length > 0 ? [{ doc_num: 1, docs: invoiceRanges }] : []),
    ...(noteRanges.length > 0 ? [{ doc_num: 5, docs: noteRanges }] : []),
  ];

  // ---- JSON (the portal rejects empty sections) ---------------------------------
  const json: Record<string, unknown> = { gstin: supplierGstin, fp: returnPeriodCode(lastPeriod) };
  if (b2b.length) json.b2b = b2b;
  if (b2cl.length) json.b2cl = b2cl;
  if (b2cs.length) json.b2cs = b2cs;
  if (cdnr.length) json.cdnr = cdnr;
  if (cdnur.length) json.cdnur = cdnur;
  if (hsnB2b.length || hsnB2c.length) {
    json.hsn = { ...(hsnB2b.length ? { hsn_b2b: hsnB2b } : {}), ...(hsnB2c.length ? { hsn_b2c: hsnB2c } : {}) };
  }
  if (docDetails.length) json.doc_issue = { doc_det: docDetails };

  // ---- Summary + GSTR-3B ----------------------------------------------------------
  const sections = {
    b2b: emptyTotals(),
    b2cl: emptyTotals(),
    b2cs: emptyTotals(),
    cdnr: emptyTotals(),
    cdnur: emptyTotals(),
    b2csReturns: emptyTotals(),
  };
  b2bInvoices.forEach((d) => addTotals(sections.b2b, d));
  b2clInvoices.forEach((d) => addTotals(sections.b2cl, d));
  invoices.filter((d) => reportable(d) && d.category === "B2CS").forEach((d) => addTotals(sections.b2cs, d));
  cdnrNotes.forEach((d) => addTotals(sections.cdnr, d));
  creditNotes.filter((d) => d.category === "B2CL").forEach((d) => addTotals(sections.cdnur, d));
  creditNotes.filter((d) => d.category === "B2CS").forEach((d) => addTotals(sections.b2csReturns, d));

  // 3.1(a): all taxable outward supplies, net of credit notes.
  const outward = emptyTotals();
  invoices.filter(reportable).forEach((d) => addTotals(outward, d));
  creditNotes.forEach((d) => addTotals(outward, d, -1));

  // 3.2: of those, inter-state supplies to unregistered persons, by place of supply.
  const interUnregistered = new Map<string, { pos: string; taxableValue: number; igst: number }>();
  const addInter = (doc: ReturnDoc, sign: number) => {
    if (doc.category === "B2B" || doc.supplyType !== "inter") return;
    const entry = interUnregistered.get(doc.posCode) ?? { pos: doc.posCode, taxableValue: 0, igst: 0 };
    for (const r of doc.rateSummary) {
      entry.taxableValue = round2(entry.taxableValue + sign * r.taxableValue);
      entry.igst = round2(entry.igst + sign * r.igst);
    }
    interUnregistered.set(doc.posCode, entry);
  };
  invoices.filter(reportable).forEach((d) => addInter(d, 1));
  creditNotes.forEach((d) => addInter(d, -1));

  const cancelledCount = invoices.filter((d) => d.status === "void").length;

  return {
    json,
    issues,
    summary: {
      filingPeriod: returnPeriodCode(lastPeriod),
      sections,
      cancelledInvoices: cancelledCount,
      hsnRows: { b2b: hsnB2b.length, b2c: hsnB2c.length },
      documentRanges: { invoices: invoiceRanges, creditNotes: noteRanges },
    },
    gstr3b: {
      // Table 3.1(a) — outward taxable supplies (other than zero-rated, nil-rated and exempted).
      outwardTaxable: {
        taxableValue: outward.taxableValue,
        igst: outward.igst,
        cgst: outward.cgst,
        sgst: outward.sgst,
        cess: 0,
      },
      // Table 3.2 — inter-state supplies to unregistered persons, by place of supply.
      interStateUnregistered: [...interUnregistered.values()]
        .filter((r) => r.taxableValue !== 0)
        .sort((a, b) => a.pos.localeCompare(b.pos)),
      totalTaxLiability: round2(outward.igst + outward.cgst + outward.sgst),
    },
  };
}

export type Gstr1Result = ReturnType<typeof buildGstr1>;
