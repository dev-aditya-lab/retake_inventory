/** True for a MongoDB unique-index violation (E11000), e.g. a racing insert of the same SKU. */
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === 11000;
}
