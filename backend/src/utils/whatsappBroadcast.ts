import { phoneKey } from "./phone";
import type { TemplateValues } from "./whatsappTemplates";

/** Pure rules for broadcasts: who gets one, opt-outs, per-person values and the delivery counts. */

/** One day's worth of safety: a broadcast never goes to more people than this. */
export const MAX_BROADCAST_RECIPIENTS = 2000;
/** Gap between two sends. 250 ms = 4 messages a second, far under WhatsApp's own limit. */
export const SEND_GAP_MS = 250;

export interface AudienceEntry {
  /** Any common phone format. */
  phone: string;
  name?: string;
}

export interface Recipient {
  waId: string;
  name: string;
}

/** Valid numbers only, one entry per person (the first name seen wins), in the order given. */
export function dedupeAudience(entries: readonly AudienceEntry[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const entry of entries) {
    const waId = phoneKey(entry.phone);
    if (!waId || seen.has(waId)) continue;
    seen.add(waId);
    out.push({ waId, name: (entry.name ?? "").trim() });
  }
  return out;
}

const OPT_OUT = /^\s*(stop|unsubscribe|opt[\s-]?out|band\s*karo)\s*[.!]*\s*$/i;
const OPT_IN = /^\s*(start|subscribe|opt[\s-]?in|shuru\s*karo)\s*[.!]*\s*$/i;

/** A customer asking us to stop sending broadcasts. Exact short replies only, so a normal sentence never opts anyone out. */
export function isOptOut(text: string | undefined): boolean {
  return !!text && OPT_OUT.test(text);
}

export function isOptIn(text: string | undefined): boolean {
  return !!text && OPT_IN.test(text);
}

/**
 * The template values for one person: `nameVariable` (the 0-based position of a
 * body variable) is filled with their name, or "there" when we have none.
 */
export function valuesFor(values: TemplateValues, nameVariable: number | undefined, name: string): TemplateValues {
  if (nameVariable === undefined) return values;
  const body = [...(values.body ?? [])];
  body[nameVariable] = name.trim() ? name.trim().split(/\s+/)[0]! : "there";
  return { ...values, body };
}

export type RecipientStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export interface BroadcastCounts {
  total: number;
  queued: number;
  /** Handed to WhatsApp (includes everything delivered or read). */
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

/** Turns "how many recipients are in each status" into the counts people read (cumulative, like the ticks). */
export function countsFromStatuses(groups: readonly { status: string; n: number }[]): BroadcastCounts {
  const n = (status: string) => groups.find((g) => g.status === status)?.n ?? 0;
  const read = n("read");
  const delivered = n("delivered") + read;
  return {
    total: groups.reduce((sum, g) => sum + g.n, 0),
    queued: n("queued"),
    sent: n("sent") + delivered,
    delivered,
    read,
    failed: n("failed"),
  };
}
