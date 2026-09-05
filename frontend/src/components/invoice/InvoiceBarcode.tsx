"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * Renders the invoice-number barcode entirely client-side (same CODE128
 * symbology as the server-generated PDF) instead of loading it from
 * `/api/invoices/:id/barcode` as an <img>. That endpoint call was a separate
 * network request racing window.print() — on a slow connection or a
 * momentary backend hiccup the image could still be loading (or have failed)
 * when the browser rendered the printed page, leaving the barcode blank.
 * Drawing it locally from data already on the page removes that dependency.
 */
export function InvoiceBarcode({ value, className }: { value: string; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, value, {
      format: "CODE128",
      lineColor: "#1a1817",
      width: 1.5,
      height: 40,
      displayValue: true,
      fontSize: 12,
      margin: 4,
    });
  }, [value]);

  return <svg ref={svgRef} role="img" aria-label={value} className={className} />;
}
