import { describe, expect, it } from "vitest";
import { countsFromStatuses, dedupeAudience, isOptIn, isOptOut, valuesFor } from "./whatsappBroadcast";

describe("dedupeAudience", () => {
  it("normalises, drops bad numbers and repeats", () => {
    expect(
      dedupeAudience([
        { phone: "98765 43210", name: "Asha" },
        { phone: "+91-9876543210", name: "Asha again" },
        { phone: "12", name: "Bad" },
        { phone: "", name: "Empty" },
        { phone: "9123456789" },
      ]),
    ).toEqual([
      { waId: "919876543210", name: "Asha" },
      { waId: "919123456789", name: "" },
    ]);
  });
});

describe("opt-out words", () => {
  it("matches only short, exact requests", () => {
    expect(isOptOut("STOP")).toBe(true);
    expect(isOptOut("  Unsubscribe. ")).toBe(true);
    expect(isOptOut("opt out")).toBe(true);
    expect(isOptOut("please don't stop the delivery")).toBe(false);
    expect(isOptOut(undefined)).toBe(false);
    expect(isOptIn("START")).toBe(true);
    expect(isOptIn("start the order")).toBe(false);
  });
});

describe("valuesFor", () => {
  const values = { body: ["", "ORD-1"] };
  it("puts the first name into the chosen variable", () => {
    expect(valuesFor(values, 0, "Asha Verma")).toEqual({ body: ["Asha", "ORD-1"] });
    expect(valuesFor(values, 0, "")).toEqual({ body: ["there", "ORD-1"] });
  });
  it("leaves values alone when no variable is chosen", () => {
    expect(valuesFor(values, undefined, "Asha")).toBe(values);
  });
});

describe("countsFromStatuses", () => {
  it("is cumulative like WhatsApp's ticks", () => {
    expect(
      countsFromStatuses([
        { status: "queued", n: 3 },
        { status: "sent", n: 2 },
        { status: "delivered", n: 4 },
        { status: "read", n: 1 },
        { status: "failed", n: 2 },
      ]),
    ).toEqual({ total: 12, queued: 3, sent: 7, delivered: 5, read: 1, failed: 2 });
  });
  it("handles nothing", () => {
    expect(countsFromStatuses([])).toEqual({ total: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
  });
});
