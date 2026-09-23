import { describe, expect, it } from "vitest";
import { buildGstr1, type ReturnDoc } from "./gstr1";

const SUPPLIER = "20DQZPG0668A1Z0"; // Jharkhand
const BUYER_BIHAR = "10AABCU9603R1Z2"; // test GSTIN, fixed below to a valid check digit

// Build a valid Bihar GSTIN for the fixtures (the check digit is computed, not guessed).
import { gstinCheckDigit } from "./gstin";
const B2B_GSTIN = BUYER_BIHAR.slice(0, 14) + gstinCheckDigit(BUYER_BIHAR.slice(0, 14));

// 23 Sep 2026, midday IST
const SEP_23 = new Date("2026-09-23T06:30:00Z");

function doc(overrides: Partial<ReturnDoc>): ReturnDoc {
  return {
    kind: "invoice",
    number: "RTK-260923-0001",
    date: SEP_23,
    category: "B2CS",
    buyerGstin: "",
    posCode: "20",
    supplyType: "intra",
    value: 105,
    status: "paid",
    rateSummary: [{ gstRate: 5, taxableValue: 100, cgst: 2.5, sgst: 2.5, igst: 0 }],
    hsnLines: [
      { hsnCode: "0910", description: "Turmeric", uqc: "PAC", quantity: 1, gstRate: 5, taxableValue: 100, cgst: 2.5, sgst: 2.5, igst: 0 },
    ],
    ...overrides,
  };
}

const b2bInvoice = doc({
  number: "RTK-260923-0002",
  category: "B2B",
  buyerGstin: B2B_GSTIN,
  posCode: "10",
  supplyType: "inter",
  value: 2100,
  rateSummary: [{ gstRate: 5, taxableValue: 2000, cgst: 0, sgst: 0, igst: 100 }],
  hsnLines: [
    { hsnCode: "0910", description: "Turmeric", uqc: "PAC", quantity: 20, gstRate: 5, taxableValue: 2000, cgst: 0, sgst: 0, igst: 100 },
  ],
});

const b2clInvoice = doc({
  number: "RTK-260923-0004",
  category: "B2CL",
  posCode: "27",
  supplyType: "inter",
  value: 157500,
  rateSummary: [{ gstRate: 5, taxableValue: 150000, cgst: 0, sgst: 0, igst: 7500 }],
  hsnLines: [
    { hsnCode: "0904", description: "Red Chilli", uqc: "PAC", quantity: 1500, gstRate: 5, taxableValue: 150000, cgst: 0, sgst: 0, igst: 7500 },
  ],
});

describe("buildGstr1", () => {
  const retail1 = doc({});
  const retail2 = doc({ number: "RTK-260923-0003", value: 210, rateSummary: [{ gstRate: 5, taxableValue: 200, cgst: 5, sgst: 5, igst: 0 }], hsnLines: [{ hsnCode: "0910", description: "Turmeric", uqc: "PAC", quantity: 2, gstRate: 5, taxableValue: 200, cgst: 5, sgst: 5, igst: 0 }] });
  const cancelled = doc({ number: "RTK-260923-0005", status: "void" });
  // 0006 missing entirely (a burned number) -> counted as cancelled in Table 13.
  const retail7 = doc({ number: "RTK-260923-0007" });
  const retailReturn = doc({ kind: "credit-note", number: "CN-260925-0001", value: 105 });
  const b2bReturn = doc({
    ...b2bInvoice,
    kind: "credit-note",
    number: "CN-260925-0002",
    value: 210,
    rateSummary: [{ gstRate: 5, taxableValue: 200, cgst: 0, sgst: 0, igst: 10 }],
    hsnLines: [{ hsnCode: "0910", description: "Turmeric", uqc: "PAC", quantity: 2, gstRate: 5, taxableValue: 200, cgst: 0, sgst: 0, igst: 10 }],
  });

  const result = buildGstr1({
    supplierGstin: SUPPLIER,
    periods: ["2026-09"],
    invoices: [retail1, b2bInvoice, retail2, b2clInvoice, cancelled, retail7],
    creditNotes: [retailReturn, b2bReturn],
  });
  const json = result.json as Record<string, any>;

  it("has the portal header: GSTIN and filing period MMYYYY", () => {
    expect(json.gstin).toBe(SUPPLIER);
    expect(json.fp).toBe("092026");
  });

  it("reports B2B invoices per buyer GSTIN with dd-mm-yyyy dates and rate-wise IGST items", () => {
    expect(json.b2b).toEqual([
      {
        ctin: B2B_GSTIN,
        inv: [
          {
            inum: "RTK-260923-0002",
            idt: "23-09-2026",
            val: 2100,
            pos: "10",
            rchrg: "N",
            inv_typ: "R",
            itms: [{ num: 1, itm_det: { rt: 5, txval: 2000, iamt: 100, csamt: 0 } }],
          },
        ],
      },
    ]);
  });

  it("reports inter-state retail bills above ₹1 lakh invoice-wise in B2CL, grouped by state", () => {
    expect(json.b2cl).toEqual([
      {
        pos: "27",
        inv: [{ inum: "RTK-260923-0004", idt: "23-09-2026", val: 157500, itms: [{ num: 1, itm_det: { rt: 5, txval: 150000, iamt: 7500, csamt: 0 } }] }],
      },
    ]);
  });

  it("summarises other retail sales in B2CS by state and rate, net of retail returns, excluding cancelled bills", () => {
    // 100 + 200 + 100 (0007) - 100 (return); the cancelled 0005 is left out.
    expect(json.b2cs).toEqual([
      { sply_ty: "INTRA", pos: "20", typ: "OE", rt: 5, txval: 300, camt: 7.5, samt: 7.5, csamt: 0 },
    ]);
  });

  it("reports credit notes to registered buyers in CDNR", () => {
    expect(json.cdnr).toEqual([
      {
        ctin: B2B_GSTIN,
        nt: [
          {
            ntty: "C",
            nt_num: "CN-260925-0002",
            nt_dt: "23-09-2026",
            pos: "10",
            rchrg: "N",
            inv_typ: "R",
            val: 210,
            itms: [{ num: 1, itm_det: { rt: 5, txval: 200, iamt: 10, csamt: 0 } }],
          },
        ],
      },
    ]);
    expect(json.cdnur).toBeUndefined();
  });

  it("splits the HSN summary into B2B and B2C tables, net of returns", () => {
    expect(json.hsn.hsn_b2b).toEqual([
      { num: 1, hsn_sc: "0910", desc: "Turmeric", uqc: "PAC", qty: 18, rt: 5, txval: 1800, iamt: 90, camt: 0, samt: 0, csamt: 0 },
    ]);
    expect(json.hsn.hsn_b2c).toEqual([
      { num: 1, hsn_sc: "0904", desc: "Red Chilli", uqc: "PAC", qty: 1500, rt: 5, txval: 150000, iamt: 7500, camt: 0, samt: 0, csamt: 0 },
      { num: 2, hsn_sc: "0910", desc: "Turmeric", uqc: "PAC", qty: 3, rt: 5, txval: 300, iamt: 0, camt: 7.5, samt: 7.5, csamt: 0 },
    ]);
  });

  it("lists document ranges in Table 13, counting cancelled and missing numbers as cancelled", () => {
    expect(json.doc_issue).toEqual({
      doc_det: [
        { doc_num: 1, docs: [{ num: 1, from: "RTK-260923-0001", to: "RTK-260923-0007", totnum: 7, cancel: 2, net_issue: 5 }] },
        { doc_num: 5, docs: [{ num: 1, from: "CN-260925-0001", to: "CN-260925-0002", totnum: 2, cancel: 0, net_issue: 2 }] },
      ],
    });
  });

  it("gives GSTR-3B 3.1(a) as all taxable sales net of credit notes", () => {
    // Sales: 100+2000+200+150000+100 = 152400; returns 100+200 = 300.
    expect(result.gstr3b.outwardTaxable).toEqual({ taxableValue: 152100, igst: 7590, cgst: 7.5, sgst: 7.5, cess: 0 });
    expect(result.gstr3b.totalTaxLiability).toBe(7605);
  });

  it("gives GSTR-3B 3.2 as inter-state sales to unregistered buyers by state", () => {
    expect(result.gstr3b.interStateUnregistered).toEqual([{ pos: "27", taxableValue: 150000, igst: 7500 }]);
  });

  it("has no blocking issues for a clean month", () => {
    expect(result.issues.filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("buildGstr1 checks", () => {
  it("blocks old 19-character invoice numbers the portal would reject", () => {
    const { issues } = buildGstr1({
      supplierGstin: SUPPLIER,
      periods: ["2026-09"],
      invoices: [doc({ number: "RTK-INV-260923-0001" })],
      creditNotes: [],
    });
    expect(issues[0]).toMatchObject({ level: "error", documents: ["RTK-INV-260923-0001"] });
  });

  it("blocks a B2B bill with a mistyped GSTIN", () => {
    const { issues } = buildGstr1({
      supplierGstin: SUPPLIER,
      periods: ["2026-09"],
      invoices: [{ ...b2bInvoice, buyerGstin: "10AABCU9603R1Z0" }],
      creditNotes: [],
    });
    expect(issues.some((i) => i.level === "error" && i.message.includes("GSTIN"))).toBe(true);
  });

  it("blocks nil-rated lines rather than filing them in the wrong table", () => {
    const { issues } = buildGstr1({
      supplierGstin: SUPPLIER,
      periods: ["2026-09"],
      invoices: [doc({ rateSummary: [{ gstRate: 0, taxableValue: 50, cgst: 0, sgst: 0, igst: 0 }] })],
      creditNotes: [],
    });
    expect(issues.some((i) => i.message.includes("nil-rated"))).toBe(true);
  });

  it("uses the last month of a quarter as the filing period", () => {
    const { json } = buildGstr1({ supplierGstin: SUPPLIER, periods: ["2026-07", "2026-08", "2026-09"], invoices: [doc({})], creditNotes: [] });
    expect(json.fp).toBe("092026");
  });
});
