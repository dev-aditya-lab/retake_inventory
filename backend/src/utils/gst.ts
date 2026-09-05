export type GstType = "CGST_SGST" | "IGST";

export interface GstSplit {
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Splits a GST amount into CGST+SGST or IGST. Rounds one half then derives
 * the other as the remainder, so the two halves always sum exactly to
 * `gstAmount` — rounding each half independently can drift by a paisa
 * (e.g. 5.625 -> 5.63 twice = 11.26 when the real total is 11.25).
 */
export function splitGst(gstAmount: number, type: GstType | undefined, enabled: boolean): GstSplit {
  if (!enabled || !type) return {};

  if (type === "IGST") {
    return { igstAmount: gstAmount };
  }

  const cgstAmount = round2(gstAmount / 2);
  const sgstAmount = round2(gstAmount - cgstAmount);
  return { cgstAmount, sgstAmount };
}

export interface InvoiceTotalsInput {
  items: { quantity: number; unitPrice: number }[];
  gstEnabled: boolean;
  gstPercentage: number;
  otherCharges: number;
}

export interface InvoiceTotals {
  subtotal: number;
  gstAmount: number;
  otherCharges: number;
  grandTotal: number;
}

export function calculateInvoiceTotals({ items, gstEnabled, gstPercentage, otherCharges }: InvoiceTotalsInput): InvoiceTotals {
  const subtotal = round2(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const gstAmount = gstEnabled ? round2(subtotal * (gstPercentage / 100)) : 0;
  const roundedOtherCharges = round2(otherCharges || 0);
  const grandTotal = round2(subtotal + gstAmount + roundedOtherCharges);
  return { subtotal, gstAmount, otherCharges: roundedOtherCharges, grandTotal };
}
