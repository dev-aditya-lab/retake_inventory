import { describe, expect, it } from "vitest";
import { documentSeries, documentSequence, formatDocumentNumber, isGstValidDocumentNumber } from "./invoiceNumber";

describe("formatDocumentNumber", () => {
  it("builds RTK-YYMMDD-NNNN with a zero-padded counter", () => {
    expect(formatDocumentNumber("RTK", "260923", 7)).toBe("RTK-260923-0007");
    expect(formatDocumentNumber("CN", "260923", 1)).toBe("CN-260923-0001");
  });

  it("stays within GST's 16-character limit", () => {
    expect(isGstValidDocumentNumber(formatDocumentNumber("RTK", "260923", 9999))).toBe(true);
    expect(isGstValidDocumentNumber("RTK-INV-260923-0001")).toBe(false); // the old 19-char format
  });

  it("doesn't truncate counters past 9999", () => {
    expect(formatDocumentNumber("RTK", "260923", 12345)).toBe("RTK-260923-12345");
  });
});

describe("documentSeries / documentSequence", () => {
  it("splits a number into its daily series and counter", () => {
    expect(documentSeries("RTK-260923-0012")).toBe("RTK-260923-");
    expect(documentSequence("RTK-260923-0012")).toBe(12);
    expect(documentSeries("RTK-INV-260720-0002")).toBe("RTK-INV-260720-");
  });
});
