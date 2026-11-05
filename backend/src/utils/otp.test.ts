import { describe, expect, it } from "vitest";
import { cleanCode, generateOtp, hashOtp, maskEmail, maskPhone, otpMatches, parseIdentifier } from "./otp";

describe("generateOtp", () => {
  it("is always six digits", () => {
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });
  it("varies", () => {
    expect(new Set(Array.from({ length: 50 }, generateOtp)).size).toBeGreaterThan(40);
  });
});

describe("hashOtp / otpMatches", () => {
  const secret = "a-long-test-secret";
  it("accepts the right code and rejects others", () => {
    const hash = hashOtp("123456", "user1", secret);
    expect(otpMatches("123456", hash, "user1", secret)).toBe(true);
    expect(otpMatches("123457", hash, "user1", secret)).toBe(false);
  });
  it("is tied to the person and the secret", () => {
    const hash = hashOtp("123456", "user1", secret);
    expect(otpMatches("123456", hash, "user2", secret)).toBe(false);
    expect(otpMatches("123456", hash, "user1", "other-secret")).toBe(false);
  });
  it("never matches malformed input", () => {
    const hash = hashOtp("123456", "user1", secret);
    expect(otpMatches("12345", hash, "user1", secret)).toBe(false);
    expect(otpMatches("abcdef", hash, "user1", secret)).toBe(false);
    expect(otpMatches("123456", "not-hex", "user1", secret)).toBe(false);
  });
  it("does not store the code", () => {
    expect(hashOtp("123456", "u", secret)).not.toContain("123456");
  });
});

describe("cleanCode", () => {
  it("drops spaces and dashes", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
  });
});

describe("parseIdentifier", () => {
  it("reads emails, lower-cased", () => {
    expect(parseIdentifier(" Asha@Shop.COM ")).toEqual({ kind: "email", email: "asha@shop.com" });
  });
  it("reads Indian mobiles in any format", () => {
    expect(parseIdentifier("98765 43210")).toEqual({ kind: "phone", national: "9876543210" });
    expect(parseIdentifier("+91-98765-43210")).toEqual({ kind: "phone", national: "9876543210" });
    expect(parseIdentifier("09876543210")).toEqual({ kind: "phone", national: "9876543210" });
  });
  it("rejects anything else", () => {
    expect(parseIdentifier("")).toBeUndefined();
    expect(parseIdentifier("hello")).toBeUndefined();
    expect(parseIdentifier("12345")).toBeUndefined();
    expect(parseIdentifier("1234567890")).toBeUndefined(); // landline-style, not 6-9
    expect(parseIdentifier("a@b")).toBeUndefined();
  });
});

describe("masking", () => {
  it("hides most of a number or address", () => {
    expect(maskPhone("9876543210")).toBe("+91 ••••• •3210");
    expect(maskEmail("asha@shop.com")).toBe("a•••@shop.com");
  });
});
