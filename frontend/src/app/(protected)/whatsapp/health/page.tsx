"use client";

import { RequireRole } from "@/components/auth/RequireRole";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDateTime } from "@/lib/format";
import {
  useAcknowledgeAlertMutation,
  useGetWhatsappHealthQuery,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import type { AlertSeverity, WhatsappAlert, WhatsappTemplate } from "@/types/whatsapp";
import { useState } from "react";

const POLL_MS = 60_000;

/** Template reviews, the number's quality and account notices, as Meta reports them. Admin only. */
export default function WhatsappHealthPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can see the WhatsApp account health.">
      <HealthPanels />
    </RequireRole>
  );
}

function HealthPanels() {
  const { data, isLoading, isError, refetch } = useGetWhatsappHealthQuery(undefined, {
    pollingInterval: POLL_MS,
    skipPollingIfUnfocused: true,
  });

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (isError || !data) {
    return (
      <div className="text-sm">
        <p className="text-danger">Couldn&apos;t load the account health.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
          Try again
        </button>
      </div>
    );
  }

  const open = data.alerts.filter((a) => !a.acknowledged && a.severity !== "info");

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {open.length > 0 && (
        <div role="status" className="rounded-lg border border-chilli-200 bg-chilli-50 p-3 text-sm text-chilli-800">
          {open.length} thing{open.length === 1 ? "" : "s"} need{open.length === 1 ? "s" : ""} your attention. Review{" "}
          {open.length === 1 ? "it" : "them"} below.
        </div>
      )}

      <section aria-labelledby="number-heading">
        <h2 id="number-heading" className="text-base font-semibold text-foreground">
          Number
        </h2>
        <div className="mt-2 rounded-lg border border-border bg-background p-3 text-sm">
          {data.number ? (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Fact label="Last change" value={data.number.event ? data.number.event.toLowerCase() : "-"} />
              <Fact label="Messaging limit" value={data.number.limit || "-"} />
              <Fact label="Reported" value={formatDateTime(data.number.at)} />
            </dl>
          ) : (
            <p className="text-muted">
              No quality or limit changes reported yet. They appear here when Meta sends one.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="templates-heading">
        <h2 id="templates-heading" className="text-base font-semibold text-foreground">
          Message templates
        </h2>
        {data.templates.length === 0 ? (
          <p className="mt-2 rounded-lg border border-border bg-background p-3 text-sm text-muted">
            No template updates yet. A template shows here after Meta reviews or re-scores it.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {data.templates.map((template) => (
              <TemplateRow key={template.id} template={template} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="text-base font-semibold text-foreground">
          Alerts
        </h2>
        {data.alerts.length === 0 ? (
          <p className="mt-2 rounded-lg border border-border bg-background p-3 text-sm text-muted">
            Nothing to report. Account notices from WhatsApp show up here.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {data.alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium capitalize text-foreground">{value}</dd>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  APPROVED: "bg-leaf-100 text-leaf-800",
  REINSTATED: "bg-leaf-100 text-leaf-800",
  REJECTED: "bg-chilli-100 text-chilli-800",
  DISABLED: "bg-chilli-100 text-chilli-800",
  PAUSED: "bg-chilli-100 text-chilli-800",
  FLAGGED: "bg-chilli-100 text-chilli-800",
};

const QUALITY_TONE: Record<string, string> = {
  GREEN: "bg-leaf-100 text-leaf-800",
  YELLOW: "bg-ink-200 text-ink-800",
  RED: "bg-chilli-100 text-chilli-800",
};

function Chip({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone ?? "bg-ink-100 text-ink-700"}`}>{label}</span>
  );
}

function TemplateRow({ template }: { template: WhatsappTemplate }) {
  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 break-all text-sm font-medium text-foreground">{template.name}</p>
        <span className="text-xs text-muted">{template.language}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {template.status && (
          <Chip label={template.status.toLowerCase().replace(/_/g, " ")} tone={STATUS_TONE[template.status]} />
        )}
        {template.quality && (
          <Chip label={`quality ${template.quality.toLowerCase()}`} tone={QUALITY_TONE[template.quality]} />
        )}
        {template.category && <Chip label={template.category.toLowerCase()} />}
      </div>
      {template.reason && <p className="mt-1.5 text-xs text-danger">Reason: {template.reason}</p>}
      <p className="mt-1.5 text-xs text-muted">Updated {formatDateTime(template.updatedAt)}</p>
    </li>
  );
}

const SEVERITY_TONE: Record<AlertSeverity, string> = {
  critical: "border-chilli-200 bg-chilli-50",
  warning: "border-border bg-ink-50",
  info: "border-border bg-background",
};

function AlertRow({ alert }: { alert: WhatsappAlert }) {
  const [acknowledge, { isLoading }] = useAcknowledgeAlertMutation();
  const [error, setError] = useState<string | null>(null);
  const actionable = !alert.acknowledged && alert.severity !== "info";

  async function handleAcknowledge() {
    setError(null);
    try {
      await acknowledge(alert.id).unwrap();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't mark this as seen. Try again."));
    }
  }

  return (
    <li className={`rounded-lg border p-3 ${SEVERITY_TONE[alert.severity]} ${alert.acknowledged ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          label={alert.severity}
          tone={
            alert.severity === "critical"
              ? "bg-chilli-100 text-chilli-800"
              : alert.severity === "warning"
                ? "bg-ink-200 text-ink-800"
                : undefined
          }
        />
        <p className="min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]">{alert.title}</p>
      </div>
      {alert.detail && <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{alert.detail}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{formatDateTime(alert.createdAt)}</p>
        {actionable && (
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={isLoading}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
          >
            {isLoading ? "Saving…" : "Mark as seen"}
          </button>
        )}
        {alert.acknowledged && <p className="text-xs text-muted">Seen</p>}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
