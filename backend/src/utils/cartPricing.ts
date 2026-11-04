import { round2 } from "./gst";

/**
 * A cashier may change a line's price while billing (a negotiated rate, a
 * damaged piece). The edited price replaces the list price for that line only:
 * on a retail bill it is the GST-inclusive price, on a B2B bill the price
 * before GST, on a non-GST bill the price as charged.
 */

export const MAX_PRICE_OVERRIDE = 10_000_000;

/** The price a line is billed at: the cashier's edit if there is one, else the product's list price (null = not set). */
export function effectiveUnitPrice(override: number | undefined, listPrice: number | null): number | null {
  return override !== undefined ? override : listPrice;
}

/** An override as it is stored: rounded to paise. Throws a plain Error if it is not a sensible price. */
export function normalizePriceOverride(price: number): number {
  const rounded = round2(price);
  if (!Number.isFinite(rounded) || rounded <= 0) throw new Error("Enter a price greater than 0");
  if (rounded > MAX_PRICE_OVERRIDE) throw new Error("That price is too large");
  return rounded;
}
