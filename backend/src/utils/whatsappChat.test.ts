import { describe, expect, it } from "vitest";
import {
  describeInbound,
  fromUnixSeconds,
  isBotPaused,
  isReplyWindowOpen,
  isReportedStatus,
  previewOf,
  REPLY_WINDOW_MS,
  replyWindowClosesAt,
  statusesItMayReplace,
} from "./whatsappChat";

describe("24-hour reply window", () => {
  const lastInbound = new Date("2026-10-10T10:00:00.000Z");

  it("is open until 24 hours after the customer's last message", () => {
    expect(isReplyWindowOpen(lastInbound, new Date(lastInbound.getTime() + REPLY_WINDOW_MS - 1))).toBe(true);
    expect(isReplyWindowOpen(lastInbound, new Date(lastInbound.getTime() + REPLY_WINDOW_MS))).toBe(false);
  });

  it("is closed when the customer has never written", () => {
    expect(isReplyWindowOpen(undefined)).toBe(false);
    expect(replyWindowClosesAt(null)).toBeNull();
  });

  it("reports when it closes", () => {
    expect(replyWindowClosesAt(lastInbound)?.toISOString()).toBe("2026-10-11T10:00:00.000Z");
  });
});

describe("isBotPaused", () => {
  const now = new Date("2026-10-10T10:00:00.000Z");

  it("is paused only while the pause time is in the future", () => {
    expect(isBotPaused(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isBotPaused(new Date(now.getTime() - 1000), now)).toBe(false);
    expect(isBotPaused(undefined, now)).toBe(false);
  });
});

describe("delivery status ordering", () => {
  it("lets later states replace earlier ones, never the reverse", () => {
    expect(statusesItMayReplace("delivered")).toEqual(["sent"]);
    expect(statusesItMayReplace("read")).toEqual(["sent", "delivered"]);
    // "sent" arriving after "read" must change nothing.
    expect(statusesItMayReplace("sent")).toEqual([]);
  });

  it("lets a failure replace only 'sent'", () => {
    expect(statusesItMayReplace("failed")).toEqual(["sent"]);
  });

  it("recognises the statuses Meta reports", () => {
    expect(isReportedStatus("delivered")).toBe(true);
    expect(isReportedStatus("deleted")).toBe(false);
  });
});

describe("describeInbound", () => {
  it("uses the text when there is some", () => {
    expect(describeInbound({ type: "text", text: "hello" })).toBe("hello");
  });

  it("shows which menu row was chosen", () => {
    expect(describeInbound({ type: "interactive", replyTitle: "My invoices" })).toBe("Chose: My invoices");
  });

  it("gives a placeholder for media the app can't show yet", () => {
    expect(describeInbound({ type: "image" })).toBe("[Photo]");
    expect(describeInbound({ type: "audio" })).toBe("[Voice note]");
    expect(describeInbound({ type: "document" })).toBe("[Document]");
    expect(describeInbound({ type: "something_new" })).toBe("[something_new message]");
  });
});

describe("previewOf", () => {
  it("collapses whitespace and trims long text", () => {
    expect(previewOf("hello\n\n  world")).toBe("hello world");
    expect(previewOf("x".repeat(200), 20)).toHaveLength(20);
    expect(previewOf("x".repeat(200), 20).endsWith("…")).toBe(true);
  });
});

describe("fromUnixSeconds", () => {
  it("converts Meta's seconds string, and falls back for missing or bad input", () => {
    expect(fromUnixSeconds("1760000000").toISOString()).toBe("2025-10-09T08:53:20.000Z");
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(fromUnixSeconds(undefined, now)).toBe(now);
    expect(fromUnixSeconds("abc", now)).toBe(now);
  });
});
