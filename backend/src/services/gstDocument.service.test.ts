import { describe, expect, it } from "vitest";
import { buildGstDocument, resolveBuyer, type GstBillLine } from "./gstDocument.service";

// Any valid 15-character GSTIN will do — this one is Retake's own (Jharkhand).
const GSTIN = "20DQZPG0668A1Z0";

const line: GstBillLine = {
  product: "p1",
  name: "Turmeric 100g",
  hsnCode: "0910",
  uqc: "PAC",
  gstRate: 5,
  quantity: 10,
  unitPrice: 100,
};

describe("resolveBuyer — price list vs buyer type", () => {
  it("follows the GSTIN when no price list is given (how bills always worked)", () => {
    expect(resolveBuyer({ gstin: GSTIN }).priceMode).toBe("exclusive");
    expect(resolveBuyer({}).priceMode).toBe("inclusive");
  });

  it("takes the price list chosen at the counter, whatever the GSTIN says", () => {
    // B2B ticked but no GSTIN: B2B price + GST on top, still an unregistered buyer for GSTR-1.
    const b2bNoGstin = resolveBuyer({}, "exclusive");
    expect(b2bNoGstin.priceMode).toBe("exclusive");
    expect(b2bNoGstin.buyerType).toBe("B2C");

    // GSTIN entered but B2B not ticked: MRP with GST inside, yet reported as a registered (B2B) buyer.
    const gstinRetail = resolveBuyer({ gstin: GSTIN }, "inclusive");
    expect(gstinRetail.priceMode).toBe("inclusive");
    expect(gstinRetail.buyerType).toBe("B2B");
  });

  it("still rejects an invalid GSTIN", () => {
    expect(() => resolveBuyer({ gstin: "20DQZPG0668A1Z1" }, "exclusive")).toThrow();
  });
});

describe("buildGstDocument with an explicit price list", () => {
  it("adds GST on top for the B2B price list, even with no GSTIN", () => {
    const { fields } = buildGstDocument({ customer: { name: "Shop" }, lines: [line], priceMode: "exclusive" });
    expect(fields.priceMode).toBe("exclusive");
    expect(fields.buyerType).toBe("B2C");
    expect(fields.taxableValue).toBe(1000);
    expect(fields.totalTax).toBe(50);
    expect(fields.grandTotal).toBe(1050);
  });

  it("works GST out of the MRP for the retail price list, even with a GSTIN", () => {
    const { fields } = buildGstDocument({
      customer: { name: "Shop", gstin: GSTIN },
      lines: [line],
      priceMode: "inclusive",
    });
    expect(fields.priceMode).toBe("inclusive");
    expect(fields.buyerType).toBe("B2B");
    expect(fields.grandTotal).toBe(1000); // the customer pays exactly the MRP
    expect(fields.totalTax).toBeCloseTo(47.62, 2);
  });
});
