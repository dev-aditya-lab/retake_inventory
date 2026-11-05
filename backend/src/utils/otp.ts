import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { indianMobile } from "./phone";

/**
 * Pure rules for one-time login codes. Nothing here touches Redis, the
 * database or the network, so all of it is unit-tested.
 */

/** The code is valid this long (the WhatsApp template promises "10 minutes"). */
export const OTP_TTL_SECONDS = 10 * 60;
/** Wrong guesses allowed before the code is thrown away. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between two codes for the same person. */
export const OTP_COOLDOWN_SECONDS = 45;
/** Codes one person can ask for in an hour. */
export const OTP_MAX_PER_HOUR = 8;
export const OTP_LENGTH = 6;

/** A random 6-digit code, leading zeros kept ("004217"). */
export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/**
 * What is stored instead of the code itself, so a copy of the Redis data can't
 * be used to log in. Keyed per person, so the same code for two people differs.
 */
export function hashOtp(code: string, userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`otp:${userId}:${code}`).digest("hex");
}

/** Constant-time check of a typed code against the stored hash. */
export function otpMatches(code: string, storedHash: string, userId: string, secret: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashOtp(code, userId, secret), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Strips spaces and dashes people type or paste: "123 456" -> "123456". */
export function cleanCode(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export type Identifier = { kind: "email"; email: string } | { kind: "phone"; national: string };

/**
 * Who is signing in, from what they typed: an email address, or an Indian
 * mobile number in any usual format. Undefined when it is neither.
 */
export function parseIdentifier(input: string): Identifier | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (value.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { kind: "email", email: value.toLowerCase() } : undefined;
  }
  const national = indianMobile(value);
  return national ? { kind: "phone", national } : undefined;
}

/** "98765 43210" -> "+91 ••••• •3210" for telling someone where a code went without printing the whole number. */
export function maskPhone(national: string): string {
  return `+91 ••••• •${national.slice(-4)}`;
}

/** "asha@shop.com" -> "a•••@shop.com". */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}
