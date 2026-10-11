import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import type { Intent } from "./whatsappIntent";
import {
  dispatchInbound,
  extractChanges,
  extractEchoes,
  extractInboundMessages,
  extractStatuses,
  RATE_LIMIT_MESSAGES,
  safeEqual,
  verifyWebhookSignature,
  type InboundDeps,
  type InboundMessage,
} from "./whatsappWebhook";

const SECRET = "test-app-secret";

function sign(body: Buffer, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  const body = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));

  it("accepts a correctly signed body", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a body that was changed after signing", () => {
    const tampered = Buffer.from(body.toString().replace("entry", "entrx"));
    expect(verifyWebhookSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyWebhookSignature(body, sign(body, "someone-else"), SECRET)).toBe(false);
  });

  it("rejects missing, malformed or wrong-scheme headers without throwing", () => {
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(undefined, sign(body), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=not-hex", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abcdef", SECRET)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares strings, including different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

function payload(value: Record<string, unknown>) {
  return { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value }] }] };
}

describe("extractInboundMessages", () => {
  it("returns a text message with its body and the number it was sent to", () => {
    const body = payload({
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "918506933428", phone_number_id: "PNID" },
      contacts: [{ profile: { name: "Ravi" }, wa_id: "919876543210" }],
      messages: [{ from: "919876543210", id: "wamid.1", timestamp: "1", type: "text", text: { body: "Hiii" } }],
    });

    expect(extractInboundMessages(body)).toEqual([
      {
        id: "wamid.1",
        from: "919876543210",
        type: "text",
        phoneNumberId: "PNID",
        text: "Hiii",
        profileName: "Ravi",
        timestamp: "1",
      },
    ]);
  });

  it("returns the id of the list row a customer tapped", () => {
    const body = payload({
      metadata: { phone_number_id: "PNID" },
      messages: [
        {
          from: "919876543210",
          id: "wamid.2",
          type: "interactive",
          interactive: { type: "list_reply", list_reply: { id: "opt_invoices", title: "My invoices" } },
        },
      ],
    });

    expect(extractInboundMessages(body)[0]).toMatchObject({ type: "interactive", replyId: "opt_invoices" });
  });

  it("ignores delivery receipts", () => {
    const body = payload({
      metadata: { phone_number_id: "PNID" },
      statuses: [{ id: "wamid.1", status: "delivered", recipient_id: "919876543210" }],
    });
    expect(extractInboundMessages(body)).toEqual([]);
  });

  it("returns nothing for malformed or foreign payloads", () => {
    expect(extractInboundMessages(null)).toEqual([]);
    expect(extractInboundMessages("hi")).toEqual([]);
    expect(extractInboundMessages({ object: "page", entry: [] })).toEqual([]);
    expect(extractInboundMessages(payload({ messages: [{ id: 1 }] }))).toEqual([]);
  });
});

describe("extractInboundMessages: richer fields", () => {
  it("carries the customer's profile name, timestamp and the title of a tapped row", () => {
    const body = payload({
      metadata: { phone_number_id: "PNID" },
      contacts: [{ profile: { name: "Ravi Kumar" }, wa_id: "919876543210" }],
      messages: [
        {
          from: "919876543210",
          id: "wamid.3",
          timestamp: "1760000000",
          type: "interactive",
          interactive: { type: "list_reply", list_reply: { id: "opt_pending", title: "Pending payment" } },
        },
      ],
    });

    expect(extractInboundMessages(body)[0]).toMatchObject({
      profileName: "Ravi Kumar",
      timestamp: "1760000000",
      replyId: "opt_pending",
      replyTitle: "Pending payment",
    });
  });
});

describe("extractStatuses", () => {
  it("reads delivery receipts and the reason a send failed", () => {
    const body = payload({
      metadata: { phone_number_id: "PNID" },
      statuses: [
        { id: "wamid.out1", status: "read", timestamp: "1760000100", recipient_id: "919876543210" },
        {
          id: "wamid.out2",
          status: "failed",
          timestamp: "1760000200",
          recipient_id: "919876543211",
          errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "More than 24 hours passed" } }],
        },
      ],
    });

    expect(extractStatuses(body)).toEqual([
      { id: "wamid.out1", status: "read", recipientId: "919876543210", timestamp: "1760000100", error: undefined },
      {
        id: "wamid.out2",
        status: "failed",
        recipientId: "919876543211",
        timestamp: "1760000200",
        error: "Re-engagement message: More than 24 hours passed",
      },
    ]);
  });

  it("returns nothing for a payload with only messages", () => {
    const body = payload({ messages: [{ from: "91", id: "w", type: "text", text: { body: "hi" } }] });
    expect(extractStatuses(body)).toEqual([]);
  });
});

describe("extractEchoes", () => {
  it("reads messages typed in the Business app on our number", () => {
    const body = payload({
      metadata: { phone_number_id: "PNID" },
      message_echoes: [{ from: "918506933428", to: "919876543210", id: "wamid.e1", type: "text", text: { body: "On my way" } }],
    });

    expect(extractEchoes(body)).toEqual([
      { id: "wamid.e1", to: "919876543210", type: "text", text: "On my way", timestamp: undefined, phoneNumberId: "PNID" },
    ]);
  });
});

describe("extractChanges", () => {
  it("lists every field untouched, so unknown ones are never dropped", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            { field: "message_template_status_update", value: { event: "APPROVED" } },
            { field: "some_future_field", value: { anything: 1 } },
          ],
        },
      ],
    };

    expect(extractChanges(body)).toEqual([
      { field: "message_template_status_update", value: { event: "APPROVED" }, entryId: "WABA" },
      { field: "some_future_field", value: { anything: 1 }, entryId: "WABA" },
    ]);
  });

  it("returns nothing for other platforms' payloads", () => {
    expect(extractChanges({ object: "page", entry: [] })).toEqual([]);
    expect(extractChanges(null)).toEqual([]);
  });
});

/** In-memory stand-in for Redis (SET NX, DEL, counters). */
function fakeDeps(options: { failReply?: boolean; paused?: boolean } = {}) {
  const keys = new Set<string>();
  const counters = new Map<string, number>();
  const replies: { to: string; intent: Intent }[] = [];
  const deps: InboundDeps = {
    async claim(key) {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    async release(key) {
      keys.delete(key);
    },
    async hit(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async isPaused() {
      return options.paused ?? false;
    },
    async reply(message, intent) {
      if (options.failReply) throw new Error("send failed");
      replies.push({ to: message.from, intent });
    },
  };
  return { deps, keys, replies };
}

function message(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return { id: "wamid.1", from: "919876543210", type: "text", phoneNumberId: "PNID", text: "hi", ...overrides };
}

describe("dispatchInbound", () => {
  it("answers a greeting with the greeting intent", async () => {
    const { deps, replies } = fakeDeps();
    const results = await dispatchInbound([message()], deps);

    expect(results).toEqual([{ id: "wamid.1", outcome: "replied", intent: "greeting" }]);
    expect(replies).toEqual([{ to: "919876543210", intent: "greeting" }]);
  });

  it("answers every message by what it asks, with no cooldown between real questions", async () => {
    const { deps, replies } = fakeDeps();
    await dispatchInbound(
      [
        message({ id: "1", text: "Hello" }),
        message({ id: "2", type: "interactive", text: undefined, replyId: "opt_invoices" }),
        message({ id: "3", text: "pending" }),
        message({ id: "4", text: "hii" }),
      ],
      deps,
    );

    expect(replies.map((r) => r.intent)).toEqual(["greeting", "invoices", "pending", "greeting"]);
  });

  it("does not reply twice to a redelivered message", async () => {
    const { deps, replies } = fakeDeps();
    await dispatchInbound([message()], deps);
    const results = await dispatchInbound([message()], deps);

    expect(results[0]?.outcome).toBe("duplicate");
    expect(replies).toHaveLength(1);
  });

  it("sends the menu for something unrecognised only once per cooldown window", async () => {
    const { deps, replies } = fakeDeps();
    const results = await dispatchInbound(
      [message({ id: "1", text: "ok thanks" }), message({ id: "2", text: "asdf" }), message({ id: "3", text: "hi" })],
      deps,
    );

    expect(results.map((r) => r.outcome)).toEqual(["replied", "cooldown", "replied"]);
    expect(replies.map((r) => r.intent)).toEqual(["unknown", "greeting"]);
  });

  it("treats a photo or voice note as unrecognised", async () => {
    const { deps, replies } = fakeDeps();
    await dispatchInbound([message({ type: "image", text: undefined })], deps);
    expect(replies[0]?.intent).toBe("unknown");
  });

  it("stops replying to a customer who exceeds the hourly message limit", async () => {
    const { deps, replies } = fakeDeps();
    const flood = Array.from({ length: RATE_LIMIT_MESSAGES + 3 }, (_, i) => message({ id: `m${i}`, text: "menu" }));
    const results = await dispatchInbound(flood, deps);

    expect(replies).toHaveLength(RATE_LIMIT_MESSAGES);
    expect(results.slice(-3).map((r) => r.outcome)).toEqual(["rate_limited", "rate_limited", "rate_limited"]);
  });

  it("keeps quiet for hellos and small talk while a person is handling the chat", async () => {
    const { deps, replies } = fakeDeps({ paused: true });
    const results = await dispatchInbound(
      [message({ id: "1", text: "hi" }), message({ id: "2", text: "ok thanks" })],
      deps,
    );

    expect(results.map((r) => r.outcome)).toEqual(["paused", "paused"]);
    expect(replies).toEqual([]);
  });

  it("still answers explicit requests while a person is handling the chat", async () => {
    const { deps, replies } = fakeDeps({ paused: true });
    await dispatchInbound(
      [message({ id: "1", text: "my invoices" }), message({ id: "2", text: "talk to staff" })],
      deps,
    );

    expect(replies.map((r) => r.intent)).toEqual(["invoices", "human"]);
  });

  it("ignores reactions and system events", async () => {
    const { deps, replies } = fakeDeps();
    const results = await dispatchInbound(
      [message({ id: "a", type: "reaction" }), message({ id: "b", type: "system" })],
      deps,
    );

    expect(results.map((r) => r.outcome)).toEqual(["ignored", "ignored"]);
    expect(replies).toEqual([]);
  });

  it("reports a failed send and frees the keys so the next message can retry", async () => {
    const failing = fakeDeps({ failReply: true });
    const results = await dispatchInbound([message({ text: "ok thanks" })], failing.deps);

    expect(results[0]?.outcome).toBe("failed");
    expect(failing.keys.size).toBe(0);

    // Same customer, working send this time: not blocked by the earlier failure.
    const retry = await dispatchInbound([message({ id: "wamid.2", text: "ok thanks" })], {
      ...failing.deps,
      reply: async () => {},
    });
    expect(retry[0]?.outcome).toBe("replied");
  });
});
