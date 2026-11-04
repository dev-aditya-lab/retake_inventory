/**
 * Pure maths for the usage and analytics pages: date ranges, Meta's billing
 * data points, and how fast the team answers customers. No database or network.
 */

export type UsageRange = "7d" | "30d" | "90d" | "month";
export const USAGE_RANGES: readonly UsageRange[] = ["7d", "30d", "90d", "month"];

const DAY_MS = 24 * 60 * 60 * 1000;
/** India has no daylight saving, so a fixed offset is exact. The shop's days are Indian days. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The start of the Indian calendar day containing `date`, as a real instant. */
export function startOfIstDay(date: Date): Date {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

/** "2026-11-04" for the Indian day containing `date`. */
export function istDayKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The window a range covers: whole Indian days up to and including today. */
export function rangeWindow(range: UsageRange, now: Date = new Date()): { start: Date; end: Date; days: number } {
  const today = startOfIstDay(now);
  if (range === "month") {
    const shifted = new Date(now.getTime() + IST_OFFSET_MS);
    const first = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - IST_OFFSET_MS);
    return { start: first, end: now, days: Math.round((today.getTime() - first.getTime()) / DAY_MS) + 1 };
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { start: new Date(today.getTime() - (days - 1) * DAY_MS), end: now, days };
}

// ---------------------------------------------------------------------------
// Meta's billing numbers
// ---------------------------------------------------------------------------

export interface PricingPoint {
  start?: unknown;
  pricing_category?: unknown;
  pricing_type?: unknown;
  volume?: unknown;
  cost?: unknown;
}

export interface CategorySummary {
  /** MARKETING, UTILITY, AUTHENTICATION, SERVICE, ... */
  category: string;
  volume: number;
  /** What Meta charged for them, in the account's currency. */
  cost: number;
  /** Messages that were free (a customer-service reply, a free-tier template). */
  freeVolume: number;
}

export interface PricingSummary {
  totalCost: number;
  totalVolume: number;
  byCategory: CategorySummary[];
  daily: { date: string; cost: number; volume: number }[];
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/** Adds up the data points of `pricing_analytics` by category and by day. */
export function summarizePricing(points: readonly PricingPoint[]): PricingSummary {
  const categories = new Map<string, CategorySummary>();
  const days = new Map<string, { cost: number; volume: number }>();

  for (const p of points) {
    const category = typeof p.pricing_category === "string" && p.pricing_category ? p.pricing_category : "OTHER";
    const volume = num(p.volume);
    const cost = num(p.cost);
    const free = cost === 0 || (typeof p.pricing_type === "string" && p.pricing_type.startsWith("FREE"));

    const entry = categories.get(category) ?? { category, volume: 0, cost: 0, freeVolume: 0 };
    entry.volume += volume;
    entry.cost += cost;
    if (free) entry.freeVolume += volume;
    categories.set(category, entry);

    if (typeof p.start === "number") {
      const day = istDayKey(new Date(p.start * 1000));
      const d = days.get(day) ?? { cost: 0, volume: 0 };
      d.cost += cost;
      d.volume += volume;
      days.set(day, d);
    }
  }

  const byCategory = [...categories.values()]
    .map((c) => ({ ...c, cost: round4(c.cost) }))
    .sort((a, b) => b.cost - a.cost || b.volume - a.volume);

  return {
    totalCost: round4(byCategory.reduce((sum, c) => sum + c.cost, 0)),
    totalVolume: byCategory.reduce((sum, c) => sum + c.volume, 0),
    byCategory,
    daily: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, cost: round4(d.cost), volume: d.volume })),
  };
}

// ---------------------------------------------------------------------------
// How fast the team answers
// ---------------------------------------------------------------------------

export interface TimedMessage {
  conversation: string;
  direction: "in" | "out";
  source: string;
  /** The staff member who sent it from the app, when known. */
  sentBy?: string;
  timestamp: Date;
}

export interface ResponseStats {
  count: number;
  avgMs: number;
  medianMs: number;
}

export interface ResponseTimes {
  overall: ResponseStats;
  /** Keyed by the staff member's user id. */
  perMember: Map<string, ResponseStats>;
}

function stats(values: number[]): ResponseStats {
  if (values.length === 0) return { count: 0, avgMs: 0, medianMs: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { count: values.length, avgMs: Math.round(values.reduce((s, v) => s + v, 0) / values.length), medianMs: Math.round(median) };
}

/**
 * A "response" is the time from a customer's message (the first one of a run)
 * to the next reply typed by a person in the app. Automatic replies don't count,
 * since the customer still needs a person; internal notes are ignored. Messages
 * must be sorted by conversation, then time.
 */
export function computeResponseTimes(messages: readonly TimedMessage[]): ResponseTimes {
  const all: number[] = [];
  const byMember = new Map<string, number[]>();

  let current = "";
  let waitingSince: Date | null = null;

  for (const m of messages) {
    if (m.conversation !== current) {
      current = m.conversation;
      waitingSince = null;
    }
    if (m.source === "note") continue;

    if (m.direction === "in") {
      waitingSince ??= m.timestamp;
    } else if (m.source === "app" && waitingSince) {
      const ms = m.timestamp.getTime() - waitingSince.getTime();
      if (ms >= 0) {
        all.push(ms);
        if (m.sentBy) byMember.set(m.sentBy, [...(byMember.get(m.sentBy) ?? []), ms]);
      }
      waitingSince = null;
    }
  }

  return { overall: stats(all), perMember: new Map([...byMember].map(([id, values]) => [id, stats(values)])) };
}
