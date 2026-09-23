import { describe, expect, it } from "vitest";
import { buildSku, replaceSkuCode } from "./sku";

describe("buildSku", () => {
  it("matches the seeded product.csv SKU for Turmeric Whole 25g", () => {
    expect(buildSku("TUR", "Whole", "25g")).toBe("RTK-TUR-WH-025");
  });

  it("matches the seeded product.csv SKU for Red Chilli Powder 200g", () => {
    expect(buildSku("RCP", "Powder", "200g")).toBe("RTK-RCP-PW-200");
  });

  it("matches the seeded product.csv SKU for a blend", () => {
    expect(buildSku("GRM", "Blend", "100g")).toBe("RTK-GRM-BL-100");
  });

  it("pads all weight labels to 3 digits", () => {
    expect(buildSku("TUR", "Whole", "50g")).toBe("RTK-TUR-WH-050");
    expect(buildSku("TUR", "Whole", "250g")).toBe("RTK-TUR-WH-250");
  });

  it("upper-cases the SKU code", () => {
    expect(buildSku("tur", "Whole", "25g")).toBe("RTK-TUR-WH-025");
  });

  it("throws for an empty SKU code", () => {
    expect(() => buildSku("", "Whole", "25g")).toThrow();
  });

  it("accepts any numeric weight label, not just the 5 standard sizes", () => {
    expect(buildSku("TUR", "Whole", "999g")).toBe("RTK-TUR-WH-999");
  });

  it("throws for a malformed weight label", () => {
    expect(() => buildSku("TUR", "Whole", "large")).toThrow();
  });
});

describe("replaceSkuCode", () => {
  it("swaps the product segment of an auto-built SKU", () => {
    expect(replaceSkuCode("RTK-AMP-PW-100", "AMP", "AMC")).toBe("RTK-AMC-PW-100");
  });

  it("returns null for a SKU that wasn't built from the old code", () => {
    expect(replaceSkuCode("EXT-12345", "AMP", "AMC")).toBeNull();
    expect(replaceSkuCode("RTK-TUR-WH-025", "AMP", "AMC")).toBeNull();
  });

  it("doesn't match a code that is only a prefix of another", () => {
    // Renaming "TU" must not touch Turmeric's "TUR" SKUs.
    expect(replaceSkuCode("RTK-TUR-WH-025", "TU", "TX")).toBeNull();
  });
});
