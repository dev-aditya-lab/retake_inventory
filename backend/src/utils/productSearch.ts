import { escapeRegex } from "./regex";

const MAX_WORDS = 6;
/** Fewer digits than this match too many barcodes to be a useful "last digits" search. */
const MIN_BARCODE_TAIL_DIGITS = 3;

/**
 * Mongo filter for the product search box, built for typing at the billing
 * counter when a barcode won't scan. Every space-separated word has to match
 * somewhere on the product, so "tur 100" finds Turmeric 100g. A word that is
 * all digits also matches the END of the barcode — the last 3–12 digits — and
 * a full 13-digit word matches the barcode exactly.
 */
export function buildProductSearchFilter(search: string): Record<string, unknown> {
  const words = search.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  if (words.length === 0) return {};

  const perWord = words.map((word) => {
    const pattern = escapeRegex(word);
    const anyOf: Record<string, unknown>[] = [
      { name: { $regex: pattern, $options: "i" } },
      { sku: { $regex: pattern, $options: "i" } },
      { weightLabel: { $regex: pattern, $options: "i" } },
      { type: { $regex: pattern, $options: "i" } },
    ];
    if (/^\d+$/.test(word)) {
      if (word.length === 13) anyOf.push({ ean13: word });
      else if (word.length >= MIN_BARCODE_TAIL_DIGITS) anyOf.push({ ean13: { $regex: `${pattern}$` } });
    }
    return { $or: anyOf };
  });

  return perWord.length === 1 ? perWord[0]! : { $and: perWord };
}
