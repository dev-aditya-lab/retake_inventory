/** ₹1,23,456.00 — Indian digit grouping, always two decimals. */
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 22 Sept 2026 */
export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** 22 Sept 2026, 4:05 pm */
export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Converts a local <input type="date"> value (YYYY-MM-DD) to an ISO datetime
 * at the start or end of that day in the user's timezone — so "22 Sept" means
 * the whole of 22 Sept in India, not UTC.
 */
export function localDayBoundaryIso(date: string, edge: "start" | "end"): string {
  const time = edge === "start" ? "T00:00:00" : "T23:59:59.999";
  return new Date(`${date}${time}`).toISOString();
}
