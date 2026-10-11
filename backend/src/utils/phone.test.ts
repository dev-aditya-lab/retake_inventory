import { describe, expect, it } from "vitest";
import { indianMobile, normalizeIndianPhone, phoneKey, phoneSearchPattern } from "./phone";

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

describe("phoneKey", () => {
  it("gives the same key for every formatting of one number", () => {
    const key = "919876543210";
    expect(phoneKey("9876543210")).toBe(key);
    expect(phoneKey("+91 98765-43210")).toBe(key);
    expect(phoneKey("09876543210")).toBe(key);
  });

  it("is undefined for blank or too-short input", () => {
    expect(phoneKey(undefined)).toBeUndefined();
    expect(phoneKey("")).toBeUndefined();
    expect(phoneKey("-")).toBeUndefined();
    expect(phoneKey("12345")).toBeUndefined();
  });
});

describe("indianMobile", () => {
  it("gives the bare 10 digits for every way a mobile is typed", () => {
    for (const typed of ["9876543210", "98765 43210", "+91 98765-43210", "09876543210", "919876543210"]) {
      expect(indianMobile(typed), typed).toBe("9876543210");
    }
  });

  it("rejects anything that is not an Indian mobile", () => {
    for (const typed of ["", "12345", "5876543210", "0612345678", "98765432", "98765432109", "+1 415 555 0100"]) {
      expect(indianMobile(typed), typed).toBeUndefined();
    }
    expect(indianMobile(undefined)).toBeUndefined();
  });
});

describe("phoneSearchPattern", () => {
  const pattern = new RegExp(phoneSearchPattern("919876543210")!);

  it("matches every way the number is typed on a bill", () => {
    for (const typed of ["9876543210", "98765 43210", "+91 98765-43210", "09876543210", "919876543210", " (+91) 98765 43210 "]) {
      expect(pattern.test(typed), typed).toBe(true);
    }
  });

  it("does not match a different number, or one that merely contains these digits", () => {
    for (const typed of ["9876543211", "98765432109", "19876543210", "1 9876543210 5", ""]) {
      expect(pattern.test(typed), typed).toBe(false);
    }
  });

  it("is undefined when there is no real number", () => {
    expect(phoneSearchPattern("")).toBeUndefined();
    expect(phoneSearchPattern("12345")).toBeUndefined();
  });
});
