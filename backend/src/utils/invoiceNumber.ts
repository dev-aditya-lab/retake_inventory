/** YYMMDD date key used inside invoice numbers, in the server's local time zone. */
export function dateKeyFor(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Formats an already-issued sequence number into RTK-INV-YYMMDD-XXXX. */
export function formatInvoiceNumber(prefix: string, dateKey: string, seq: number): string {
  return `${prefix}-${dateKey}-${String(seq).padStart(4, "0")}`;
}
