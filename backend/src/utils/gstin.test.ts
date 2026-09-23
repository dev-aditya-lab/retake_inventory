import { describe, expect, it } from "vitest";
import { gstinCheckDigit, gstinProblem, gstinStateCode, isValidGstin } from "./gstin";

describe("GSTIN validation", () => {
  it("accepts Retake's own registered GSTIN", () => {
    expect(isValidGstin("20DQZPG0668A1Z0")).toBe(true);
    expect(gstinStateCode("20DQZPG0668A1Z0")).toBe("20"); // Jharkhand
  });

  it("accepts lower case and stray spaces (normalizes first)", () => {
    expect(isValidGstin(" 20dqzpg0668a1z0 ")).toBe(true);
  });

  it("catches a single mistyped character via the check digit", () => {
    expect(gstinProblem("20DQZPG0668A1Z1")).toBe("checksum");
    expect(gstinProblem("20DQZPG0669A1Z0")).toBe("checksum");
  });

  it("rejects wrong shapes and unknown state codes", () => {
    expect(gstinProblem("12345")).toBe("format");
    expect(gstinProblem("GSTIN-NOT-SET")).toBe("format");
    const unknownState = `99DQZPG0668A1Z`;
    expect(gstinProblem(unknownState + gstinCheckDigit(unknownState))).toBe("state");
  });

  it("computes a check digit that round-trips", () => {
    const body = "27AAPFU0939F1Z";
    expect(isValidGstin(body + gstinCheckDigit(body))).toBe(true);
  });
});
