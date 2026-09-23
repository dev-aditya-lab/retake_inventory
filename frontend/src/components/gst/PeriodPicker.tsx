"use client";

import { periodLabel, recentMonths, recentQuarters } from "@/lib/gstPeriods";
import type { PeriodRange } from "@/lib/redux/features/gst/gstApi";

export type Frequency = "monthly" | "quarterly";

/**
 * Picks the return period. Monthly filers pick a month; quarterly (QRMP)
 * filers pick an April-based quarter — the GSTR-1 then covers all three months.
 */
export function PeriodPicker({
  frequency,
  onFrequencyChange,
  range,
  onRangeChange,
}: {
  frequency: Frequency;
  onFrequencyChange: (frequency: Frequency) => void;
  range: PeriodRange;
  onRangeChange: (range: PeriodRange) => void;
}) {
  const months = recentMonths(15);
  const quarters = recentQuarters(6);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-border p-0.5 text-xs" role="group" aria-label="Filing frequency">
        {(["monthly", "quarterly"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={frequency === f}
            onClick={() => {
              onFrequencyChange(f);
              onRangeChange(f === "monthly" ? { from: months[1]! } : { from: quarters[0]!.from, to: quarters[0]!.to });
            }}
            className={`rounded px-3 py-1.5 font-medium ${frequency === f ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            {f === "monthly" ? "Monthly" : "Quarterly"}
          </button>
        ))}
      </div>

      {frequency === "monthly" ? (
        <select
          value={range.from}
          onChange={(e) => onRangeChange({ from: e.target.value })}
          aria-label="Return month"
          className="input"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {periodLabel(m)}
            </option>
          ))}
        </select>
      ) : (
        <select
          value={`${range.from}|${range.to}`}
          onChange={(e) => {
            const [from, to] = e.target.value.split("|");
            onRangeChange({ from: from!, to: to! });
          }}
          aria-label="Return quarter"
          className="input"
        >
          {quarters.map((q) => (
            <option key={q.from} value={`${q.from}|${q.to}`}>
              {q.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
