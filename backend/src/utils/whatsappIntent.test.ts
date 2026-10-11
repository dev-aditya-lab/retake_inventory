import { describe, expect, it } from "vitest";
import { detectIntent, MENU_OPTIONS } from "./whatsappIntent";

const intentOf = (text: string) => detectIntent({ text });

describe("detectIntent: greetings", () => {
  it.each([
    "hi", "Hi", "HI", "hii", "hiii", "Hiii", "hiiiii", "hello", "Hello", "HELLO", "helloo", "hellooo", "hlw", "Hlw",
    "hlo", "hey", "heyyy", "hai", "namaste", "Namaste!", "hi sir", "hello retake", "good morning", "Good evening",
    "hi!!", "  hi  ", "hello.",
  ])("treats %j as a greeting", (text) => {
    expect(intentOf(text)).toBe("greeting");
  });

  it("does not treat a long sentence that merely starts with hi as a greeting", () => {
    expect(intentOf("hi i want to know about something random today please")).toBe("unknown");
  });
});

describe("detectIntent: asking for something", () => {
  it("recognises each option from typed words, in English and Hinglish", () => {
    expect(intentOf("invoices")).toBe("invoices");
    expect(intentOf("my bills")).toBe("invoices");
    expect(intentOf("Bill chahiye")).toBe("invoices");
    expect(intentOf("pending")).toBe("pending");
    expect(intentOf("kitna baki hai")).toBe("pending");
    expect(intentOf("balance")).toBe("pending");
    expect(intentOf("how to pay")).toBe("payment");
    expect(intentOf("upi id")).toBe("payment");
    expect(intentOf("bank details")).toBe("payment");
    expect(intentOf("contact number")).toBe("contact");
    expect(intentOf("staff number")).toBe("contact");
    expect(intentOf("address")).toBe("address");
    expect(intentOf("where is your shop")).toBe("address");
    expect(intentOf("menu")).toBe("menu");
    expect(intentOf("help")).toBe("menu");
  });

  it("lets a question win over a greeting", () => {
    expect(intentOf("hi, my invoice please")).toBe("invoices");
    expect(intentOf("hello pending amount")).toBe("pending");
  });

  it("reads 'payment pending' as a pending question, not 'how to pay'", () => {
    expect(intentOf("payment pending")).toBe("pending");
  });

  it("is not fooled by names that contain a keyword", () => {
    expect(intentOf("hi payal")).toBe("greeting");
    expect(intentOf("hello bilal")).toBe("greeting");
  });

  it("maps a tapped list row to its option", () => {
    for (const option of MENU_OPTIONS) {
      expect(detectIntent({ replyId: option.id })).toBe(option.intent);
    }
  });

  it("prefers the tapped row over any text", () => {
    expect(detectIntent({ replyId: "opt_address", text: "hi" })).toBe("address");
  });
});

describe("detectIntent: unknown", () => {
  it("falls through for small talk, emoji and nothing at all", () => {
    expect(intentOf("ok")).toBe("unknown");
    expect(intentOf("thanks")).toBe("unknown");
    expect(intentOf("👍")).toBe("unknown");
    expect(intentOf("")).toBe("unknown");
    expect(detectIntent({})).toBe("unknown");
    expect(detectIntent({ replyId: "something_else" })).toBe("unknown");
  });
});

describe("MENU_OPTIONS", () => {
  it("fits WhatsApp's list limits", () => {
    expect(MENU_OPTIONS.length).toBeLessThanOrEqual(10);
    for (const option of MENU_OPTIONS) {
      expect(option.title.length).toBeLessThanOrEqual(24);
      expect(option.description.length).toBeLessThanOrEqual(72);
    }
  });
});
