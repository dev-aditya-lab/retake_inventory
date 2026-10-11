/**
 * Works out what a customer wants from an inbound WhatsApp message. Pure and
 * dependency-free so it can be unit-tested; the replies themselves are built in
 * whatsappReplies.ts and sent by services/whatsappInbound.service.ts.
 */

export type Intent =
  | "greeting" // hi, hii, Hello, Hlw, namaste ...
  | "menu" // menu, help, options
  | "invoices"
  | "pending"
  | "contact"
  | "payment"
  | "address"
  | "human" // wants a person to reply
  | "unknown";

export interface IntentInput {
  /** Body of a plain text message. */
  text?: string;
  /** Id of the row/button the customer tapped on an interactive message. */
  replyId?: string;
}

/** The tap-to-choose options. Titles <= 24 chars and descriptions <= 72 (WhatsApp list limits). */
export const MENU_OPTIONS = [
  { id: "opt_invoices", intent: "invoices", title: "My invoices", description: "Your recent bills" },
  { id: "opt_pending", intent: "pending", title: "Pending payment", description: "Amount due on your bills" },
  { id: "opt_contact", intent: "contact", title: "My contact person", description: "Who looks after your orders" },
  { id: "opt_payment", intent: "payment", title: "How to pay", description: "UPI and bank details" },
  { id: "opt_address", intent: "address", title: "Our address", description: "Where to find us" },
  { id: "opt_human", intent: "human", title: "Talk to staff", description: "A team member will reply here" },
] as const satisfies readonly { id: string; intent: Intent; title: string; description: string }[];

/** Squeezes repeated letters so "hiii", "helloo" and "heyyy" compare equal to their short forms. */
function collapse(value: string): string {
  return value.replace(/(.)\1+/g, "$1");
}

function tokenize(text: string): string[] {
  return collapse(text.toLowerCase().replace(/[^a-z0-9\s]/g, " "))
    .split(/\s+/)
    .filter(Boolean);
}

/** Greeting words, written in their collapsed form ("hello" -> "helo", "hii" -> "hi"). */
const GREETING_WORDS = new Set(
  [
    "hi", "hy", "hey", "hay", "hai", "hello", "hellow", "hlo", "hllo", "hlw", "hola", "namaste", "namaskar",
    "pranam", "salam", "salaam", "assalamualaikum", "gm",
  ].map(collapse),
);
// "good" collapses to "god" ("oo" -> "o"), so compare against collapsed forms.
const GOOD = collapse("good");
const GREETING_PERIODS = new Set(["morning", "afternoon", "evening", "night"].map(collapse));

/** Keyword -> intent, checked in this order (so "payment pending" is a pending question, not "how to pay"). */
const KEYWORDS: readonly (readonly [Intent, readonly string[]])[] = [
  ["pending", ["pending", "due", "dues", "balance", "baki", "baaki", "outstanding", "unpaid", "udhaar", "udhar"]],
  ["payment", ["pay", "payment", "payments", "paying", "upi", "bank", "qr", "account", "ifsc", "paytm", "gpay", "phonepe"]],
  ["invoices", ["invoice", "bill", "receipt", "order", "purchase", "history", "statement"]],
  ["human", ["human", "agent", "executive", "representative", "complaint", "problem", "issue", "talk", "speak", "reply", "assist", "assistance"]],
  ["contact", ["contact", "call", "number", "phone", "mobile", "staff", "support", "person", "sales", "salesman"]],
  ["address", ["address", "location", "where", "shop", "map", "visit", "directions", "kaha", "kahan"]],
  ["menu", ["menu", "help", "option", "options", "start", "service"]],
].map(([intent, words]) => [intent as Intent, (words as string[]).map(collapse)] as const);

/**
 * Short keywords must match a whole word (or a plural / "-ing" form) so a name
 * like "Payal" or "Bilal" isn't read as "pay" or "bill"; longer ones may be
 * prefixes ("invoice" matches "invoices").
 */
function tokenMatches(token: string, keyword: string): boolean {
  if (token === keyword || token === `${keyword}s` || token === `${keyword}es` || token === `${keyword}ing`) return true;
  return keyword.length >= 5 && token.startsWith(keyword);
}

function isGreeting(tokens: string[]): boolean {
  if (tokens.length === 0 || tokens.length > 4) return false;
  const [first, second] = tokens;
  if (first && GREETING_WORDS.has(first)) return true;
  return first === GOOD && second !== undefined && GREETING_PERIODS.has(second);
}

export function detectIntent(input: IntentInput): Intent {
  if (input.replyId) {
    const option = MENU_OPTIONS.find((o) => o.id === input.replyId);
    if (option) return option.intent;
  }

  const tokens = tokenize(input.text ?? "");
  if (tokens.length === 0) return "unknown";

  // A real question beats a greeting: "hi, my bill?" is about invoices.
  for (const [intent, words] of KEYWORDS) {
    if (tokens.some((token) => words.some((word) => tokenMatches(token, word)))) return intent;
  }

  return isGreeting(tokens) ? "greeting" : "unknown";
}
