import { describe, expect, it } from "vitest";
import { computeInvoiceTax, supplyTypeFor, taxOn, type TaxLineInput } from "./gstCalc";

const line = (overrides: Partial<TaxLineInput> = {}): TaxLineInput => ({
  product: "p1",
  name: "Turmeric",
  hsnCode: "0910",
  uqc: "PAC",
  quantity: 1,
  unitPrice: 105,
  gstRate: 5,
  ...overrides,
});

describe("supplyTypeFor", () => {
  it("is intra-state when the place of supply is the supplier's state", () => {
    expect(supplyTypeFor("20", "20")).toBe("intra");
    expect(supplyTypeFor("20", "10")).toBe("inter");
  });
});

describe("taxOn — retail MRP (tax inclusive)", () => {
  it("works 5% GST out of a ₹105 MRP: ₹100 + ₹2.50 CGST + ₹2.50 SGST", () => {
    expect(taxOn(105, 5, "inclusive", "intra")).toEqual({ taxableValue: 100, cgst: 2.5, sgst: 2.5, igst: 0 });
  });

  it("always adds back up to exactly the MRP, even when the rupee split is awkward", () => {
    for (const mrp of [45, 49, 99, 120, 12.5, 1]) {
      const t = taxOn(mrp, 5, "inclusive", "intra");
      expect(t.cgst).toBe(t.sgst);
      expect(Math.round((t.taxableValue + t.cgst + t.sgst) * 100) / 100).toBe(mrp);
      const inter = taxOn(mrp, 5, "inclusive", "inter");
      expect(Math.round((inter.taxableValue + inter.igst) * 100) / 100).toBe(mrp);
    }
  });

  it("keeps the tax within a paisa of taxable value × rate", () => {
    const t = taxOn(45, 5, "inclusive", "intra"); // 42.857… taxable
    expect(Math.abs(t.cgst + t.sgst - t.taxableValue * 0.05)).toBeLessThanOrEqual(0.01);
  });
});

describe("taxOn — B2B price (tax exclusive)", () => {
  it("adds IGST on top for an inter-state sale", () => {
    expect(taxOn(200, 5, "exclusive", "inter")).toEqual({ taxableValue: 200, cgst: 0, sgst: 0, igst: 10 });
  });

  it("splits intra-state tax into equal CGST and SGST even on odd amounts", () => {
    const t = taxOn(33.33, 5, "exclusive", "intra");
    expect(t.taxableValue).toBe(33.33);
    expect(t.cgst).toBe(0.83);
    expect(t.sgst).toBe(0.83);
  });
});

describe("computeInvoiceTax", () => {
  it("totals a retail bill to exactly the sum of MRPs", () => {
    const tax = computeInvoiceTax({
      lines: [line({ quantity: 2, unitPrice: 105 }), line({ product: "p2", name: "Garam Masala", unitPrice: 84 })],
      priceMode: "inclusive",
      supplyType: "intra",
    });
    expect(tax.grandTotal).toBe(294);
    expect(tax.taxableValue).toBe(280);
    expect(tax.cgst).toBe(7);
    expect(tax.sgst).toBe(7);
    expect(tax.rateSummary).toEqual([{ gstRate: 5, taxableValue: 280, cgst: 7, sgst: 7, igst: 0 }]);
  });

  it("taxes other charges at the principal supply's rate and HSN", () => {
    const tax = computeInvoiceTax({
      lines: [
        line({ product: "big", hsnCode: "0910", unitPrice: 1000, gstRate: 5 }),
        line({ product: "small", hsnCode: "2106", unitPrice: 100, gstRate: 18 }),
      ],
      priceMode: "exclusive",
      supplyType: "inter",
      otherCharges: 50,
    });
    expect(tax.otherCharges).toMatchObject({ gstRate: 5, hsnCode: "0910", taxableValue: 50, igst: 2.5 });
    expect(tax.rateSummary).toEqual([
      { gstRate: 5, taxableValue: 1050, cgst: 0, sgst: 0, igst: 52.5 },
      { gstRate: 18, taxableValue: 100, cgst: 0, sgst: 0, igst: 18 },
    ]);
    expect(tax.grandTotal).toBe(1220.5);
  });

  it("handles a nil-rated (0%) line without inventing tax", () => {
    const tax = computeInvoiceTax({ lines: [line({ gstRate: 0, unitPrice: 50 })], priceMode: "inclusive", supplyType: "intra" });
    expect(tax.totalTax).toBe(0);
    expect(tax.grandTotal).toBe(50);
  });

  it("refuses an empty bill", () => {
    expect(() => computeInvoiceTax({ lines: [], priceMode: "exclusive", supplyType: "intra" })).toThrow();
  });
});
