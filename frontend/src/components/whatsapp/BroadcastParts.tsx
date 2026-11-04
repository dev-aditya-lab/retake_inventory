import type { Broadcast, BroadcastStatus } from "@/types/whatsapp";

export const STATUS_STYLE: Record<BroadcastStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-ink-100 text-ink-700" },
  sending: { label: "Sending", tone: "bg-amber-100 text-amber-900" },
  completed: { label: "Done", tone: "bg-leaf-100 text-leaf-800" },
  cancelled: { label: "Cancelled", tone: "bg-ink-200 text-ink-800" },
  failed: { label: "Stopped", tone: "bg-chilli-100 text-chilli-800" },
};

export function Progress({ counts }: { counts: Broadcast["counts"] }) {
  const done = counts.sent + counts.failed;
  const pct = counts.total ? Math.round((done / counts.total) * 100) : 0;
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Sending progress">
        <div className="h-full rounded-full bg-leaf-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {done} of {counts.total} processed
      </p>
    </div>
  );
}

export function CountsRow({ counts }: { counts: Broadcast["counts"] }) {
  const cells: [string, number][] = [
    ["Sent", counts.sent],
    ["Delivered", counts.delivered],
    ["Read", counts.read],
    ["Failed", counts.failed],
  ];
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
      {cells.map(([label, n]) => (
        <div key={label} className="rounded-md bg-surface px-1 py-1.5">
          <dt className="text-[11px] text-muted">{label}</dt>
          <dd className={`text-sm font-semibold ${label === "Failed" && n > 0 ? "text-danger" : "text-foreground"}`}>{n}</dd>
        </div>
      ))}
    </dl>
  );
}

