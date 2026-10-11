/** Normalizes an Indian phone number to the digits-only format WhatsApp's API expects (e.g. "98765 43210" -> "919876543210"). */
export function normalizeIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits; // best effort — let the API reject it if still malformed
}

/**
 * The 10-digit national number of an Indian mobile ("98765 43210",
 * "+91 98765-43210", "09876543210" all give "9876543210"), or undefined if the
 * input is not one. Indian mobiles start with 6-9, which also rejects landline
 * and mistyped numbers.
 */
export function indianMobile(phone: string | undefined | null): string | undefined {
  const key = phoneKey(phone);
  if (!key || key.length !== 12 || !key.startsWith("91")) return undefined;
  const national = key.slice(2);
  return /^[6-9]\d{9}$/.test(national) ? national : undefined;
}

/**
 * A regular expression (as a string, for MongoDB `$regex`) matching every way a
 * 10-digit Indian mobile number is typed into a bill: "98765 43210",
 * "+91-98765-43210", "09876543210", "919876543210". Bills store the phone as
 * typed, so this is how bills without a customer-directory link are found.
 * Built from digits only, so it carries no user-controlled regex syntax.
 * Returns undefined when there are too few digits to be a real number.
 */
export function phoneSearchPattern(phone: string | undefined | null): string | undefined {
  const key = phoneKey(phone);
  if (!key) return undefined;
  const national = key.slice(-10);
  if (national.length < 10) return undefined;
  return `^\\D*(?:(?:\\+|00)?91\\D*)?0?\\D*${national.split("").join("\\D*")}\\D*$`;
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
