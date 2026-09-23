/** Normalizes an Indian phone number to the digits-only format WhatsApp's API expects (e.g. "98765 43210" -> "919876543210"). */
export function normalizeIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits; // best effort — let the API reject it if still malformed
}

/**
 * Stable lookup key for a customer's phone number — the normalized digits,
 * so "98765 43210", "+91-9876543210" and "09876543210" all match the same
 * customer. Returns undefined when there are too few digits to be a real
 * number (blank, "-", a typo), so such bills don't create a directory entry.
 */
export function phoneKey(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  const digits = normalizeIndianPhone(phone);
  return digits.length >= 10 && digits.length <= 15 ? digits : undefined;
}
