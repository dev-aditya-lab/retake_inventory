import type { PriceMode } from "@/lib/gstCalc";

/** B2B bills add GST on top of the B2B price; retail bills charge the MRP, which already includes GST. */
export function BuyerBadge({ priceMode }: { priceMode: PriceMode }) {
  return priceMode === "exclusive" ? (
    <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-xs font-medium text-leaf-700">B2B · price + GST</span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Retail · MRP incl. GST</span>
  );
}
