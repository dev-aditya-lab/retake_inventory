"use client";

import { useState } from "react";

export interface BarRow {
  label: string;
  value: number;
  sublabel?: string;
}

/** Horizontal magnitude comparison (top N by revenue/quantity) — single hue, direct value label at the tip. */
export function TopBarChart({ data, formatValue }: { data: BarRow[]; formatValue: (v: number) => string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="flex flex-col gap-3">
      {data.map((row, i) => {
        const widthPct = Math.max((row.value / maxValue) * 100, 3);
        return (
          <li key={row.label}>
            <button
              type="button"
              className="w-full text-left"
              onPointerEnter={() => setHoverIndex(i)}
              onPointerLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{row.label}</span>
                <span className="shrink-0 font-medium text-foreground">{formatValue(row.value)}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-chilli-600" style={{ width: `${widthPct}%` }} />
              </div>
              {hoverIndex === i && row.sublabel && <p className="mt-0.5 text-[11px] text-muted">{row.sublabel}</p>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
