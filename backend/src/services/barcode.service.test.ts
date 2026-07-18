import { describe, expect, it } from "vitest";
import { generateBarcodePng, generateBarcodeSvg } from "./barcode.service";

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
