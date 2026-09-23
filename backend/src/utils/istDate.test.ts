import { describe, expect, it } from "vitest";
import {
  creditNoteDeadline,
  dateKeyIST,
  financialYearOf,
  formatGstDate,
  gstPeriodOf,
  gstPeriodRange,
  listGstPeriods,
  returnPeriodCode,
} from "./istDate";

describe("India-time dates", () => {
  // 30 Sept 2026, 20:00 UTC = 1 Oct 2026, 01:30 IST
  const lateNightUtc = new Date("2026-09-30T20:00:00Z");

  it("dates a 1:30 AM IST bill on the Indian day, not the UTC day", () => {
    expect(dateKeyIST(lateNightUtc)).toBe("261001");
    expect(formatGstDate(lateNightUtc)).toBe("01-10-2026");
  });

  it("puts that bill in October's return, not September's", () => {
    expect(gstPeriodOf(lateNightUtc)).toBe("2026-10");
  });

  it("covers a month from midnight IST on the 1st to midnight IST on the next 1st", () => {
    const { from, to } = gstPeriodRange("2026-09");
    expect(from.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("covers a whole quarter, across a year end", () => {
    const { from, to } = gstPeriodRange("2026-11", "2027-01");
    expect(from.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(to.toISOString()).toBe("2027-01-31T18:30:00.000Z");
    expect(listGstPeriods("2026-11", "2027-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("formats the GSTR-1 filing period as MMYYYY", () => {
    expect(returnPeriodCode("2026-09")).toBe("092026");
  });

  it("uses the April–March financial year", () => {
    expect(financialYearOf(new Date("2026-03-31T12:00:00Z"))).toBe("2025-26");
    expect(financialYearOf(new Date("2026-04-01T12:00:00Z"))).toBe("2026-27");
  });

  it("allows credit notes until 30 Nov after the sale's financial year", () => {
    // A sale on 23 Sep 2026 (FY 2026-27) can be credited until 30 Nov 2027, end of day IST.
    expect(creditNoteDeadline(new Date("2026-09-23T06:00:00Z")).toISOString()).toBe("2027-11-30T18:30:00.000Z");
    // A sale on 15 Feb 2027 is still FY 2026-27.
    expect(creditNoteDeadline(new Date("2027-02-15T06:00:00Z")).toISOString()).toBe("2027-11-30T18:30:00.000Z");
  });
});
