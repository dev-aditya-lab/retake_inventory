import { describe, expect, it } from "vitest";
import { alertPush, chatPush, isAllowedPushEndpoint } from "./pushPayload";
import { subscribePushSchema } from "../validators/push.validators";

describe("isAllowedPushEndpoint", () => {
  it("accepts the real browser push services", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc123",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGxyz",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("rejects anything that could aim the server somewhere else", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc", // not https
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/push",
      "https://internal.example.com/hook",
      "https://googleapis.com.evil.example/fcm", // suffix trick
      "https://storage.googleapis.com/some-bucket/x", // a Google host, but not a push service
      "https://evil.example/?x=.googleapis.com",
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "not a url",
      "",
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });
});

describe("push payloads", () => {
  it("shows who wrote and the start of the message, and opens that chat", () => {
    const payload = chatPush({ customer: "Ravi Kumar", preview: "Mera order kab aayega?", conversationId: "abc123" });
    expect(payload).toEqual({
      title: "Ravi Kumar",
      body: "Mera order kab aayega?",
      url: "/whatsapp/abc123",
      tag: "wa-chat-abc123",
    });
  });

  it("trims long messages and collapses whitespace", () => {
    const payload = chatPush({ customer: "x", preview: `hello\n\n${"y".repeat(500)}`, conversationId: "1" });
    expect(payload.body.length).toBeLessThanOrEqual(140);
    expect(payload.body.startsWith("hello y")).toBe(true);
  });

  it("falls back to a generic title when the customer has no name", () => {
    expect(chatPush({ customer: "", preview: "hi", conversationId: "1" }).title).toBe("New WhatsApp message");
  });

  it("points alerts at the account-health page", () => {
    const payload = alertPush({ title: 'Template "cus_digital_invoice_01" paused', detail: "Reason: LOW_QUALITY" });
    expect(payload.url).toBe("/whatsapp/health");
    expect(payload.body).toContain("paused");
    expect(payload.body).toContain("LOW_QUALITY");
  });
});

describe("subscribePushSchema", () => {
  const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };

  it("accepts a real subscription", () => {
    const parsed = subscribePushSchema.parse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys });
    expect(parsed.keys.auth).toBe(keys.auth);
  });

  it("rejects an endpoint that is not a push service", () => {
    expect(subscribePushSchema.safeParse({ endpoint: "https://evil.example/x", keys }).success).toBe(false);
  });

  it("rejects missing or malformed keys", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    expect(subscribePushSchema.safeParse({ endpoint }).success).toBe(false);
    expect(subscribePushSchema.safeParse({ endpoint, keys: { p256dh: "short", auth: keys.auth } }).success).toBe(false);
    expect(subscribePushSchema.safeParse({ endpoint, keys: { p256dh: "has spaces and ! symbols aaaaaaaaaaaa", auth: keys.auth } }).success).toBe(false);
  });
});
