import { company } from "../config/company";
import { GST_TIME_ZONE, MIN_HSN_DIGITS, UQC_CODES, gstStateName, isValidGstRate } from "../config/gst";
import { CreditNote } from "../models/CreditNote.model";
import { GstFiling } from "../models/GstFiling.model";
import { HsnCode } from "../models/HsnCode.model";
import { GST_VERSION, Invoice } from "../models/Invoice.model";
import { Product } from "../models/Product.model";
import { ApiError } from "../utils/ApiError";
import { describeGstinProblem, gstinStateCode } from "../utils/gstin";
import { buildGstr1, type Gstr1Category, type Gstr1Issue, type HsnLine, type RateRow, type ReturnDoc } from "../utils/gstr1";
import { gstPeriodOf, gstPeriodRange, listGstPeriods, type GstPeriod } from "../utils/istDate";
import { gstr1CategoryOf, priceFor } from "./gstDocument.service";
import { periodLabel } from "./gstFiling.service";

interface StoredLine {
  name: string;
  hsnCode?: string | null;
  uqc?: string | null;
  quantity: number;
  gstRate?: number | null;
  taxableValue?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
}

interface StoredGstDoc {
  items: StoredLine[];
  otherChargesLine?: (Omit<StoredLine, "name" | "quantity"> & { description?: string | null }) | null;
  rateSummary?: RateRow[] | null;
  placeOfSupply?: { code: string } | null;
  supplyType?: string | null;
  customer?: { gstin?: string | null } | null;
  grandTotal: number;
}

function hsnLinesOf(doc: StoredGstDoc, describe: (hsn: string, fallback: string) => string): HsnLine[] {
  const lines: HsnLine[] = doc.items.map((item) => ({
    hsnCode: item.hsnCode ?? "",
    description: describe(item.hsnCode ?? "", item.name),
    uqc: item.uqc ?? "",
    quantity: item.quantity,
    gstRate: item.gstRate ?? 0,
    taxableValue: item.taxableValue ?? 0,
    cgst: item.cgst ?? 0,
    sgst: item.sgst ?? 0,
    igst: item.igst ?? 0,
  }));
  const charges = doc.otherChargesLine;
  if (charges) {
    lines.push({
      hsnCode: charges.hsnCode ?? "",
      description: describe(charges.hsnCode ?? "", charges.description ?? "Other charges"),
      uqc: charges.uqc ?? "",
      quantity: 0, // charges add value, not quantity
      gstRate: charges.gstRate ?? 0,
      taxableValue: charges.taxableValue ?? 0,
      cgst: charges.cgst ?? 0,
      sgst: charges.sgst ?? 0,
      igst: charges.igst ?? 0,
    });
  }
  return lines;
}

function toReturnDoc(
  doc: StoredGstDoc,
  base: Pick<ReturnDoc, "kind" | "number" | "date" | "status" | "category">,
  describe: (hsn: string, fallback: string) => string,
): ReturnDoc {
  return {
    ...base,
    buyerGstin: doc.customer?.gstin ?? "",
    posCode: doc.placeOfSupply?.code ?? company.stateCode,
    supplyType: doc.supplyType === "inter" ? "inter" : "intra",
    value: doc.grandTotal,
    rateSummary: (doc.rateSummary ?? []).map((r) => ({
      gstRate: r.gstRate,
      taxableValue: r.taxableValue,
      cgst: r.cgst ?? 0,
      sgst: r.sgst ?? 0,
      igst: r.igst ?? 0,
    })),
    hsnLines: hsnLinesOf(doc, describe),
  };
}

async function hsnDescriber() {
  const codes = await HsnCode.find().select("code description").lean();
  const descriptions = new Map(codes.map((c) => [c.code, c.description]));
  return (hsn: string, fallback: string) => descriptions.get(hsn)?.trim() || fallback;
}

/** Filed months in the given list. */
async function filedPeriods(periods: GstPeriod[]): Promise<Set<string>> {
  const filings = await GstFiling.find({ period: { $in: periods } }).select("period").lean();
  return new Set(filings.map((f) => f.period));
}

function supplierIssues(): Gstr1Issue[] {
  const issues: Gstr1Issue[] = [];
  const problem = describeGstinProblem(company.gstin);
  if (problem) issues.push({ level: "error", message: `Company GSTIN: ${problem}. Fix it in backend/src/config/company.ts.` });
  else if (gstinStateCode(company.gstin) !== company.stateCode) {
    issues.push({
      level: "error",
      message: `company.stateCode (${company.stateCode}) doesn't match your GSTIN's state (${gstinStateCode(company.gstin)}) — every bill's CGST/IGST split would be wrong.`,
    });
  }
  return issues;
}

/**
 * GSTR-1 for one month or a quarter: the portal-ready JSON, section totals,
 * the GSTR-3B sales figures, and anything that would make the portal reject
 * the file or the return be wrong.
 */
export async function prepareGstr1(firstPeriod: GstPeriod, lastPeriod: GstPeriod = firstPeriod) {
  const periods = listGstPeriods(firstPeriod, lastPeriod);
  if (periods.length === 0) throw ApiError.badRequest("The end month can't be before the start month");
  if (periods.length > 3) throw ApiError.badRequest("A GSTR-1 covers a month or a quarter (at most 3 months)");

  const { from, to } = gstPeriodRange(firstPeriod, lastPeriod);
  const [invoices, creditNotes, describe, filed] = await Promise.all([
    Invoice.find({ billingDate: { $gte: from, $lt: to } }).sort({ invoiceNumber: 1 }).lean(),
    CreditNote.find({ noteDate: { $gte: from, $lt: to } }).sort({ noteNumber: 1 }).lean(),
    hsnDescriber(),
    filedPeriods(periods),
  ]);

  const gstInvoices = invoices.filter((inv) => inv.gstVersion === GST_VERSION);
  const legacy = invoices.filter((inv) => inv.gstVersion !== GST_VERSION);

  const result = buildGstr1({
    supplierGstin: company.gstin,
    periods,
    invoices: gstInvoices.map((inv) =>
      toReturnDoc(
        inv,
        {
          kind: "invoice",
          number: inv.invoiceNumber,
          date: inv.billingDate,
          status: inv.status,
          category: gstr1CategoryOf(inv) as Gstr1Category,
        },
        describe,
      ),
    ),
    creditNotes: creditNotes.map((note) =>
      toReturnDoc(
        note,
        { kind: "credit-note", number: note.noteNumber, date: note.noteDate, status: "paid", category: note.invoiceCategory },
        describe,
      ),
    ),
  });

  const issues: Gstr1Issue[] = [...supplierIssues(), ...result.issues];

  const legacyActive = legacy.filter((inv) => inv.status !== "void");
  if (legacyActive.length > 0) {
    issues.unshift({
      level: "error",
      message:
        `${legacyActive.length} bill(s) in this period were made before GST billing was set up: their numbers are longer than 16 characters ` +
        "and they have no per-item GST, so they can't go in the upload file. If they were test bills, delete them from Sales; " +
        "if they were real sales, report them manually with your CA.",
      documents: legacyActive.map((inv) => inv.invoiceNumber),
    });
  }

  // GSTR-1 has to be filed month after month; flag a gap before this period.
  const previous = gstPeriodOf(new Date(from.getTime() - 1));
  const hasEarlierSales = await Invoice.exists({ billingDate: { $lt: from }, gstVersion: GST_VERSION });
  if (hasEarlierSales && !(await filedPeriods([previous])).has(previous)) {
    issues.push({ level: "warning", message: `${periodLabel(previous)} isn't marked as filed — file returns in order.` });
  }

  return {
    ...result,
    issues,
    periods: periods.map((period) => ({ period, label: periodLabel(period), filed: filed.has(period) })),
    counts: { invoices: gstInvoices.length, legacyInvoices: legacy.length, creditNotes: creditNotes.length },
    placeOfSupplyNames: Object.fromEntries(
      [...new Set([...gstInvoices, ...creditNotes].map((d) => d.placeOfSupply?.code).filter(Boolean) as string[])].map(
        (code) => [code, gstStateName(code)],
      ),
    ),
  };
}

const HSN_PATTERN = new RegExp(`^\\d{${MIN_HSN_DIGITS},8}$`);

/**
 * Everything that has to be right before bills are GST-compliant: the
 * company's registration, and every active product's HSN, rate, unit and
 * prices. The GST page shows this as a checklist with one-click fixes.
 */
export async function gstReadiness() {
  const [products, hsnCodes, monthsWithSales, filings] = await Promise.all([
    Product.find({ isActive: true })
      .select("name type weightLabel sku category hsnCode gstRate uqc mrp sellingPrice")
      .sort({ name: 1, weightLabel: 1 })
      .lean(),
    HsnCode.find().select("code description gstRate").lean(),
    Invoice.aggregate<{ _id: string; count: number }>([
      { $match: { gstVersion: GST_VERSION, status: { $ne: "void" } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$billingDate", timezone: GST_TIME_ZONE } }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 24 },
    ]),
    GstFiling.find().select("period").lean(),
  ]);

  const needsWork = products
    .map((p) => {
      const problems: string[] = [];
      if (!HSN_PATTERN.test(p.hsnCode?.trim() ?? "")) problems.push("hsn");
      if (!isValidGstRate(p.gstRate)) problems.push("rate");
      if (p.uqc && !(p.uqc in UQC_CODES)) problems.push("uqc");
      if (priceFor(p, "inclusive") === null) problems.push("mrp");
      if (priceFor(p, "exclusive") === null) problems.push("b2bPrice");
      return { ...p, problems };
    })
    .filter((p) => p.problems.length > 0);

  const count = (problem: string) => needsWork.filter((p) => p.problems.includes(problem)).length;
  const filedSet = new Set(filings.map((f) => f.period));
  const currentPeriod = gstPeriodOf(new Date());

  return {
    supplier: {
      legalName: company.legalName,
      gstin: company.gstin,
      stateCode: company.stateCode,
      stateName: gstStateName(company.stateCode),
      issues: supplierIssues(),
    },
    products: {
      active: products.length,
      missingHsn: count("hsn"),
      missingRate: count("rate"),
      badUqc: count("uqc"),
      missingMrp: count("mrp"),
      missingB2bPrice: count("b2bPrice"),
      needsWork,
    },
    hsnCodes: hsnCodes.map((h) => ({ code: h.code, description: h.description, gstRate: h.gstRate ?? null })),
    months: monthsWithSales.map((m) => ({
      period: m._id,
      label: periodLabel(m._id),
      invoices: m.count,
      filed: filedSet.has(m._id),
      isCurrent: m._id === currentPeriod,
    })),
  };
}

/** One-click fix from the readiness checklist: give many products the same HSN / rate / unit. */
export async function bulkSetProductGst(input: { productIds: string[]; hsnCode?: string; gstRate?: number; uqc?: string }) {
  const set: Record<string, unknown> = {};
  if (input.hsnCode !== undefined) set.hsnCode = input.hsnCode;
  if (input.gstRate !== undefined) set.gstRate = input.gstRate;
  if (input.uqc !== undefined) set.uqc = input.uqc;
  const result = await Product.updateMany({ _id: { $in: input.productIds } }, { $set: set }, { runValidators: true });
  return { updated: result.modifiedCount };
}

/** Logged on startup so a wrong GSTIN/state in config is caught before any bill is made. */
export function gstConfigProblems(): string[] {
  return supplierIssues().map((issue) => issue.message);
}
