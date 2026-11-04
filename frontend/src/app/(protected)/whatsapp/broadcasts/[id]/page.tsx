"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Play, Square, Trash2 } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { CountsRow, Progress, STATUS_STYLE } from "@/components/whatsapp/BroadcastParts";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDateTime } from "@/lib/format";
import {
  useCancelBroadcastMutation,
  useDeleteBroadcastMutation,
  useGetBroadcastQuery,
  useStartBroadcastMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import { formatWaId, lowerWords } from "@/lib/whatsapp";

const FILTERS = [
  { value: "", label: "Everyone" },
  { value: "failed", label: "Failed" },
  { value: "queued", label: "Waiting" },
  { value: "read", label: "Read" },
  { value: "delivered", label: "Delivered" },
];

const RECIPIENT_TONE: Record<string, string> = {
  read: "bg-leaf-100 text-leaf-800",
  delivered: "bg-leaf-100 text-leaf-800",
  sent: "bg-ink-100 text-ink-700",
  queued: "bg-amber-100 text-amber-900",
  failed: "bg-chilli-100 text-chilli-800",
};

/** One broadcast: live counts, who it went to and what happened to each message. Admin only. */
export default function BroadcastDetailPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can see broadcasts.">
      <Detail />
    </RequireRole>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useGetBroadcastQuery(
    { id, status: status || undefined, page },
    // Counts move while it is sending (and receipts keep arriving after).
    { pollingInterval: 4_000, skipPollingIfUnfocused: true },
  );
  const [start, { isLoading: starting }] = useStartBroadcastMutation();
  const [cancel, { isLoading: cancelling }] = useCancelBroadcastMutation();
  const [remove, { isLoading: deleting }] = useDeleteBroadcastMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(getApiErrorMessage(err, fallback));
    }
  }

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (isError || !data) {
    return (
      <div className="text-sm">
        <p className="text-danger">Couldn&apos;t load this broadcast.</p>
        <button type="button" onClick={() => refetch()} className="mt-1 font-medium text-primary">
          Try again
        </button>
      </div>
    );
  }

  const style = STATUS_STYLE[data.status];
  const audienceBits = [
    data.audience.allCustomers && "all saved customers",
    data.audience.customerTags.length > 0 && `customers labelled ${data.audience.customerTags.join(", ")}`,
    data.audience.labels.length > 0 && `chats labelled ${data.audience.labels.join(", ")}`,
    data.audience.numbers > 0 && `${data.audience.numbers} typed number${data.audience.numbers === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const { recipients } = data;
  const pages = Math.max(1, Math.ceil(recipients.total / recipients.limit));

  return (
    <div className="flex flex-col gap-4">
      <Link href="/whatsapp/broadcasts" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        <ArrowLeft size={16} aria-hidden /> All broadcasts
      </Link>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
              {data.name}
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${style.tone}`}>{style.label}</span>
            </h2>
            <p className="text-sm text-muted">
              Template {data.templateName} · {audienceBits.join(" · ") || "no audience"}
            </p>
            <p className="text-xs text-muted">
              {data.startedAt ? `Started ${formatDateTime(data.startedAt)}` : "Not started yet"}
              {data.completedAt ? ` · finished ${formatDateTime(data.completedAt)}` : ""}
              {data.optedOutSkipped > 0 ? ` · ${data.optedOutSkipped} left out (asked to stop)` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {data.status === "draft" && (
              <button
                type="button"
                disabled={starting}
                onClick={() => void run(() => start(id).unwrap(), "Couldn't start it. Try again.")}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                <Play size={16} aria-hidden /> Start sending
              </button>
            )}
            {(data.status === "sending" || data.status === "draft") && (
              <button
                type="button"
                disabled={cancelling}
                onClick={() => void run(() => cancel(id).unwrap(), "Couldn't cancel it. Try again.")}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
              >
                <Square size={15} aria-hidden /> {data.status === "sending" ? "Stop sending" : "Cancel"}
              </button>
            )}
            {data.status !== "sending" &&
              (confirmDelete ? (
                <span className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void run(async () => { await remove(id).unwrap(); router.replace("/whatsapp/broadcasts"); }, "Couldn't delete it. Try again.")}
                    className="rounded-md bg-danger px-3 py-2 font-medium text-white disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-border px-3 py-2 font-medium">
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted hover:bg-chilli-50 hover:text-danger"
                >
                  <Trash2 size={16} aria-hidden /> Delete
                </button>
              ))}
          </div>
        </div>

        {data.status === "failed" && data.error && (
          <p role="alert" className="rounded-md bg-chilli-50 p-3 text-sm text-chilli-800 [overflow-wrap:anywhere]">
            {data.error}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {data.status === "sending" && <Progress counts={data.counts} />}
        <CountsRow counts={data.counts} />
        {data.counts.queued > 0 && data.status !== "sending" && (
          <p className="text-xs text-muted">{data.counts.queued} {data.counts.queued === 1 ? "person was" : "people were"} never sent to.</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">People</h2>
          <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filter people">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={status === f.value}
                onClick={() => { setStatus(f.value); setPage(1); }}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${status === f.value ? "bg-leaf-100 text-leaf-800" : "bg-surface text-muted hover:bg-ink-100"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {recipients.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nobody here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/60">
            {recipients.items.map((r) => (
              <li key={r.waId} className="flex min-w-0 items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{r.name || formatWaId(r.waId)}</p>
                  <p className="truncate text-xs text-muted">{r.name ? formatWaId(r.waId) : ""}</p>
                  {r.error && <p className="text-xs text-danger [overflow-wrap:anywhere]">{r.error}</p>}
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${RECIPIENT_TONE[r.status] ?? "bg-ink-100 text-ink-700"}`}>
                  {r.status === "queued" ? "waiting" : lowerWords(r.status)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-border px-3 py-1.5 font-medium disabled:opacity-40">
              Previous
            </button>
            <span className="text-xs text-muted">
              Page {page} of {pages}
            </span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-border px-3 py-1.5 font-medium disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
