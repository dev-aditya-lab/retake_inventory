import { isGstStateCode } from "../config/gst";

// Formats accepted by the GST portal for a registered buyer (regular taxpayer,
// and government department IDs). Source: developer.gst.gov.in returns API
// docs, as encoded in the India Compliance app.
const NORMAL_GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z1-9ABD-J][0-9A-Z]$/;
const GOVT_DEPT_GSTIN = /^[0-9]{2}[A-Z]{4}[0-9]{5}[A-Z][0-9]Z[0-9]$/;

const CODE_POINTS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The GSTIN's 15th character is a mod-36 check digit over the first 14:
 * alternate weights 1,2,…; each weighted value contributes (v div 36) + (v mod 36).
 */
export function gstinCheckDigit(first14: string): string {
  let total = 0;
  let factor = 1;
  for (const char of first14) {
    const weighted = factor * CODE_POINTS.indexOf(char);
    total += Math.floor(weighted / 36) + (weighted % 36);
    factor = factor === 1 ? 2 : 1;
  }
  return CODE_POINTS[(36 - (total % 36)) % 36]!;
}

export function normalizeGstin(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

export type GstinProblem = "format" | "state" | "checksum";

/** Why a GSTIN is invalid, or null if it's valid. */
export function gstinProblem(value: string): GstinProblem | null {
  const gstin = normalizeGstin(value);
  if (!NORMAL_GSTIN.test(gstin) && !GOVT_DEPT_GSTIN.test(gstin)) return "format";
  if (!isGstStateCode(gstin.slice(0, 2))) return "state";
  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin[14]) return "checksum";
  return null;
}

export function isValidGstin(value: string | undefined | null): boolean {
  return !!value && gstinProblem(value) === null;
}

/** State code a GSTIN is registered in (its first two digits). */
export function gstinStateCode(gstin: string): string {
  return normalizeGstin(gstin).slice(0, 2);
}

/** Human-readable reason, for API errors and the pre-filing checks. */
export function describeGstinProblem(value: string): string | null {
  switch (gstinProblem(value)) {
    case "format":
      return `"${value}" isn't a GSTIN — it should be 15 characters like 20ABCDE1234F1Z5`;
    case "state":
      return `"${value}" starts with an unknown state code`;
    case "checksum":
      return `"${value}" has a typo — its last character doesn't match (check digit failed)`;
    default:
      return null;
  }
}
