/** Pure rules for automatic replies: matching keywords and telling whether the shop is open. */

export type KeywordMatch = "contains" | "exact";

export interface KeywordRule {
  keywords: readonly string[];
  match: KeywordMatch;
}

/** Lower-case, punctuation turned into spaces, spaces collapsed: "Price?!" and "price" compare equal. Works for any script. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    // \p{M} keeps the vowel signs of Hindi and other scripts; without it "कीमत" would be cut into pieces.
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The index of the first rule the message triggers, or -1. "exact" means the
 * whole message is that keyword; "contains" means the keyword appears as whole
 * word(s), so "price" doesn't fire on "priceless".
 */
export function matchKeyword(text: string | undefined, rules: readonly KeywordRule[]): number {
  const message = normalizeText(text ?? "");
  if (!message) return -1;
  const padded = ` ${message} `;

  return rules.findIndex((rule) =>
    rule.keywords.some((keyword) => {
      const k = normalizeText(keyword);
      if (!k) return false;
      return rule.match === "exact" ? message === k : padded.includes(` ${k} `);
    }),
  );
}

export interface DayHours {
  closed: boolean;
  /** "HH:MM", 24-hour. */
  open: string;
  close: string;
}

/** Seven entries, Sunday first (the same order as JavaScript's getDay). */
export interface BusinessHours {
  enabled: boolean;
  days: DayHours[];
}

export const DEFAULT_HOURS: BusinessHours = {
  enabled: false,
  days: [
    { closed: true, open: "10:00", close: "20:00" }, // Sunday
    ...Array.from({ length: 6 }, () => ({ closed: false, open: "10:00", close: "20:00" })),
  ],
};

const toMinutes = (hhmm: string): number | undefined => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 24 && min < 60 ? h * 60 + min : undefined;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Is `at` inside the shop's opening hours (Indian time)? With no usable hours set, the shop counts as always open. */
export function isWithinHours(at: Date, hours: BusinessHours): boolean {
  if (!hours.enabled || hours.days.length !== 7) return true;
  const local = new Date(at.getTime() + IST_OFFSET_MS);
  const day = hours.days[local.getUTCDay()]!;
  if (day.closed) return false;

  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (open === undefined || close === undefined || close <= open) return true;
  const now = local.getUTCHours() * 60 + local.getUTCMinutes();
  return now >= open && now < close;
}
