"use client";

import type { ReactNode } from "react";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { formatDateTime } from "@/lib/format";
import { useGetWhatsappApiStatusQuery } from "@/lib/redux/features/whatsapp/whatsappApi";
import { lowerWords } from "@/lib/whatsapp";

type Tone = "good" | "bad" | "neutral";

const TONE: Record<Tone, string> = {
  good: "bg-leaf-100 text-leaf-800",
  bad: "bg-chilli-100 text-chilli-800",
  neutral: "bg-ink-100 text-ink-700",
};

/** The health of the WhatsApp connection, read live from Meta. Admin only. */
export default function ApiStatusPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can see the API status.">
      <StatusPanels />
    </RequireRole>
  );
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>{label}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-1.5 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <dl className="mt-1 divide-y divide-border/60">{children}</dl>
    </section>
  );
}

const good = (value: string, ...goodValues: string[]): Tone => (goodValues.includes(value) ? "good" : value ? "bad" : "neutral");

function StatusPanels() {
  const { data, isLoading, isFetching, isError, refetch } = useGetWhatsappApiStatusQuery(undefined, {
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
  });

  if (isLoading) return <p className="text-sm text-muted">Checking with WhatsApp…</p>;
  if (isError || !data) {
    return (
      <div className="text-sm">
        <p className="text-danger">Couldn&apos;t check the API status.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
          Try again
        </button>
      </div>
    );
  }

  const healthy = data.problems.length === 0;
  const { phone, account, token, webhook, service } = data;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className={`flex flex-wrap items-start gap-3 rounded-xl border p-4 ${healthy ? "border-leaf-200 bg-leaf-50" : "border-chilli-200 bg-chilli-50"}`}
      >
        {healthy ? <CheckCircle2 size={24} className="shrink-0 text-leaf-700" aria-hidden /> : <TriangleAlert size={24} className="shrink-0 text-chilli-700" aria-hidden />}
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold text-foreground">{healthy ? "Everything looks good" : `${data.problems.length} thing${data.problems.length === 1 ? "" : "s"} need${data.problems.length === 1 ? "s" : ""} attention`}</p>
          {!healthy && (
            <ul className="mt-1 list-disc pl-5 text-sm text-chilli-800">
              {data.problems.map((p) => (
                <li key={p} className="[overflow-wrap:anywhere]">
                  {p}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted">
            Checked {formatDateTime(data.checkedAt)}
            {data.latencyMs !== null && ` · WhatsApp answered in ${data.latencyMs} ms`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
        >
          <RefreshCw size={16} className={isFetching ? "animate-spin" : undefined} aria-hidden /> Check again
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="This app">
          <Row label="WhatsApp service">
            <Pill label={service.enabled ? "On" : "Off"} tone={service.enabled ? "good" : "bad"} />
          </Row>
          <Row label="Set up">
            <Pill label={service.configured ? "Yes" : "Missing details"} tone={service.configured ? "good" : "bad"} />
          </Row>
          <Row label="API version">{service.apiVersion || "-"}</Row>
        </Card>

        <Card title="Phone number">
          {phone ? (
            <>
              <Row label="Number">{phone.displayPhoneNumber || "-"}</Row>
              <Row label="Shop name">{phone.verifiedName || "-"}</Row>
              <Row label="Connection">
                <Pill label={lowerWords(phone.status || "unknown")} tone={good(phone.status, "CONNECTED")} />
              </Row>
              <Row label="Quality">
                <Pill label={lowerWords(phone.quality || "unknown")} tone={phone.quality === "GREEN" ? "good" : phone.quality === "RED" ? "bad" : "neutral"} />
              </Row>
              <Row label="Name review">
                <Pill label={lowerWords(phone.nameStatus || "unknown")} tone={good(phone.nameStatus, "APPROVED")} />
              </Row>
              {phone.pendingName && (
                <Row label="Name change">
                  {phone.pendingName} <Pill label={lowerWords(phone.pendingNameStatus)} />
                </Row>
              )}
              <Row label="Mode">{lowerWords(phone.accountMode || "-")}</Row>
              <Row label="Platform">{lowerWords(phone.platform || "-")}</Row>
              <Row label="Speed">{lowerWords(phone.throughput || "-")}</Row>
              {phone.messagingLimit && <Row label="Daily limit">{lowerWords(phone.messagingLimit)}</Row>}
              <Row label="Number check">
                <Pill label={lowerWords(phone.codeVerification || "unknown")} tone={good(phone.codeVerification, "VERIFIED")} />
              </Row>
            </>
          ) : (
            <p className="py-2 text-sm text-muted">Not available. See the problems above.</p>
          )}
        </Card>

        <Card title="Business account">
          {account ? (
            <>
              <Row label="Name">{account.name || "-"}</Row>
              <Row label="Can send messages">
                <Pill label={lowerWords(account.canSendMessage || "unknown")} tone={good(account.canSendMessage, "AVAILABLE")} />
              </Row>
              <Row label="Account review">
                <Pill label={lowerWords(account.reviewStatus || "unknown")} tone={good(account.reviewStatus, "APPROVED")} />
              </Row>
              <Row label="Business verification">
                <Pill label={lowerWords(account.verification || "unknown")} tone={good(account.verification, "verified")} />
              </Row>
              <Row label="Billing currency">{account.currency || "-"}</Row>
            </>
          ) : (
            <p className="py-2 text-sm text-muted">Not available. Add the Business Account ID under Settings.</p>
          )}
        </Card>

        <Card title="Access token">
          {token ? (
            <>
              <Row label="Valid">
                <Pill label={token.valid ? "Yes" : "No"} tone={token.valid ? "good" : "bad"} />
              </Row>
              <Row label="Type">{lowerWords(token.type || "-")}</Row>
              <Row label="Expires">
                {token.neverExpires ? <Pill label="Never" tone="good" /> : token.expiresAt ? formatDateTime(token.expiresAt) : "-"}
              </Row>
              <Row label="App">{token.appName || token.appId || "-"}</Row>
              <Row label="Permissions">{token.scopes.length ? token.scopes.join(", ") : "-"}</Row>
            </>
          ) : (
            <p className="py-2 text-sm text-muted">Not available. See the problems above.</p>
          )}
        </Card>

        <Card title="Incoming messages (webhook)">
          <Row label="This app subscribed">
            {webhook.subscribed === null ? "Unknown" : <Pill label={webhook.subscribed ? "Yes" : "No"} tone={webhook.subscribed ? "good" : "bad"} />}
          </Row>
          <Row label="Subscribed apps">{webhook.subscribedApps.length ? webhook.subscribedApps.join(", ") : "None"}</Row>
          <Row label="Last update from WhatsApp">{webhook.lastEventAt ? formatDateTime(webhook.lastEventAt) : "None yet"}</Row>
          <Row label="Last customer message">{webhook.lastCustomerMessageAt ? formatDateTime(webhook.lastCustomerMessageAt) : "None yet"}</Row>
        </Card>
      </div>
    </div>
  );
}
