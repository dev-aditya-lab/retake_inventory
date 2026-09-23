import { MAX_DOCUMENT_NUMBER_LENGTH } from "../config/gst";

/**
 * Formats an issued sequence number as {prefix}-YYMMDD-NNNN, e.g.
 * RTK-260923-0001 (invoice) or CN-260923-0001 (credit note). The YYMMDD
 * part comes from `dateKeyIST` — the Indian date, whatever the server zone.
 */
export function formatDocumentNumber(prefix: string, dateKey: string, seq: number): string {
  return `${prefix}-${dateKey}-${String(seq).padStart(4, "0")}`;
}

/** The series a number belongs to (everything before the counter), e.g. "RTK-260923-". */
export function documentSeries(documentNumber: string): string {
  return documentNumber.slice(0, documentNumber.lastIndexOf("-") + 1);
}

/** The counter part of a number, e.g. 12 for RTK-260923-0012. */
export function documentSequence(documentNumber: string): number {
  return Number(documentNumber.slice(documentNumber.lastIndexOf("-") + 1));
}

/** GST caps invoice and credit note numbers at 16 characters (CGST Rule 46(b)). */
export function isGstValidDocumentNumber(documentNumber: string): boolean {
  return documentNumber.length <= MAX_DOCUMENT_NUMBER_LENGTH;
}
