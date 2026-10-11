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
