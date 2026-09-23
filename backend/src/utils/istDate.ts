// Indian-calendar date helpers for GST. Invoice numbers, "which month is this
// bill in" and GSTR-1 dates must follow India time, not the server's zone —
// a server on UTC would otherwise put a 1 AM bill on the previous day, and a
// 1 AM bill on the 1st into the previous month's return. India has no
// daylight saving, so IST is a fixed UTC+05:30.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

interface IstParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

function istParts(date: Date): IstParts {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** YYMMDD in India time, e.g. 260923 — used inside invoice and credit note numbers. */
export function dateKeyIST(date: Date): string {
  const { year, month, day } = istParts(date);
  return `${String(year).slice(-2)}${pad2(month)}${pad2(day)}`;
}

/** dd-mm-yyyy in India time — the GST portal's date format. */
export function formatGstDate(date: Date): string {
  const { year, month, day } = istParts(date);
  return `${pad2(day)}-${pad2(month)}-${year}`;
}

/** A GST return period as "YYYY-MM" (India time), e.g. "2026-09". */
export type GstPeriod = string;

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isGstPeriod(value: string): value is GstPeriod {
  return PERIOD_PATTERN.test(value);
}

/** Which return month a moment belongs to, in India time. */
export function gstPeriodOf(date: Date): GstPeriod {
  const { year, month } = istParts(date);
  return `${year}-${pad2(month)}`;
}

/** Midnight IST at the start of a day, as a real instant. */
function istMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/**
 * The instants a range of return months covers: `from` inclusive, `to`
 * exclusive (midnight IST on the 1st of the month after `lastPeriod`).
 */
export function gstPeriodRange(firstPeriod: GstPeriod, lastPeriod: GstPeriod = firstPeriod): { from: Date; to: Date } {
  const [, fy, fm] = PERIOD_PATTERN.exec(firstPeriod)!;
  const [, ly, lm] = PERIOD_PATTERN.exec(lastPeriod)!;
  const from = istMidnight(Number(fy), Number(fm), 1);
  const nextMonth = Number(lm) === 12 ? { y: Number(ly) + 1, m: 1 } : { y: Number(ly), m: Number(lm) + 1 };
  const to = istMidnight(nextMonth.y, nextMonth.m, 1);
  return { from, to };
}

/** Every month from `first` to `last`, inclusive. */
export function listGstPeriods(first: GstPeriod, last: GstPeriod): GstPeriod[] {
  const periods: GstPeriod[] = [];
  let [year, month] = first.split("-").map(Number) as [number, number];
  const [lastYear, lastMonth] = last.split("-").map(Number) as [number, number];
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    periods.push(`${year}-${pad2(month)}`);
    month++;
    if (month === 13) {
      month = 1;
      year++;
    }
  }
  return periods;
}

/** GSTR-1 "fp" (filing period) code: MMYYYY of the return's last month. */
export function returnPeriodCode(period: GstPeriod): string {
  const [year, month] = period.split("-");
  return `${month}${year}`;
}

/** Indian financial year (April–March) a moment falls in, e.g. "2026-27". */
export function financialYearOf(date: Date): string {
  const { year, month } = istParts(date);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

/**
 * Credit notes for a sale must be issued before 1 December following the end
 * of its financial year (CGST s.34(2)) — returns that cut-off instant.
 */
export function creditNoteDeadline(supplyDate: Date): Date {
  const { year, month } = istParts(supplyDate);
  const financialYearEnd = month >= 4 ? year + 1 : year;
  return istMidnight(financialYearEnd, 12, 1);
}
