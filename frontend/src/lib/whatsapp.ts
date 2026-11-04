import type { ChatListItem } from "@/types/whatsapp";

/** "919876543210" -> "+91 98765 43210". Other countries just get a plus sign. */
export function formatWaId(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return digits ? `+${digits}` : waId;
}

/** What to call a chat: the customer's name when known, else their number. */
export function chatTitle(chat: Pick<ChatListItem, "name" | "waId">): string {
  return chat.name.trim() || formatWaId(chat.waId);
}

export function initialOf(title: string): string {
  const match = title.trim().match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : "#";
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chat-list timestamp: the time today, "Yesterday", then the date. */
export function formatChatTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (diffDays <= 0) return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Day divider inside a thread. */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const VARIABLE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** The {{variables}} used in `text`, each once, in order of first use. */
export function variablesIn(text: string): string[] {
  const seen: string[] = [];
  for (const match of text.matchAll(VARIABLE)) {
    if (!seen.includes(match[1]!)) seen.push(match[1]!);
  }
  return seen;
}

/** Replaces each {{variable}} with its value (by position in `names`); unfilled ones stay as a visible placeholder. */
export function fillVariables(text: string, names: string[], values: string[] = []): string {
  const byName = new Map(names.map((name, i) => [name, (values[i] ?? "").trim()]));
  return text.replace(VARIABLE, (whole, name: string) => byName.get(name) || whole);
}

/** "customer_name" -> "Customer name"; numbered variables become "Value 1". */
export function variableLabel(name: string): string {
  if (/^\d+$/.test(name)) return `Value ${name}`;
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "PENDING_DELETION" -> "pending deletion". */
export function lowerWords(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

/** Business categories WhatsApp offers (the codes are Meta's; keep in step with the backend list). */
export const BUSINESS_VERTICALS: { value: string; label: string }[] = [
  { value: "UNDEFINED", label: "Not set" },
  { value: "RETAIL", label: "Shopping and retail" },
  { value: "GROCERY", label: "Food and grocery" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "APPAREL", label: "Clothing and apparel" },
  { value: "BEAUTY", label: "Beauty, spa and salon" },
  { value: "AUTO", label: "Automotive" },
  { value: "EDU", label: "Education" },
  { value: "ENTERTAIN", label: "Entertainment" },
  { value: "EVENT_PLAN", label: "Event planning and service" },
  { value: "FINANCE", label: "Finance and banking" },
  { value: "GOVT", label: "Public service" },
  { value: "HOTEL", label: "Hotel and lodging" },
  { value: "HEALTH", label: "Medical and health" },
  { value: "NONPROFIT", label: "Non-profit" },
  { value: "PROF_SERVICES", label: "Professional services" },
  { value: "TRAVEL", label: "Travel and transportation" },
  { value: "OTHER", label: "Other" },
];

export function verticalLabel(code: string): string {
  return BUSINESS_VERTICALS.find((v) => v.value === code)?.label ?? "Not set";
}

/** 90_000 -> "1 min 30 s", 4_000 -> "4 s", 0 -> "-" (nothing to measure). */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "-";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min${totalSeconds % 60 ? ` ${totalSeconds % 60} s` : ""}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

/** An amount in the account's currency (Meta bills in the business account's currency, e.g. INR). */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
