import { round2 } from "./gst";
import type { PriceList } from "../models/NonGstBill.model";

export interface NonGstLineInput {
  product: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface NonGstBillTotals {
  lines: (NonGstLineInput & { total: number })[];
  subtotal: number;
  otherCharges: number;
  grandTotal: number;
}

/**
 * Totals of a bill with no GST: every line is quantity × price, and the bill
 * is the lines plus any other charges. Nothing is added or worked out of the
 * price — the customer pays exactly what the price list says.
 */
export function computeNonGstTotals(lines: NonGstLineInput[], otherCharges = 0): NonGstBillTotals {
  if (lines.length === 0) throw new Error("A bill needs at least one line");

  const priced = lines.map((line) => ({ ...line, total: round2(line.quantity * line.unitPrice) }));
  const subtotal = priced.reduce((sum, line) => round2(sum + line.total), 0);
  const charges = round2(otherCharges);

  return { lines: priced, subtotal, otherCharges: charges, grandTotal: round2(subtotal + charges) };
}

/** The price a product sells at on the chosen list, or null if that price isn't set. */
export function nonGstPriceFor(product: { sellingPrice?: number | null; mrp?: number | null }, priceList: PriceList): number | null {
  const price = priceList === "b2b" ? product.sellingPrice : product.mrp;
  return typeof price === "number" && price > 0 ? price : null;
}

/** Human label for a price list, for error messages. */
export function priceListLabel(priceList: PriceList): string {
  return priceList === "b2b" ? "B2B price" : "MRP";
}
