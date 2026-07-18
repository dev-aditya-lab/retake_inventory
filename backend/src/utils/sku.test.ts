import { describe, expect, it } from "vitest";
import { buildSku } from "./sku";

describe("buildSku", () => {
  it("matches the seeded product.csv SKU for Turmeric Whole 25g", () => {
    expect(buildSku("Turmeric", "Whole", "25g")).toBe("RTK-TUR-WH-025");
  });

  it("matches the seeded product.csv SKU for Red Chilli Powder 200g", () => {
    expect(buildSku("Red Chilli", "Powder", "200g")).toBe("RTK-RCP-PW-200");
  });

  it("matches the seeded product.csv SKU for a blend", () => {
    expect(buildSku("Garam Masala", "Blend", "100g")).toBe("RTK-GRM-BL-100");
  });

  it("pads all weight labels to 3 digits", () => {
    expect(buildSku("Turmeric", "Whole", "50g")).toBe("RTK-TUR-WH-050");
    expect(buildSku("Turmeric", "Whole", "250g")).toBe("RTK-TUR-WH-250");
  });

  it("throws for a product with no SKU code", () => {
    expect(() => buildSku("Not A Spice", "Whole", "25g")).toThrow();
  });

  it("accepts any numeric weight label, not just the 5 standard sizes", () => {
    expect(buildSku("Turmeric", "Whole", "999g")).toBe("RTK-TUR-WH-999");
  });

  it("throws for a malformed weight label", () => {
    expect(() => buildSku("Turmeric", "Whole", "large")).toThrow();
  });
});
