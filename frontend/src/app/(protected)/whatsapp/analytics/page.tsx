"use client";

import { useState, type ReactNode } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { useGetWhatsappAnalyticsQuery, useGetWhatsappUsageQuery } from "@/lib/redux/features/whatsapp/whatsappApi";
import { formatDuration, formatMoney } from "@/lib/whatsapp";
import type { AnalyticsData, UsageData, UsageRange } from "@/types/whatsapp";

const RANGES: { value: UsageRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "month", label: "This month" },
];

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing templates",
  UTILITY: "Utility templates",
  AUTHENTICATION: "Authentication templates",
  SERVICE: "Replies to customers",
  MARKETING_LITE: "Marketing (lite)",
  REFERRAL_CONVERSION: "Referral",
};

const TYPE_LABEL: Record<string, string> = {
  text: "Text",
  template: "Templates",
  image: "Photos",
  video: "Videos",
  audio: "Audio",
  document: "Documents",
  interactive: "Buttons and lists",
  location: "Locations",
  contacts: "Contact cards",
};

/** Message counts, how fast the team replies, the Meta bill. Admin only. */
export default function AnalyticsPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can see the analytics.">
      <AnalyticsPanels />
    </RequireRole>
  );
}

function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-foreground">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AnalyticsPanels() {
  const [range, setRange] = useState<UsageRange>("30d");
  const usage = useGetWhatsappUsageQuery(range);
  const analytics = useGetWhatsappAnalyticsQuery(range);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            role="tab"
            aria-selected={range === r.value}
            onClick={() => setRange(r.value)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${range === r.value ? "bg-leaf-100 text-leaf-800" : "bg-background text-muted ring-1 ring-border hover:bg-ink-100"}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {usage.isLoading ? <p className="text-sm text-muted">Loading…</p> : usage.data ? <UsageSection usage={usage.data} /> : <LoadError onRetry={() => usage.refetch()} />}
      {analytics.isLoading ? <p className="text-sm text-muted">Loading team figures…</p> : analytics.data ? <TeamSection data={analytics.data} /> : <LoadError onRetry={() => analytics.refetch()} />}
      {usage.data && <BillSection bill={usage.data.bill} />}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-sm">
      <p className="text-danger">Couldn&apos;t load this part.</p>
      <button type="button" onClick={onRetry} className="mt-1 font-medium text-primary">
        Try again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message counts
// ---------------------------------------------------------------------------

function UsageSection({ usage }: { usage: UsageData }) {
  const { allTime, range, daily, sentByType } = usage.counts;
  const maxDay = Math.max(1, ...daily.map((d) => d.received + d.sent));
  const maxType = Math.max(1, ...sentByType.map((t) => t.count));

  return (
    <>
      <Section title="Total messages" hint="Messages are kept for 12 months, so the all-time numbers cover the last year.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="All messages" value={allTime.total} />
          <Tile label="Received" value={allTime.received} />
          <Tile label="Sent" value={allTime.sent} />
          <Tile label="Chats" value={allTime.conversations} />
        </div>
      </Section>

      <Section title={`In the last ${range.days} day${range.days === 1 ? "" : "s"}`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Messages" value={range.total} />
          <Tile label="Received" value={range.received} />
          <Tile label="Sent" value={range.sent} />
          <Tile label="New chats" value={range.newConversations} />
          <Tile label="Delivered" value={range.delivered} hint={range.sent ? `${Math.round((range.delivered / range.sent) * 100)}% of sent` : undefined} />
          <Tile label="Read" value={range.read} hint={range.sent ? `${Math.round((range.read / range.sent) * 100)}% of sent` : undefined} />
          <Tile label="Failed" value={range.failed} />
        </div>

        <h3 className="mb-2 mt-5 text-sm font-medium text-foreground">Messages per day</h3>
        {daily.length === 0 ? (
          <p className="text-sm text-muted">No messages in this period.</p>
        ) : (
          <>
            <div className="flex h-36 items-end gap-0.5 overflow-x-auto" role="img" aria-label={`Messages per day: ${daily.map((d) => `${shortDay(d.date)} ${d.received + d.sent}`).join(", ")}`}>
              {daily.map((d) => (
                <div key={d.date} className="flex h-full min-w-2 flex-1 flex-col justify-end" title={`${shortDay(d.date)}: ${d.received} received, ${d.sent} sent`}>
                  <div className="w-full bg-leaf-300" style={{ height: `${(d.received / maxDay) * 100}%` }} />
                  <div className="w-full rounded-t-sm bg-leaf-600" style={{ height: `${(d.sent / maxDay) * 100}%` }} />
                </div>
              ))}
            </div>
            <p className="mt-1 flex items-center justify-between text-[11px] text-muted">
              <span>{shortDay(daily[0]!.date)}</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 bg-leaf-600" /> Sent</span>
                <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 bg-leaf-300" /> Received</span>
              </span>
              <span>{shortDay(daily[daily.length - 1]!.date)}</span>
            </p>
          </>
        )}

        {sentByType.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-medium text-foreground">What was sent</h3>
            <ul className="flex flex-col gap-1.5">
              {sentByType.map((t) => (
                <li key={t.type} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 truncate text-muted">{TYPE_LABEL[t.type] ?? t.type}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span className="block h-full rounded-full bg-leaf-500" style={{ width: `${(t.count / maxType) * 100}%` }} />
                  </span>
                  <span className="w-12 shrink-0 text-right font-medium text-foreground">{t.count.toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Response times and the team
// ---------------------------------------------------------------------------

function TeamSection({ data }: { data: AnalyticsData }) {
  const maxHour = Math.max(1, ...data.busyHours);

  return (
    <>
      <Section title="How fast the team replies" hint="From a customer's message to the next reply typed by a person. Automatic replies don't count.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Average reply time" value={formatDuration(data.responseTime.avgMs)} />
          <Tile label="Typical (median)" value={formatDuration(data.responseTime.medianMs)} />
          <Tile label="Replies measured" value={data.responseTime.count} />
          <Tile label="Waiting for a reply" value={data.chats.needsReply} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Open chats" value={data.chats.open} />
          <Tile label="Resolved chats" value={data.chats.resolved} />
          <Tile label="Nobody assigned" value={data.chats.unassigned} />
        </div>
        {data.truncated && <p className="mt-2 text-xs text-muted">There are a lot of messages in this period, so the figures cover the most recent ones.</p>}
      </Section>

      <Section title="By team member">
        {data.team.length === 0 ? (
          <p className="text-sm text-muted">No replies or assigned chats in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="px-3 py-2 text-right font-medium">Messages sent</th>
                  <th className="px-3 py-2 text-right font-medium">Avg reply time</th>
                  <th className="px-3 py-2 text-right font-medium">Open chats</th>
                  <th className="py-2 pl-3 text-right font-medium">Resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.team.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-3 font-medium text-foreground">{m.name}</td>
                    <td className="px-3 py-2 text-right">{m.messagesSent.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-right">{formatDuration(m.avgResponseMs)}</td>
                    <td className="px-3 py-2 text-right">{m.openChats}</td>
                    <td className="py-2 pl-3 text-right">{m.resolvedChats}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="When customers write" hint="Customer messages by hour of the day (India time).">
        <div className="flex h-28 items-end gap-0.5" role="img" aria-label={`Customer messages by hour: ${data.busyHours.map((n, h) => `${h}:00 ${n}`).join(", ")}`}>
          {data.busyHours.map((n, hour) => (
            <div key={hour} className="flex h-full flex-1 flex-col justify-end" title={`${hour}:00 - ${n} message${n === 1 ? "" : "s"}`}>
              <div className="w-full rounded-t-sm bg-leaf-500" style={{ height: `${(n / maxHour) * 100}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-1 flex justify-between text-[11px] text-muted">
          <span>12 am</span>
          <span>6 am</span>
          <span>12 pm</span>
          <span>6 pm</span>
          <span>11 pm</span>
        </p>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// What Meta charges
// ---------------------------------------------------------------------------

function BillSection({ bill }: { bill: UsageData["bill"] }) {
  const summary = bill.summary;
  const maxCost = Math.max(0.0001, ...(summary?.daily.map((d) => d.cost) ?? [0]));

  return (
    <Section title="Meta bill" hint="What WhatsApp charges for the messages sent in this period. These are Meta's own estimates; the invoice in Meta Business Manager is the final word.">
      {!bill.available || !summary ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{bill.error ?? "The bill isn't available right now."}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Tile label="Charged" value={formatMoney(summary.totalCost, bill.currency)} />
            <Tile label="Messages billed or free" value={summary.totalVolume} />
            <Tile label="Free messages" value={summary.byCategory.reduce((sum, c) => sum + c.freeVolume, 0)} />
          </div>

          {summary.byCategory.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing was billed in this period.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Kind of message</th>
                    <th className="px-3 py-2 text-right font-medium">Messages</th>
                    <th className="px-3 py-2 text-right font-medium">Free</th>
                    <th className="py-2 pl-3 text-right font-medium">Charge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {summary.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td className="py-2 pr-3 font-medium text-foreground">{CATEGORY_LABEL[c.category] ?? c.category.toLowerCase()}</td>
                      <td className="px-3 py-2 text-right">{c.volume.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-right">{c.freeVolume.toLocaleString("en-IN")}</td>
                      <td className="py-2 pl-3 text-right font-medium">{formatMoney(c.cost, bill.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {summary.daily.some((d) => d.cost > 0) && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-medium text-foreground">Charge per day</h3>
              <div className="flex h-24 items-end gap-0.5" role="img" aria-label="Charge per day">
                {summary.daily.map((d) => (
                  <div key={d.date} className="flex h-full min-w-2 flex-1 flex-col justify-end" title={`${shortDay(d.date)}: ${formatMoney(d.cost, bill.currency)}`}>
                    <div className="w-full rounded-t-sm bg-chilli-500" style={{ height: `${(d.cost / maxCost) * 100}%` }} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Section>
  );
}
