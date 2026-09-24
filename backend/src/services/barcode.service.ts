import { createCanvas } from "canvas";
import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import JsBarcode from "jsbarcode";
import { isValidEan13 } from "../utils/barcode";
import { ApiError } from "../utils/ApiError";

const RENDER_OPTIONS = {
  format: "EAN13" as const,
  lineColor: "#1a1817",
  width: 2,
  height: 100,
  displayValue: true,
  fontSize: 16,
  margin: 10,
};

function assertValid(ean13: string): void {
  if (!isValidEan13(ean13)) {
    throw ApiError.badRequest(`"${ean13}" is not a valid EAN-13 barcode`);
  }
}

/** Renders an EAN-13 barcode as a PNG buffer, generated on demand (never persisted). */
export function generateBarcodePng(ean13: string): Buffer {
  assertValid(ean13);
  const canvas = createCanvas(320, 160);
  JsBarcode(canvas, ean13, RENDER_OPTIONS);
  return canvas.toBuffer("image/png");
}

// Print-ready label. Phone cameras read a barcode by counting pixels per bar, so
// on a small pack the size it is PRINTED at decides how fast it scans. The GS1
// standard minimum is 80% of the nominal EAN-13 (bar width 0.264 mm); 100% is
// recommended. 4 px per bar at 300 dpi is 0.339 mm — about 103% — with whole
// pixels per bar (no blurry anti-aliased edges) and the required quiet zones.
const PRINT_DPI = 300;
const PRINT_MODULE_PX = 4;
const PRINT_OPTIONS = {
  format: "EAN13" as const,
  lineColor: "#000000", // pure black on pure white: contrast is what cameras need most
  background: "#ffffff",
  width: PRINT_MODULE_PX,
  height: 260, // ≈ 22 mm of bars at 300 dpi (nominal is 22.85 mm)
  displayValue: true,
  fontSize: 44,
  textMargin: 6,
  marginTop: 24,
  marginBottom: 24,
  marginLeft: 8, // JsBarcode already leaves the 11+ module left quiet zone for the first digit
  marginRight: 7 * PRINT_MODULE_PX + 8, // right quiet zone: at least 7 bars wide
};

/**
 * A 300 dpi PNG whose pixel size is the real print size (≈ 40 × 30 mm), with
 * the dpi saved in the file so label software prints it at 100% instead of
 * scaling it down. Never persisted — generated on demand like the preview.
 */
export function generatePrintBarcodePng(ean13: string): Buffer {
  assertValid(ean13);
  const canvas = createCanvas(1, 1); // JsBarcode resizes it to fit
  JsBarcode(canvas, ean13, PRINT_OPTIONS);
  return canvas.toBuffer("image/png", { resolution: PRINT_DPI });
}

/** Renders an EAN-13 barcode as an SVG string, generated on demand (never persisted). */
export function generateBarcodeSvg(ean13: string): string {
  assertValid(ean13);
  // jsbarcode has no native Node SVG target — it draws into whatever
  // SVG-shaped DOM element it's given, so xmldom stands in for a browser DOM.
  const document = new DOMImplementation().createDocument("http://www.w3.org/1999/xhtml", "html", null);
  const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svgNode, ean13, { ...RENDER_OPTIONS, xmlDocument: document });
  return new XMLSerializer().serializeToString(svgNode);
}

/**
 * CODE128 module pattern ("1" = bar, "0" = space) for an invoice number. The
 * PDF draws this as vector bars (see pdf/InvoicePdf.tsx) rather than
 * embedding a PNG: a raster image gets scaled into the PDF's box, which
 * blurred and distorted the bars until they couldn't be read or scanned.
 */
export function encodeInvoiceBarcode(invoiceNumber: string): string {
  const encoded: { encodings?: { data: string }[] } = {};
  JsBarcode(encoded, invoiceNumber, { format: "CODE128" });
  const modules = encoded.encodings?.map((e) => e.data).join("") ?? "";
  if (!modules) throw ApiError.badRequest(`"${invoiceNumber}" can't be encoded as a barcode`);
  return modules;
}

/** Renders an invoice number as a CODE128 barcode PNG (not an EAN-13 product code, so a different symbology). */
export function generateInvoiceBarcodePng(invoiceNumber: string): Buffer {
  const canvas = createCanvas(320, 100);
  JsBarcode(canvas, invoiceNumber, {
    format: "CODE128",
    lineColor: "#000000",
    // Whole pixels per module: a fractional width (was 1.5) anti-aliases
    // every bar edge into grey, which scanners struggle with.
    width: 2,
    height: 60,
    displayValue: true,
    fontSize: 12,
    margin: 8,
  });
  return canvas.toBuffer("image/png");
}
