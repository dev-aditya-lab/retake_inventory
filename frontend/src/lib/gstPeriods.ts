// Return periods for the GST page. A period is "YYYY-MM" in India time —
// the same calendar the backend files returns in.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The current month in India, as "YYYY-MM". */
export function currentGstPeriod(now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}`;
}

export function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

/** "2026-09" -> "Sep 2026" */
export function periodLabel(period: string): string {
  const [year, month] = period.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** The last `count` months, newest first. */
export function recentMonths(count: number, now = new Date()): string[] {
  const current = currentGstPeriod(now);
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, -i));
}

export interface QuarterOption {
  from: string;
  to: string;
  label: string;
}

/**
 * GST quarters follow the financial year: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar.
 * The last `count` quarters, newest first.
 */
export function recentQuarters(count: number, now = new Date()): QuarterOption[] {
  const current = currentGstPeriod(now);
  const [, month] = current.split("-").map(Number) as [number, number];
  // First month of the financial quarter containing `current`: 4, 7, 10 or 1.
  const offsetIntoQuarter = (month - 1) % 3; // Jan/Apr/Jul/Oct -> 0
  let start = shiftPeriod(current, -offsetIntoQuarter);
  const quarters: QuarterOption[] = [];
  for (let i = 0; i < count; i++) {
    const end = shiftPeriod(start, 2);
    quarters.push({ from: start, to: end, label: `${periodLabel(start).split(" ")[0]}–${periodLabel(end)}` });
    start = shiftPeriod(start, -3);
  }
  return quarters;
}
