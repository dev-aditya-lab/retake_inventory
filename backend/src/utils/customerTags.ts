/** Labels staff can put on a customer. Pure helpers; the validators and the UI share these limits. */

export const MAX_CUSTOMER_TAGS = 5;
export const MAX_TAG_LENGTH = 20;

/** Trims, drops empties and case-insensitive duplicates (keeping the first spelling), and caps the list. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_CUSTOMER_TAGS) break;
  }
  return out;
}
