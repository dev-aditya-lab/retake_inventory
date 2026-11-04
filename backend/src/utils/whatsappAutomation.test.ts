import { describe, expect, it } from "vitest";
import { DEFAULT_HOURS, isWithinHours, matchKeyword, normalizeText, type BusinessHours } from "./whatsappAutomation";

describe("normalizeText", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeText("  Price?!  List ")).toBe("price list");
    expect(normalizeText("कीमत क्या है?")).toBe("कीमत क्या है");
  });
});

describe("matchKeyword", () => {
  const rules = [
    { keywords: ["price", "rate list"], match: "contains" as const },
    { keywords: ["hi", "hello"], match: "exact" as const },
  ];
  it("matches whole words anywhere in a message", () => {
    expect(matchKeyword("What is the PRICE of haldi?", rules)).toBe(0);
    expect(matchKeyword("send rate list please", rules)).toBe(0);
  });
  it("does not match inside other words", () => {
    expect(matchKeyword("priceless", rules)).toBe(-1);
    expect(matchKeyword("pricelist", rules)).toBe(-1);
  });
  it("exact rules need the whole message", () => {
    expect(matchKeyword("Hello!", rules)).toBe(1);
    expect(matchKeyword("hello, I need help", rules)).toBe(-1);
  });
  it("returns the first matching rule and copes with nothing", () => {
    expect(matchKeyword("hello price", rules)).toBe(0);
    expect(matchKeyword("", rules)).toBe(-1);
    expect(matchKeyword(undefined, rules)).toBe(-1);
  });
});

describe("isWithinHours", () => {
  const hours: BusinessHours = { ...DEFAULT_HOURS, enabled: true };
  // 2026-11-04 is a Wednesday. 10:00 IST = 04:30 UTC.
  it("is open during the day and closed outside it", () => {
    expect(isWithinHours(new Date("2026-11-04T06:00:00Z"), hours)).toBe(true); // 11:30 IST
    expect(isWithinHours(new Date("2026-11-04T03:00:00Z"), hours)).toBe(false); // 08:30 IST
    expect(isWithinHours(new Date("2026-11-04T15:00:00Z"), hours)).toBe(false); // 20:30 IST
  });
  it("respects closed days (Sunday)", () => {
    expect(isWithinHours(new Date("2026-11-08T06:00:00Z"), hours)).toBe(false);
  });
  it("counts as open when hours are off or unusable", () => {
    expect(isWithinHours(new Date("2026-11-08T06:00:00Z"), DEFAULT_HOURS)).toBe(true);
    const broken: BusinessHours = { enabled: true, days: hours.days.map(() => ({ closed: false, open: "bad", close: "20:00" })) };
    expect(isWithinHours(new Date("2026-11-04T03:00:00Z"), broken)).toBe(true);
  });
  it("uses the Indian date, not UTC's", () => {
    // 2026-11-07 20:00 UTC is already 01:30 on Sunday the 8th in India.
    expect(isWithinHours(new Date("2026-11-07T20:00:00Z"), hours)).toBe(false);
  });
});
