import { describe, expect, it } from "vitest";
import { numberToWordsINR } from "./numberToWords";

describe("numberToWordsINR", () => {
  it("handles zero", () => {
    expect(numberToWordsINR(0)).toBe("Zero Rupees Only");
  });

  it("handles a simple whole-rupee amount", () => {
    expect(numberToWordsINR(500)).toBe("Five Hundred Rupees Only");
  });

  it("handles thousands", () => {
    expect(numberToWordsINR(23456)).toBe("Twenty Three Thousand Four Hundred Fifty Six Rupees Only");
  });

  it("handles lakhs and paise together", () => {
    expect(numberToWordsINR(123456.78)).toBe(
      "One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees and Seventy Eight Paise Only",
    );
  });

  it("handles crores", () => {
    expect(numberToWordsINR(20000000)).toBe("Two Crore Rupees Only");
  });

  it("handles paise-only amounts under one rupee", () => {
    expect(numberToWordsINR(0.5)).toBe("Zero Rupees and Fifty Paise Only");
  });

  it("rounds fractional paise", () => {
    expect(numberToWordsINR(10.005)).toBe("Ten Rupees and One Paise Only");
  });
});
