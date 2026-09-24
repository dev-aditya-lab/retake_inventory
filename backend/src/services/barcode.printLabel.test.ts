import { describe, expect, it } from "vitest";
import { generateBarcodePng, generatePrintBarcodePng } from "./barcode.service";

// EAN-13 with a valid check digit.
const EAN = "8901234567890";

/** Width, height and the dpi saved in the PNG's pHYs chunk (pixels per metre → per inch). */
function readPng(png: Buffer) {
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const at = png.indexOf("pHYs");
  const dpi = at === -1 ? null : Math.round(png.readUInt32BE(at + 4) * 0.0254);
  return { width, height, dpi };
}

describe("generatePrintBarcodePng", () => {
  it("saves 300 dpi in the file so label software prints it at true size", () => {
    expect(readPng(generatePrintBarcodePng(EAN)).dpi).toBe(300);
  });

  it("is at least the GS1 minimum EAN-13 size (80% ≈ 29.8 × 20.7 mm), close to 100% (37.3 × 25.9 mm)", () => {
    const { width, height } = readPng(generatePrintBarcodePng(EAN));
    const mm = (px: number) => (px / 300) * 25.4;
    expect(mm(width)).toBeGreaterThanOrEqual(37.29); // bars + quiet zones are wider than the 100% symbol
    expect(mm(width)).toBeLessThan(46);
    expect(mm(height)).toBeGreaterThanOrEqual(25.9);
    expect(mm(height)).toBeLessThan(36);
  });

  it("is much larger than the on-screen preview, which has no dpi to print by", () => {
    const preview = readPng(generateBarcodePng(EAN));
    const print = readPng(generatePrintBarcodePng(EAN));
    expect(print.width).toBeGreaterThan(preview.width);
    expect(preview.dpi).not.toBe(300);
  });

  it("refuses an invalid EAN-13", () => {
    expect(() => generatePrintBarcodePng("8901234567891")).toThrow();
  });
});
