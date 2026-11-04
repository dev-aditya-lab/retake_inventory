/** Mirrors backend/src/utils/customerTags.ts so the form enforces the same limits the server does. */
export const MAX_CUSTOMER_TAGS = 5;
export const MAX_TAG_LENGTH = 20;

/** Labels offered as one-tap choices; staff can still type their own. */
export const SUGGESTED_TAGS = ["Regular", "Wholesale", "Retail", "VIP", "Pays later"] as const;

/** Adds `raw` to `tags` unless it is empty, a duplicate (any case) or the list is full. */
export function addTag(tags: string[], raw: string): string[] {
  const tag = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
  if (!tag || tags.length >= MAX_CUSTOMER_TAGS) return tags;
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}
