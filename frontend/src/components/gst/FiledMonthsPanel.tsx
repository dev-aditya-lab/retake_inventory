"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, Unlock } from "lucide-react";
import { useGetGstReadinessQuery, useListGstFilingsQuery, useUnmarkGstFiledMutation } from "@/lib/redux/features/gst/gstApi";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDate } from "@/lib/format";
import { periodLabel } from "@/lib/gstPeriods";

/** Which months are filed (and so locked), with an undo for a mark set by mistake. */
export function FiledMonthsPanel() {
  const { data: readiness } = useGetGstReadinessQuery();
  const { data: filings, isLoading } = useListGstFilingsQuery();
  const [unmark, { isLoading: isUnmarking }] = useUnmarkGstFiledMutation();
  const [undoing, setUndoing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <p className="mt-4 text-sm text-muted">Loading…</p>;

  const filingByPeriod = new Map((filings ?? []).map((f) => [f.period, f]));
  const periods = [...new Set([...(readiness?.months.map((m) => m.period) ?? []), ...filingByPeriod.keys()])].sort().reverse();

  async function handleUndo() {
    if (!undoing) return;
    setError(null);
    try {
      await unmark(undoing).unwrap();
      setUndoing(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not undo — try again."));
    }
  }

  return (
    <div className="mt-4">
      {periods.length === 0 ? (
        <p className="text-sm text-muted">No GST bills yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
          {periods.map((period) => {
            const filing = filingByPeriod.get(period);
            const month = readiness?.months.find((m) => m.period === period);
            return (
              <li key={period} className="flex items-center gap-3 px-3 py-2.5">
                {filing ? (
                  <CheckCircle2 size={18} className="shrink-0 text-success" aria-label="Filed" />
                ) : (
                  <CircleDashed size={18} className="shrink-0 text-muted" aria-label="Not filed" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-foreground">
                    {periodLabel(period)}
                    {month?.isCurrent && <span className="ml-1.5 text-xs font-normal text-muted">(this month)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {month ? `${month.invoices} bill(s)` : "No bills"}
                    {filing && ` · filed ${formatDate(filing.filedAt)}${filing.filedBy?.name ? ` by ${filing.filedBy.name}` : ""}`}
                    {filing?.arn && ` · ARN ${filing.arn}`}
                  </p>
                </div>
                {filing && (
                  <button
                    type="button"
                    onClick={() => setUndoing(period)}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-ink-100"
                  >
                    <Unlock size={13} aria-hidden />
                    Undo
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!undoing}
        title={`Undo "filed" for ${undoing ? periodLabel(undoing) : ""}?`}
        confirmLabel="Undo"
        pendingLabel="Undoing…"
        isLoading={isUnmarking}
        error={error}
        onConfirm={handleUndo}
        onClose={() => {
          setError(null);
          setUndoing(null);
        }}
        message={
          <p>
            Only if it was marked by mistake and the GSTR-1 was <strong>not</strong> actually filed on the portal. Its bills unlock and
            can be edited again.
          </p>
        }
      />
    </div>
  );
}
