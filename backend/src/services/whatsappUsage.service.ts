import { Types } from "mongoose";
import { User } from "../models/User.model";
import { WhatsappConversation } from "../models/WhatsappConversation.model";
import { WhatsappMessage } from "../models/WhatsappMessage.model";
import {
  computeResponseTimes,
  rangeWindow,
  summarizePricing,
  type PricingPoint,
  type PricingSummary,
  type TimedMessage,
  type UsageRange,
} from "../utils/whatsappUsage";
import { graph } from "./metaGraph.service";
import { getWhatsappConfig } from "./whatsappConfig.service";

const NOT_NOTE = { source: { $ne: "note" as const } };
const TZ = "Asia/Kolkata";

// ---------------------------------------------------------------------------
// Message counts (from our own records)
// ---------------------------------------------------------------------------

export async function getMessageCounts(range: UsageRange) {
  const { start, days } = rangeWindow(range);

  const [total, inbound, outbound, conversations, newConversations, daily, byType, statuses] = await Promise.all([
    WhatsappMessage.countDocuments(NOT_NOTE),
    WhatsappMessage.countDocuments({ ...NOT_NOTE, direction: "in" }),
    WhatsappMessage.countDocuments({ ...NOT_NOTE, direction: "out" }),
    WhatsappConversation.estimatedDocumentCount(),
    WhatsappConversation.countDocuments({ createdAt: { $gte: start } }),
    WhatsappMessage.aggregate<{ _id: { day: string; direction: string }; n: number }>([
      { $match: { ...NOT_NOTE, timestamp: { $gte: start } } },
      { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: TZ } }, direction: "$direction" }, n: { $sum: 1 } } },
    ]),
    WhatsappMessage.aggregate<{ _id: string; n: number }>([
      { $match: { ...NOT_NOTE, direction: "out", timestamp: { $gte: start } } },
      { $group: { _id: "$type", n: { $sum: 1 } } },
    ]),
    WhatsappMessage.aggregate<{ _id: string; n: number }>([
      { $match: { ...NOT_NOTE, direction: "out", timestamp: { $gte: start } } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
  ]);

  const byDay = new Map<string, { received: number; sent: number }>();
  for (const row of daily) {
    const d = byDay.get(row._id.day) ?? { received: 0, sent: 0 };
    if (row._id.direction === "in") d.received += row.n;
    else d.sent += row.n;
    byDay.set(row._id.day, d);
  }

  const statusCount = (s: string) => statuses.find((x) => x._id === s)?.n ?? 0;
  const inRange = daily.reduce((sum, r) => sum + r.n, 0);

  return {
    allTime: { total, received: inbound, sent: outbound, conversations },
    range: {
      days,
      total: inRange,
      received: daily.filter((r) => r._id.direction === "in").reduce((s, r) => s + r.n, 0),
      sent: daily.filter((r) => r._id.direction === "out").reduce((s, r) => s + r.n, 0),
      newConversations,
      failed: statusCount("failed"),
      delivered: statusCount("delivered") + statusCount("read"),
      read: statusCount("read"),
    },
    daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    sentByType: byType.map((t) => ({ type: t._id || "text", count: t.n })).sort((a, b) => b.count - a.count),
    /** Messages expire after a year (see WhatsappMessage), so "all time" means the last 12 months. */
    retentionNote: true,
  };
}

// ---------------------------------------------------------------------------
// What Meta charges
// ---------------------------------------------------------------------------

export interface MetaBill {
  available: boolean;
  currency: string;
  summary: PricingSummary | null;
  /** Why the numbers aren't there (no Business Account ID, missing permission, ...). */
  error: string | null;
}

/**
 * Meta's own billing analytics for the business account: what each kind of
 * message (marketing, utility, service...) cost in the range. These are Meta's
 * estimates; the invoice in Meta Business Manager is the source of truth.
 */
export async function getMetaBill(range: UsageRange): Promise<MetaBill> {
  const config = await getWhatsappConfig();
  if (!config.businessAccountId || !config.accessToken) {
    return { available: false, currency: "", summary: null, error: "Add the Business Account ID and access token under WhatsApp > Settings." };
  }

  const { start, end } = rangeWindow(range);
  const from = Math.floor(start.getTime() / 1000);
  const to = Math.floor(end.getTime() / 1000);

  try {
    const body = await graph<{
      currency?: string;
      pricing_analytics?: { data?: { data_points?: PricingPoint[] }[] };
    }>("GET", config.businessAccountId, {
      config,
      params: {
        fields: `currency,pricing_analytics.start(${from}).end(${to}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`,
      },
    });
    const points = (body.pricing_analytics?.data ?? []).flatMap((d) => d.data_points ?? []);
    return { available: true, currency: body.currency ?? "", summary: summarizePricing(points), error: null };
  } catch (err) {
    return { available: false, currency: "", summary: null, error: err instanceof Error ? err.message : "Couldn't load the bill from WhatsApp." };
  }
}

export async function getUsage(range: UsageRange) {
  const [counts, bill] = await Promise.all([getMessageCounts(range), getMetaBill(range)]);
  return { range, counts, bill };
}

// ---------------------------------------------------------------------------
// Team analytics
// ---------------------------------------------------------------------------

/** Reading this many messages is plenty for a shop; beyond it the figures cover the newest ones. */
const ANALYTICS_MESSAGE_CAP = 200_000;

export async function getAnalytics(range: UsageRange) {
  const { start } = rangeWindow(range);

  const rows = await WhatsappMessage.find({ ...NOT_NOTE, timestamp: { $gte: start } })
    .select("conversation direction source sentBy timestamp")
    .sort({ conversation: 1, timestamp: 1 })
    .limit(ANALYTICS_MESSAGE_CAP)
    .lean();
  const timed: TimedMessage[] = rows.map((m) => ({
    conversation: String(m.conversation),
    direction: m.direction,
    source: m.source ?? "customer",
    sentBy: m.sentBy ? String(m.sentBy) : undefined,
    timestamp: m.timestamp,
  }));
  const responses = computeResponseTimes(timed);

  // Customer messages by hour of the (Indian) day: when the shop is busiest.
  const hours = new Array<number>(24).fill(0);
  for (const m of timed) {
    if (m.direction === "in") {
      const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).format(m.timestamp)) % 24;
      hours[hour] = (hours[hour] ?? 0) + 1;
    }
  }

  const sentByMember = new Map<string, number>();
  for (const m of timed) if (m.source === "app" && m.sentBy) sentByMember.set(m.sentBy, (sentByMember.get(m.sentBy) ?? 0) + 1);

  const assigned = await WhatsappConversation.aggregate<{ _id: Types.ObjectId; open: number; resolved: number }>([
    { $match: { assignedTo: { $exists: true } } },
    {
      $group: {
        _id: "$assignedTo",
        open: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 0, 1] } },
        resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
      },
    },
  ]);
  const assignedById = new Map(assigned.map((a) => [String(a._id), a]));

  const ids = new Set<string>([...sentByMember.keys(), ...responses.perMember.keys(), ...assignedById.keys()]);
  const users = ids.size > 0 ? await User.find({ _id: { $in: [...ids] } }).select("name").lean() : [];
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  const team = [...ids]
    .map((id) => ({
      id,
      name: nameById.get(id) ?? "Former staff member",
      messagesSent: sentByMember.get(id) ?? 0,
      replies: responses.perMember.get(id)?.count ?? 0,
      avgResponseMs: responses.perMember.get(id)?.avgMs ?? 0,
      medianResponseMs: responses.perMember.get(id)?.medianMs ?? 0,
      openChats: assignedById.get(id)?.open ?? 0,
      resolvedChats: assignedById.get(id)?.resolved ?? 0,
    }))
    .sort((a, b) => b.messagesSent - a.messagesSent);

  const [open, resolved, unassigned, needsReply] = await Promise.all([
    WhatsappConversation.countDocuments({ status: { $ne: "resolved" } }),
    WhatsappConversation.countDocuments({ status: "resolved" }),
    WhatsappConversation.countDocuments({ status: { $ne: "resolved" }, assignedTo: { $exists: false } }),
    WhatsappConversation.countDocuments({ needsHuman: true }),
  ]);

  return {
    range,
    responseTime: responses.overall,
    team,
    busyHours: hours,
    chats: { open, resolved, unassigned, needsReply },
    truncated: rows.length >= ANALYTICS_MESSAGE_CAP,
  };
}
