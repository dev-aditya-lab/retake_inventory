import { describe, expect, it } from "vitest";
import { computeResponseTimes, istDayKey, rangeWindow, startOfIstDay, summarizePricing, type TimedMessage } from "./whatsappUsage";

describe("Indian days", () => {
  it("starts the day at 00:00 IST", () => {
    // 2026-11-04 22:00 UTC is already 03:30 on the 5th in India.
    const d = new Date("2026-11-04T22:00:00Z");
    expect(istDayKey(d)).toBe("2026-11-05");
    expect(startOfIstDay(d).toISOString()).toBe("2026-11-04T18:30:00.000Z");
  });
  it("builds ranges of whole days", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    const w = rangeWindow("7d", now);
    expect(w.days).toBe(7);
    expect(istDayKey(w.start)).toBe("2026-10-29");
    const m = rangeWindow("month", now);
    expect(istDayKey(m.start)).toBe("2026-11-01");
    expect(m.days).toBe(4);
  });
});

describe("summarizePricing", () => {
  it("adds up by category and day and counts free messages", () => {
    const day1 = 1793730600; // 2026-11-04 00:00 IST
    const s = summarizePricing([
      { start: day1, pricing_category: "SERVICE", pricing_type: "FREE_CUSTOMER_SERVICE", volume: 1, cost: 0 },
      { start: day1, pricing_category: "MARKETING", pricing_type: "REGULAR", volume: 2, cost: 1.7262 },
      { start: day1 + 86400, pricing_category: "MARKETING", pricing_type: "REGULAR", volume: 1, cost: 0.8631 },
    ]);
    expect(s.totalVolume).toBe(4);
    expect(s.totalCost).toBeCloseTo(2.5893, 4);
    expect(s.byCategory[0]).toMatchObject({ category: "MARKETING", volume: 3, freeVolume: 0 });
    expect(s.byCategory[1]).toMatchObject({ category: "SERVICE", volume: 1, freeVolume: 1, cost: 0 });
    expect(s.daily.map((d) => d.date)).toEqual(["2026-11-04", "2026-11-05"]);
  });
  it("copes with nothing and with junk", () => {
    expect(summarizePricing([])).toEqual({ totalCost: 0, totalVolume: 0, byCategory: [], daily: [] });
    expect(summarizePricing([{ volume: "x", cost: null }]).totalVolume).toBe(0);
  });
});

describe("computeResponseTimes", () => {
  const t = (s: string) => new Date(`2026-11-04T${s}Z`);
  const msg = (conversation: string, direction: "in" | "out", source: string, time: string, sentBy?: string): TimedMessage => ({
    conversation,
    direction,
    source,
    sentBy,
    timestamp: t(time),
  });

  it("times the first human reply to a run of customer messages", () => {
    const r = computeResponseTimes([
      msg("c1", "in", "customer", "10:00:00"),
      msg("c1", "in", "customer", "10:00:30"), // same run: still waiting since 10:00:00
      msg("c1", "out", "app", "10:02:00", "asha"),
      msg("c1", "in", "customer", "11:00:00"),
      msg("c1", "out", "app", "11:10:00", "ravi"),
    ]);
    expect(r.overall).toEqual({ count: 2, avgMs: 360_000, medianMs: 360_000 });
    expect(r.perMember.get("asha")).toEqual({ count: 1, avgMs: 120_000, medianMs: 120_000 });
    expect(r.perMember.get("ravi")?.avgMs).toBe(600_000);
  });

  it("ignores bot replies and notes, and resets between chats", () => {
    const r = computeResponseTimes([
      msg("c1", "in", "customer", "10:00:00"),
      msg("c1", "out", "bot", "10:00:01"),
      msg("c1", "out", "note", "10:01:00", "asha"),
      msg("c2", "out", "app", "10:05:00", "asha"), // a different chat: nothing was waiting
      msg("c2", "in", "customer", "10:06:00"),
    ]);
    expect(r.overall.count).toBe(0);
  });
});
