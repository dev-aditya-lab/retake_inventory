"use client";

import { useState } from "react";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { NewBroadcastDialog } from "@/components/whatsapp/NewBroadcastDialog";
import { formatDateTime } from "@/lib/format";
import { useListBroadcastsQuery } from "@/lib/redux/features/whatsapp/whatsappApi";
import { CountsRow, Progress, STATUS_STYLE } from "@/components/whatsapp/BroadcastParts";
import type { Broadcast } from "@/types/whatsapp";

/** Templates sent to a group of customers, with how many arrived and were read. Admin only. */
export default function BroadcastsPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can send broadcasts.">
      <BroadcastList />
    </RequireRole>
  );
}

function BroadcastList() {
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError, refetch } = useListBroadcastsQuery(undefined, {
    // Keep the numbers moving while one is being sent.
    pollingInterval: 5_000,
    skipPollingIfUnfocused: true,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 basis-60 text-sm text-muted">
          Send an approved template to many customers at once. Messages go out one by one at a gentle pace, and you can watch them arrive.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          <Plus size={16} aria-hidden /> New broadcast
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && !data && (
        <div className="text-sm">
          <p className="text-danger">Couldn&apos;t load the broadcasts.</p>
          <button type="button" onClick={() => refetch()} className="mt-1 font-medium text-primary">
            Try again
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background p-8 text-center text-sm text-muted">
          <Megaphone size={28} aria-hidden />
          <p>No broadcasts yet. Create one to tell your customers about an offer or an update.</p>
        </div>
      )}

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data?.map((b) => (
          <BroadcastCard key={b.id} broadcast={b} />
        ))}
      </ul>

      <NewBroadcastDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function BroadcastCard({ broadcast }: { broadcast: Broadcast }) {
  const style = STATUS_STYLE[broadcast.status];
  return (
    <li>
      <Link href={`/whatsapp/broadcasts/${broadcast.id}`} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background p-4 hover:bg-ink-50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{broadcast.name}</p>
            <p className="truncate text-xs text-muted">
              {broadcast.templateName} · {broadcast.counts.total} {broadcast.counts.total === 1 ? "person" : "people"}
            </p>
          </div>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${style.tone}`}>{style.label}</span>
        </div>
        {broadcast.status === "sending" && <Progress counts={broadcast.counts} />}
        <CountsRow counts={broadcast.counts} />
        <p className="text-xs text-muted">{broadcast.createdAt ? formatDateTime(broadcast.createdAt) : ""}</p>
      </Link>
    </li>
  );
}
