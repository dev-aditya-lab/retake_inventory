import { describe, expect, it } from "vitest";
import { effectiveUnitPrice, normalizePriceOverride } from "./cartPricing";

describe("effectiveUnitPrice", () => {
  it("uses the edit over the list price", () => {
    expect(effectiveUnitPrice(90, 100)).toBe(90);
    expect(effectiveUnitPrice(90, null)).toBe(90);
  });
  it("falls back to the list price", () => {
    expect(effectiveUnitPrice(undefined, 100)).toBe(100);
    expect(effectiveUnitPrice(undefined, null)).toBeNull();
  });
});

describe("normalizePriceOverride", () => {
  it("rounds to paise", () => {
    expect(normalizePriceOverride(99.999)).toBe(100);
    expect(normalizePriceOverride(12.346)).toBe(12.35);
  });
  it("rejects zero, negative, NaN and huge prices", () => {
    expect(() => normalizePriceOverride(0)).toThrow();
    expect(() => normalizePriceOverride(-5)).toThrow();
    expect(() => normalizePriceOverride(Number.NaN)).toThrow();
    expect(() => normalizePriceOverride(20_000_000)).toThrow();
  });
});
