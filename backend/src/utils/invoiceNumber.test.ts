import { describe, expect, it } from "vitest";
import { dateKeyFor, formatInvoiceNumber } from "./invoiceNumber";

describe("dateKeyFor", () => {
  it("formats as YYMMDD", () => {
    expect(dateKeyFor(new Date(2026, 6, 21))).toBe("260721");
  });

  it("pads single-digit months and days", () => {
    expect(dateKeyFor(new Date(2026, 0, 5))).toBe("260105");
  });
});

describe("formatInvoiceNumber", () => {
  it("zero-pads the sequence to 4 digits", () => {
    expect(formatInvoiceNumber("RTK-INV", "260721", 7)).toBe("RTK-INV-260721-0007");
  });

  it("does not truncate a sequence already >= 4 digits", () => {
    expect(formatInvoiceNumber("RTK-INV", "260721", 12345)).toBe("RTK-INV-260721-12345");
  });
});
