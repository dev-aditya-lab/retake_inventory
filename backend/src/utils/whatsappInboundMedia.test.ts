import { describe, expect, it } from "vitest";
import { describeInbound } from "./whatsappChat";
import { extractInboundMessages } from "./whatsappWebhook";

function payload(message: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "123" },
              contacts: [{ wa_id: "919876543210", profile: { name: "Asha" } }],
              messages: [{ id: "wamid.1", from: "919876543210", timestamp: "1700000000", ...message }],
            },
          },
        ],
      },
    ],
  };
}

describe("inbound media and richer messages", () => {
  it("reads a photo with its caption", () => {
    const [m] = extractInboundMessages(
      payload({ type: "image", image: { id: "media-1", mime_type: "image/jpeg", sha256: "abc", caption: "Need this" } }),
    );
    expect(m?.media).toMatchObject({ kind: "image", id: "media-1", mimeType: "image/jpeg", caption: "Need this" });
    expect(m?.text).toBeUndefined();
    expect(describeInbound(m!)).toBe("[Photo] Need this");
  });

  it("reads a voice note and a document", () => {
    const [voice] = extractInboundMessages(payload({ type: "audio", audio: { id: "a1", mime_type: "audio/ogg; codecs=opus", voice: true } }));
    expect(voice?.media).toMatchObject({ kind: "audio", voice: true });
    expect(describeInbound(voice!)).toBe("[Voice note]");

    const [doc] = extractInboundMessages(
      payload({ type: "document", document: { id: "d1", mime_type: "application/pdf", filename: "order.pdf" } }),
    );
    expect(doc?.media).toMatchObject({ kind: "document", filename: "order.pdf" });
    expect(describeInbound(doc!)).toBe("[Document] order.pdf");
  });

  it("reads a location", () => {
    const [m] = extractInboundMessages(
      payload({ type: "location", location: { latitude: 28.61, longitude: 77.2, name: "Shop", address: "Delhi" } }),
    );
    expect(m?.location).toEqual({ latitude: 28.61, longitude: 77.2, name: "Shop", address: "Delhi" });
    expect(describeInbound(m!)).toBe("[Location] Shop, Delhi");
  });

  it("reads a reaction and a quoted reply", () => {
    const [reaction] = extractInboundMessages(payload({ type: "reaction", reaction: { message_id: "wamid.out", emoji: "👍" } }));
    expect(reaction?.reaction).toEqual({ messageId: "wamid.out", emoji: "👍" });

    const [reply] = extractInboundMessages(payload({ type: "text", text: { body: "yes" }, context: { id: "wamid.out" } }));
    expect(reply?.contextId).toBe("wamid.out");
    expect(reply?.text).toBe("yes");
  });

  it("still reads plain text and ignores unknown shapes", () => {
    const [m] = extractInboundMessages(payload({ type: "text", text: { body: "hello" } }));
    expect(m?.media).toBeUndefined();
    expect(describeInbound(m!)).toBe("hello");
    expect(describeInbound({ type: "order" })).toBe("[Order]");
  });
});
