import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  dispatchInbound,
  extractInboundMessages,
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
  it("returns customer messages with the number they were sent to", () => {
    const body = payload({
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "918506933428", phone_number_id: "PNID" },
      contacts: [{ profile: { name: "Ravi" }, wa_id: "919876543210" }],
      messages: [{ from: "919876543210", id: "wamid.1", timestamp: "1", type: "text", text: { body: "hi" } }],
    });

    expect(extractInboundMessages(body)).toEqual([
      { id: "wamid.1", from: "919876543210", type: "text", phoneNumberId: "PNID" },
    ]);
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

/** In-memory stand-in for Redis SET NX / DEL. */
function fakeDeps(options: { failReply?: boolean } = {}) {
  const keys = new Set<string>();
  const replies: string[] = [];
  const deps: InboundDeps = {
    async claim(key) {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    async release(key) {
      keys.delete(key);
    },
    async reply(to) {
      if (options.failReply) throw new Error("send failed");
      replies.push(to);
    },
  };
  return { deps, keys, replies };
}

function message(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return { id: "wamid.1", from: "919876543210", type: "text", phoneNumberId: "PNID", ...overrides };
}

describe("dispatchInbound", () => {
  it("replies to a customer's first message", async () => {
    const { deps, replies } = fakeDeps();
    const results = await dispatchInbound([message()], deps);

    expect(results).toEqual([{ id: "wamid.1", outcome: "replied" }]);
    expect(replies).toEqual(["919876543210"]);
  });

  it("does not reply twice to a redelivered message", async () => {
    const { deps, replies } = fakeDeps();
    await dispatchInbound([message()], deps);
    const results = await dispatchInbound([message()], deps);

    expect(results[0]?.outcome).toBe("duplicate");
    expect(replies).toHaveLength(1);
  });

  it("stays quiet for a chatty customer inside the cooldown, but answers a different customer", async () => {
    const { deps, replies } = fakeDeps();
    const results = await dispatchInbound(
      [
        message({ id: "wamid.1" }),
        message({ id: "wamid.2" }),
        message({ id: "wamid.3", from: "919000000000" }),
      ],
      deps,
    );

    expect(results.map((r) => r.outcome)).toEqual(["replied", "cooldown", "replied"]);
    expect(replies).toEqual(["919876543210", "919000000000"]);
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
    const results = await dispatchInbound([message()], failing.deps);

    expect(results[0]?.outcome).toBe("failed");
    expect(failing.keys.size).toBe(0);

    // Same customer, working send this time: not blocked by the earlier failure.
    const working = await dispatchInbound([message({ id: "wamid.2" })], { ...failing.deps, reply: async () => {} });
    expect(working[0]?.outcome).toBe("replied");
  });
});
