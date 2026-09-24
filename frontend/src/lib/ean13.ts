/** True for a 13-digit EAN-13 whose last digit is the correct check digit. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/**
 * The EAN-13 a scanned value stands for, or null if it isn't one. A 12-digit
 * UPC-A (US products) is an EAN-13 with a leading zero, so third-party packs
 * scan too. A misread with a wrong check digit is rejected here — that's what
 * keeps a bad read from adding the wrong product to a bill.
 */
export function toEan13(scanned: string): string | null {
  const digits = scanned.trim();
  const code = /^\d{12}$/.test(digits) ? `0${digits}` : digits;
  return isValidEan13(code) ? code : null;
}
