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

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

/**
 * Who a bill belongs to, as an aggregation expression. Non-GST bills keep the
 * customer as typed on the bill (there is no directory link), so the same
 * person shows up as "98765 43210", "+91-9876543210" and "09876543210". The
 * key is the last 10 digits of the phone — or, for a bill with no usable phone,
 * the lower-cased name — so those all collapse into one customer.
 */
export const NON_GST_CUSTOMER_KEY_EXPR = {
  $let: {
    vars: {
      digits: {
        $reduce: {
          input: { $regexFindAll: { input: { $ifNull: ["$customer.phone", ""] }, regex: "\\d" } },
          initialValue: "",
          in: { $concat: ["$$value", "$$this.match"] },
        },
      },
    },
    in: {
      $cond: [
        { $gte: [{ $strLenCP: "$$digits" }, 10] },
        { $substrCP: ["$$digits", { $subtract: [{ $strLenCP: "$$digits" }, 10] }, 10] },
        { $concat: ["name:", { $toLower: { $trim: { input: { $ifNull: ["$customer.name", ""] } } } }] },
      ],
    },
  },
};

/** How the Customers tab can be ordered. */
export const CUSTOMER_SORTS = ["recent", "spent", "due", "bills", "name"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export type TrendPeriod = "daily" | "monthly";

export interface TrendRow {
  /** "YYYY-MM-DD" (daily) or "YYYY-MM" (monthly), India time. */
  period: string;
  amount: number;
  billCount: number;
}

/** Past this many buckets a sparse chart is better than a huge padded one. */
const MAX_FILLED_BUCKETS = 400;

/** The bucket after `key`: the next day or the next month. */
function nextKey(key: string, period: TrendPeriod): string {
  if (period === "daily") {
    const [y, m, d] = key.split("-").map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  const [y, m] = key.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/**
 * Pads a trend with zero rows for the days (or months) that had no sales, so a
 * chart shows quiet days as quiet rather than skipping over them. `firstKey` /
 * `lastKey` are the range's own ends when it has them; otherwise the first and
 * last row decide.
 */
export function fillTrendGaps(rows: TrendRow[], period: TrendPeriod, firstKey?: string, lastKey?: string): TrendRow[] {
  const sorted = [...rows].sort((a, b) => a.period.localeCompare(b.period));
  const first = firstKey ?? sorted[0]?.period;
  const last = lastKey ?? sorted[sorted.length - 1]?.period;
  if (!first || !last || first > last) return sorted;

  const byKey = new Map(sorted.map((row) => [row.period, row]));
  const filled: TrendRow[] = [];
  for (let key = first; key <= last; key = nextKey(key, period)) {
    filled.push(byKey.get(key) ?? { period: key, amount: 0, billCount: 0 });
    if (filled.length > MAX_FILLED_BUCKETS) return sorted;
  }
  return filled;
}
