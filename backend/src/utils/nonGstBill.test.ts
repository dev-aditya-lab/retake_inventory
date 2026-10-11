import { describe, expect, it } from "vitest";
import { computeNonGstTotals, fillTrendGaps, nonGstPriceFor } from "./nonGstBill";

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

describe("fillTrendGaps", () => {
  const row = (period: string, amount: number, billCount = 1) => ({ period, amount, billCount });

  it("adds zero rows for days with no sales, between the range's ends", () => {
    const filled = fillTrendGaps([row("2026-10-02", 500), row("2026-10-04", 250)], "daily", "2026-10-01", "2026-10-05");
    expect(filled.map((r) => r.period)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(filled.map((r) => r.amount)).toEqual([0, 500, 0, 250, 0]);
  });

  it("falls back to the first and last row when the range has no ends", () => {
    const filled = fillTrendGaps([row("2026-10-04", 1), row("2026-10-02", 1)], "daily");
    expect(filled.map((r) => r.period)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("steps over month and year boundaries", () => {
    expect(fillTrendGaps([row("2026-12-31", 1), row("2027-01-02", 1)], "daily").map((r) => r.period)).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(fillTrendGaps([row("2026-11", 1), row("2027-02", 1)], "monthly").map((r) => r.period)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("returns nothing when there are no sales and no range", () => {
    expect(fillTrendGaps([], "daily")).toEqual([]);
  });

  it("pads a whole quiet range with zeros", () => {
    const filled = fillTrendGaps([], "daily", "2026-10-01", "2026-10-03");
    expect(filled).toHaveLength(3);
    expect(filled.every((r) => r.amount === 0 && r.billCount === 0)).toBe(true);
  });

  it("leaves a huge span sparse instead of padding thousands of rows", () => {
    const rows = [row("2020-01-01", 1), row("2026-10-01", 1)];
    expect(fillTrendGaps(rows, "daily")).toEqual(rows);
  });
});
