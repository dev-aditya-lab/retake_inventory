import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals, splitGst } from "./gst";

describe("splitGst", () => {
  it("returns nothing when GST is disabled", () => {
    expect(splitGst(100, "CGST_SGST", false)).toEqual({});
  });

  it("puts the whole amount under IGST", () => {
    expect(splitGst(11.25, "IGST", true)).toEqual({ igstAmount: 11.25 });
  });

  it("splits CGST+SGST evenly when the amount divides cleanly", () => {
    expect(splitGst(10, "CGST_SGST", true)).toEqual({ cgstAmount: 5, sgstAmount: 5 });
  });

  it("keeps CGST+SGST summing exactly to the total when independent rounding would drift", () => {
    // 11.25 / 2 = 5.625 -> naively rounds to 5.63 on both halves = 11.26, off by a paisa.
    const { cgstAmount, sgstAmount } = splitGst(11.25, "CGST_SGST", true);
    expect(cgstAmount! + sgstAmount!).toBeCloseTo(11.25, 2);
  });
});

describe("calculateInvoiceTotals", () => {
  it("computes subtotal, GST, and grand total for a simple cart", () => {
    const totals = calculateInvoiceTotals({
      items: [{ quantity: 2, unitPrice: 50 }],
      gstEnabled: true,
      gstPercentage: 5,
      otherCharges: 10,
    });
    expect(totals).toEqual({ subtotal: 100, gstAmount: 5, otherCharges: 10, grandTotal: 115 });
  });

  it("skips GST entirely when disabled", () => {
    const totals = calculateInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 150 }],
      gstEnabled: false,
      gstPercentage: 18,
      otherCharges: 0,
    });
    expect(totals).toEqual({ subtotal: 150, gstAmount: 0, otherCharges: 0, grandTotal: 150 });
  });

  it("rounds a repeating-decimal GST amount to two places", () => {
    const totals = calculateInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 150 }],
      gstEnabled: true,
      gstPercentage: 7.5,
      otherCharges: 0,
    });
    expect(totals.gstAmount).toBe(11.25);
    expect(totals.grandTotal).toBe(161.25);
  });
});
