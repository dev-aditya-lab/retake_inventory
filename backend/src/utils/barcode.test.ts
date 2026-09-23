import { describe, expect, it } from "vitest";
import { buildEan12, buildEan13, computeEan13CheckDigit, decodeEan13, isValidEan13, toBarRuns } from "./barcode";

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
    const ean12 = buildEan12({ productId: 1, type: "Whole", weightLabel: "25g" });
    expect(ean12).toBe("890110010101");
  });

  it("builds Turmeric Powder 25g as 890120010101 per the seed CSV", () => {
    const ean12 = buildEan12({ productId: 1, type: "Powder", weightLabel: "25g" });
    expect(ean12).toBe("890120010101");
  });

  it("builds Red Chilli Whole 250g as 890110020501 per the seed CSV", () => {
    const ean12 = buildEan12({ productId: 2, type: "Whole", weightLabel: "250g" });
    expect(ean12).toBe("890110020501");
  });

  it("pads 3-digit blend product ids without truncating", () => {
    const ean12 = buildEan12({ productId: 101, type: "Blend", weightLabel: "100g" });
    expect(ean12).toBe("890131010301");
  });

  it("appends a correct, verifiable check digit", () => {
    const ean13 = buildEan13({ productId: 1, type: "Whole", weightLabel: "25g" });
    expect(ean13).toHaveLength(13);
    expect(isValidEan13(ean13)).toBe(true);
  });

  it("throws for a product id outside the 3-digit PPP range", () => {
    expect(() => buildEan12({ productId: 0, type: "Whole", weightLabel: "25g" })).toThrow();
    expect(() => buildEan12({ productId: 1000, type: "Whole", weightLabel: "25g" })).toThrow();
    expect(() => buildEan12({ productId: 1.5, type: "Whole", weightLabel: "25g" })).toThrow();
  });

  it("throws for an unknown weight label", () => {
    expect(() => buildEan12({ productId: 1, type: "Whole", weightLabel: "999g" })).toThrow();
  });
});

describe("decodeEan13", () => {
  it("round-trips buildEan13 for a single spice", () => {
    const ean13 = buildEan13({ productId: 2, type: "Powder", weightLabel: "200g" });
    expect(decodeEan13(ean13)).toEqual({
      type: "Powder",
      productId: 2,
      weightLabel: "200g",
      variant: "01",
    });
  });

  it("round-trips buildEan13 for a blend", () => {
    const ean13 = buildEan13({ productId: 102, type: "Blend", weightLabel: "50g" });
    expect(decodeEan13(ean13)).toEqual({
      type: "Blend",
      productId: 102,
      weightLabel: "50g",
      variant: "01",
    });
  });

  it("throws for a code outside Retake's country prefix", () => {
    expect(() => decodeEan13("4006381333931")).toThrow();
  });

  it("throws for a malformed code", () => {
    expect(() => decodeEan13("not-a-barcode")).toThrow();
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

describe("toBarRuns", () => {
  it("collapses consecutive bar modules into runs", () => {
    expect(toBarRuns("1101100")).toEqual([
      { x: 0, width: 2 },
      { x: 3, width: 2 },
    ]);
  });

  it("closes a run that reaches the end of the pattern", () => {
    expect(toBarRuns("0111")).toEqual([{ x: 1, width: 3 }]);
  });

  it("returns no runs for an all-space pattern", () => {
    expect(toBarRuns("000")).toEqual([]);
  });
});
