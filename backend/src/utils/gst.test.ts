import { describe, expect, it } from "vitest";
import { round2 } from "./gst";

describe("round2", () => {
  it("rounds to paise", () => {
    expect(round2(10.004)).toBe(10);
    expect(round2(10.006)).toBe(10.01);
    expect(round2(2.5)).toBe(2.5);
  });
});
