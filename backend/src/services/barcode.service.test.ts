import { describe, expect, it } from "vitest";
import { encodeInvoiceBarcode, generateBarcodePng, generateBarcodeSvg } from "./barcode.service";
import { toBarRuns } from "../utils/barcode";

const VALID_EAN13 = "4006381333931";

describe("generateBarcodePng", () => {
  it("returns a PNG buffer for a valid barcode", () => {
    const buffer = generateBarcodePng(VALID_EAN13);
    expect(buffer).toBeInstanceOf(Buffer);
    // PNG magic bytes
    expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("throws for an invalid barcode", () => {
    expect(() => generateBarcodePng("not-a-barcode")).toThrow();
  });
});

describe("generateBarcodeSvg", () => {
  it("returns SVG markup for a valid barcode", () => {
    const svg = generateBarcodeSvg(VALID_EAN13);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("throws for an invalid barcode", () => {
    expect(() => generateBarcodeSvg("not-a-barcode")).toThrow();
  });
});

describe("encodeInvoiceBarcode", () => {
  const CODE128_STOP = "1100011101011";

  it("produces a complete CODE128 pattern: start code, 11-module symbols, stop code", () => {
    const modules = encodeInvoiceBarcode("RTK-INV-260923-0001");
    expect(modules).toMatch(/^[01]+$/);
    expect(modules).toMatch(/^110100(00100|10000|11100)/); // start A, B or C
    expect(modules.endsWith(CODE128_STOP)).toBe(true);
    expect((modules.length - CODE128_STOP.length) % 11).toBe(0);
  });

  it("draws exactly the pattern's bars when collapsed into runs", () => {
    const modules = encodeInvoiceBarcode("RTK-INV-260923-0001");
    const barModules = toBarRuns(modules).reduce((sum, run) => sum + run.width, 0);
    expect(barModules).toBe(modules.split("").filter((m) => m === "1").length);
  });
});
