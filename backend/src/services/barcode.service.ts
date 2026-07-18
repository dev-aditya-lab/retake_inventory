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

/** Renders an invoice number as a CODE128 barcode PNG for the invoice footer (not an EAN-13 product code, so a different symbology). */
export function generateInvoiceBarcodePng(invoiceNumber: string): Buffer {
  const canvas = createCanvas(320, 100);
  JsBarcode(canvas, invoiceNumber, {
    format: "CODE128",
    lineColor: "#1a1817",
    width: 1.5,
    height: 60,
    displayValue: true,
    fontSize: 12,
    margin: 8,
  });
  return canvas.toBuffer("image/png");
}
