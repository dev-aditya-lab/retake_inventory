import { describe, expect, it } from "vitest";
import { normalizeIndianPhone } from "./phone";

describe("normalizeIndianPhone", () => {
  it("adds the 91 prefix to a bare 10-digit number", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("919876543210");
  });

  it("strips formatting characters before normalizing", () => {
    expect(normalizeIndianPhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizeIndianPhone("(987) 654-3210")).toBe("919876543210");
  });

  it("leaves an already-prefixed 12-digit number as-is", () => {
    expect(normalizeIndianPhone("919876543210")).toBe("919876543210");
  });

  it("strips a leading 0 trunk prefix", () => {
    expect(normalizeIndianPhone("09876543210")).toBe("919876543210");
  });
});
