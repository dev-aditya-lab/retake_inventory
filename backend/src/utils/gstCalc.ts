import { round2 } from "./gst";

/**
 * How a line's unit price relates to GST:
 *  - "exclusive": B2B price list — GST is added on top.
 *  - "inclusive": retail MRP — the price already contains GST, which is worked
 *    out of it, so the customer pays exactly the MRP.
 */
export type PriceMode = "exclusive" | "inclusive";

/** Same state as the supplier → CGST + SGST; different state → IGST. */
export type SupplyType = "intra" | "inter";

export function supplyTypeFor(supplierStateCode: string, placeOfSupplyCode: string): SupplyType {
  return supplierStateCode === placeOfSupplyCode ? "intra" : "inter";
}

export interface TaxLineInput {
  product: string;
  name: string;
  hsnCode: string;
  uqc: string;
  quantity: number;
  /** Per the price mode: pre-tax rate (exclusive) or MRP (inclusive). */
  unitPrice: number;
  gstRate: number;
}

export interface TaxAmounts {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface TaxedLine extends TaxLineInput, TaxAmounts {
  /** What the customer pays for the line, tax included. */
  total: number;
}

export interface OtherChargesLine extends TaxAmounts {
  description: string;
  /** As entered on the bill (tax-inclusive or not, per the price mode). */
  amount: number;
  gstRate: number;
  hsnCode: string;
  uqc: string;
  total: number;
}

export interface RateSummaryRow extends TaxAmounts {
  gstRate: number;
}

export interface InvoiceTax extends TaxAmounts {
  lines: TaxedLine[];
  otherCharges: OtherChargesLine | null;
  rateSummary: RateSummaryRow[];
  totalTax: number;
  grandTotal: number;
}

/**
 * Tax on one amount. CGST and SGST are each computed at half the rate and
 * rounded on their own, so they're always equal — the GST portal rejects
 * intra-state rows where they differ, which halving a rounded total can
 * cause by a paisa. For inclusive prices the taxable value is what's left
 * after tax, so taxable + tax always equals the price paid exactly.
 */
export function taxOn(amount: number, gstRate: number, priceMode: PriceMode, supplyType: SupplyType): TaxAmounts {
  const gross = round2(amount);

  if (supplyType === "intra") {
    const half =
      priceMode === "exclusive"
        ? round2((gross * gstRate) / 200)
        : round2((gross - (gross * 100) / (100 + gstRate)) / 2);
    const taxableValue = priceMode === "exclusive" ? gross : round2(gross - 2 * half);
    return { taxableValue, cgst: half, sgst: half, igst: 0 };
  }

  const igst =
    priceMode === "exclusive" ? round2((gross * gstRate) / 100) : round2(gross - (gross * 100) / (100 + gstRate));
  const taxableValue = priceMode === "exclusive" ? gross : round2(gross - igst);
  return { taxableValue, cgst: 0, sgst: 0, igst };
}

const totalOf = (t: TaxAmounts) => round2(t.taxableValue + t.cgst + t.sgst + t.igst);

function sumAmounts(rows: TaxAmounts[]): TaxAmounts {
  return rows.reduce<TaxAmounts>(
    (acc, row) => ({
      taxableValue: round2(acc.taxableValue + row.taxableValue),
      cgst: round2(acc.cgst + row.cgst),
      sgst: round2(acc.sgst + row.sgst),
      igst: round2(acc.igst + row.igst),
    }),
    { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
  );
}

export interface ComputeInvoiceTaxInput {
  lines: TaxLineInput[];
  priceMode: PriceMode;
  supplyType: SupplyType;
  /** Packing/delivery charged on the bill — part of the taxable value (CGST s.15). */
  otherCharges?: number;
}

/**
 * Works out every line's taxable value and CGST/SGST/IGST, the per-rate
 * summary a tax invoice shows, and the bill totals.
 *
 * Other charges are taxed at the rate of the principal supply — the line with
 * the highest taxable value — as a composite supply (CGST s.8(a)), and are
 * reported under that line's HSN.
 */
export function computeInvoiceTax({ lines, priceMode, supplyType, otherCharges = 0 }: ComputeInvoiceTaxInput): InvoiceTax {
  if (lines.length === 0) throw new Error("An invoice needs at least one line");

  const taxedLines: TaxedLine[] = lines.map((line) => {
    const amounts = taxOn(line.quantity * line.unitPrice, line.gstRate, priceMode, supplyType);
    return { ...line, ...amounts, total: totalOf(amounts) };
  });

  let otherChargesLine: OtherChargesLine | null = null;
  const charges = round2(otherCharges);
  if (charges > 0) {
    const principal = taxedLines.reduce((best, line) => (line.taxableValue > best.taxableValue ? line : best));
    const amounts = taxOn(charges, principal.gstRate, priceMode, supplyType);
    otherChargesLine = {
      description: "Other charges",
      amount: charges,
      gstRate: principal.gstRate,
      hsnCode: principal.hsnCode,
      uqc: principal.uqc,
      ...amounts,
      total: totalOf(amounts),
    };
  }

  const taxedRows: (TaxAmounts & { gstRate: number })[] = [...taxedLines, ...(otherChargesLine ? [otherChargesLine] : [])];

  const rates = [...new Set(taxedRows.map((row) => row.gstRate))].sort((a, b) => a - b);
  const rateSummary = rates.map((gstRate) => ({
    gstRate,
    ...sumAmounts(taxedRows.filter((row) => row.gstRate === gstRate)),
  }));

  const totals = sumAmounts(taxedRows);
  const totalTax = round2(totals.cgst + totals.sgst + totals.igst);

  return {
    lines: taxedLines,
    otherCharges: otherChargesLine,
    rateSummary,
    ...totals,
    totalTax,
    grandTotal: round2(totals.taxableValue + totalTax),
  };
}
