import { describe, expect, it } from "vitest";
import { buildEan12, buildEan13, computeEan13CheckDigit, isValidEan13 } from "./barcode";

describe("computeEan13CheckDigit", () => {
  it("matches the worked example from project.md", () => {
    // 400638133393 -> check digit 1 -> 4006381333931
    expect(computeEan13CheckDigit("400638133393")).toBe("1");
  });

  it("rejects input that isn't exactly 12 digits", () => {
    expect(() => computeEan13CheckDigit("123")).toThrow();
    expect(() => computeEan13CheckDigit("12345678901a")).toThrow();
  });
});

describe("buildEan12 / buildEan13", () => {
  it("builds Turmeric Whole 25g as 890110010101 per the seed CSV", () => {
    const ean12 = buildEan12({ productName: "Turmeric", type: "Whole", weightLabel: "25g" });
    expect(ean12).toBe("890110010101");
  });

  it("builds Turmeric Powder 25g as 890120010101 per the seed CSV", () => {
    const ean12 = buildEan12({ productName: "Turmeric", type: "Powder", weightLabel: "25g" });
    expect(ean12).toBe("890120010101");
  });

  it("builds Red Chilli Whole 250g as 890110020501 per the seed CSV", () => {
    const ean12 = buildEan12({ productName: "Red Chilli", type: "Whole", weightLabel: "250g" });
    expect(ean12).toBe("890110020501");
  });

  it("pads 3-digit blend product ids without truncating", () => {
    const ean12 = buildEan12({ productName: "Garam Masala", type: "Blend", weightLabel: "100g" });
    expect(ean12).toBe("890131010301");
  });

  it("appends a correct, verifiable check digit", () => {
    const ean13 = buildEan13({ productName: "Turmeric", type: "Whole", weightLabel: "25g" });
    expect(ean13).toHaveLength(13);
    expect(isValidEan13(ean13)).toBe(true);
  });

  it("throws for an unknown product name", () => {
    expect(() => buildEan12({ productName: "Not A Spice", type: "Whole", weightLabel: "25g" })).toThrow();
  });

  it("throws for an unknown weight label", () => {
    expect(() => buildEan12({ productName: "Turmeric", type: "Whole", weightLabel: "999g" })).toThrow();
  });
});

describe("isValidEan13", () => {
  it("accepts a genuine EAN-13", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
  });

  it("rejects a tampered check digit", () => {
    expect(isValidEan13("4006381333930")).toBe(false);
  });

  it("rejects non-13-digit input", () => {
    expect(isValidEan13("123")).toBe(false);
    expect(isValidEan13("abcdefghijklm")).toBe(false);
  });
});
