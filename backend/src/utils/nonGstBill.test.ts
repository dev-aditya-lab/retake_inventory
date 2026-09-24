import { describe, expect, it } from "vitest";
import { computeNonGstTotals, nonGstPriceFor } from "./nonGstBill";

const line = (quantity: number, unitPrice: number) => ({ product: "p1", name: "Turmeric 100g", quantity, unitPrice });

describe("computeNonGstTotals", () => {
  it("bills exactly quantity × price with no tax added or extracted", () => {
    const totals = computeNonGstTotals([line(3, 45), line(2, 120.5)]);
    expect(totals.lines.map((l) => l.total)).toEqual([135, 241]);
    expect(totals.subtotal).toBe(376);
    expect(totals.grandTotal).toBe(376);
  });

  it("adds other charges on top of the lines", () => {
    const totals = computeNonGstTotals([line(1, 100)], 25.5);
    expect(totals.otherCharges).toBe(25.5);
    expect(totals.grandTotal).toBe(125.5);
  });

  it("rounds to paise without floating-point drift", () => {
    const totals = computeNonGstTotals([line(3, 0.1), line(1, 0.2)]);
    expect(totals.subtotal).toBe(0.5);
    expect(totals.grandTotal).toBe(0.5);
  });

  it("refuses an empty bill", () => {
    expect(() => computeNonGstTotals([])).toThrow();
  });
});

describe("nonGstPriceFor", () => {
  const product = { sellingPrice: 80, mrp: 100 };

  it("uses the B2B price for the b2b list and the MRP for retail", () => {
    expect(nonGstPriceFor(product, "b2b")).toBe(80);
    expect(nonGstPriceFor(product, "retail")).toBe(100);
  });

  it("returns null when that price isn't set", () => {
    expect(nonGstPriceFor({ sellingPrice: 80 }, "retail")).toBeNull();
    expect(nonGstPriceFor({ sellingPrice: 0, mrp: 100 }, "b2b")).toBeNull();
  });
});
