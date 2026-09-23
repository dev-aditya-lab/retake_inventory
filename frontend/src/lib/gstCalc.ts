// Browser copy of backend/src/utils/gstCalc.ts, used only to preview totals
// while an admin edits a bill. Keep the two in step — the server recomputes
// everything on save and is the source of truth.

export type PriceMode = "exclusive" | "inclusive";
export type SupplyType = "intra" | "inter";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface TaxAmounts {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/** CGST and SGST are each computed at half the rate so they're always equal (the portal requires it). */
export function taxOn(amount: number, gstRate: number, priceMode: PriceMode, supplyType: SupplyType): TaxAmounts {
  const gross = round2(amount);
  if (supplyType === "intra") {
    const half =
      priceMode === "exclusive" ? round2((gross * gstRate) / 200) : round2((gross - (gross * 100) / (100 + gstRate)) / 2);
    const taxableValue = priceMode === "exclusive" ? gross : round2(gross - 2 * half);
    return { taxableValue, cgst: half, sgst: half, igst: 0 };
  }
  const igst =
    priceMode === "exclusive" ? round2((gross * gstRate) / 100) : round2(gross - (gross * 100) / (100 + gstRate));
  const taxableValue = priceMode === "exclusive" ? gross : round2(gross - igst);
  return { taxableValue, cgst: 0, sgst: 0, igst };
}

export interface PreviewLine {
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

export function previewInvoiceTax(lines: PreviewLine[], priceMode: PriceMode, supplyType: SupplyType, otherCharges = 0) {
  const taxed = lines.map((line) => {
    const t = taxOn(line.quantity * line.unitPrice, line.gstRate, priceMode, supplyType);
    return { ...t, gstRate: line.gstRate, total: round2(t.taxableValue + t.cgst + t.sgst + t.igst) };
  });
  const rows = [...taxed];
  const charges = round2(otherCharges);
  if (charges > 0 && taxed.length > 0) {
    // Taxed at the principal supply's rate (the line with the highest taxable value).
    const principal = taxed.reduce((best, line) => (line.taxableValue > best.taxableValue ? line : best));
    const t = taxOn(charges, principal.gstRate, priceMode, supplyType);
    rows.push({ ...t, gstRate: principal.gstRate, total: round2(t.taxableValue + t.cgst + t.sgst + t.igst) });
  }
  const sum = (key: keyof TaxAmounts) => round2(rows.reduce((acc, row) => acc + row[key], 0));
  const totals = { taxableValue: sum("taxableValue"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst") };
  const totalTax = round2(totals.cgst + totals.sgst + totals.igst);
  return { lines: taxed, ...totals, totalTax, grandTotal: round2(totals.taxableValue + totalTax) };
}

/** GSTIN state = its first two digits. */
export function gstinStateCode(gstin: string): string {
  return gstin.trim().toUpperCase().slice(0, 2);
}

/** Loose shape check for the form (the server does the full check-digit validation). */
export function looksLikeGstin(value: string): boolean {
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(value.trim().toUpperCase());
}
