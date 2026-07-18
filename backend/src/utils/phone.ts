/** Normalizes an Indian phone number to the digits-only format WhatsApp's API expects (e.g. "98765 43210" -> "919876543210"). */
export function normalizeIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits; // best effort — let the API reject it if still malformed
}
