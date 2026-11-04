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
