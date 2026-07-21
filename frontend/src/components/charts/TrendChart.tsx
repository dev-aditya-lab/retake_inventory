"use client";

import { useState, type PointerEvent } from "react";

export interface TrendPoint {
  label: string;
  value: number;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = { top: 16, right: 12, bottom: 8, left: 12 };

/**
 * Single-series line/area trend chart (revenue over time). One hue only — a
 * single series needs no legend, per the dataviz method. Hover shows a
 * crosshair + tooltip; every value is also reachable via the underlying data
 * (callers should keep a table view available where the story needs it).
 */
export function TrendChart({
  data,
  formatValue,
  formatLabel,
}: {
  data: TrendPoint[];
  formatValue: (v: number) => string;
  formatLabel: (l: string) => string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => ({
    x: PADDING.left + (data.length > 1 ? (i / (data.length - 1)) * plotWidth : plotWidth / 2),
    y: PADDING.top + plotHeight - (d.value / maxValue) * plotHeight,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath =
    points.length > 0 && firstPoint && lastPoint
      ? `${linePath} L ${lastPoint.x} ${PADDING.top + plotHeight} L ${firstPoint.x} ${PADDING.top + plotHeight} Z`
      : "";

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setHoverIndex(closest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  if (data.length === 0) {
    return <p className="text-sm text-muted">No data for this period.</p>;
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label="Trend chart"
      >
        <line
          x1={PADDING.left}
          y1={PADDING.top + plotHeight}
          x2={WIDTH - PADDING.right}
          y2={PADDING.top + plotHeight}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        {areaPath && <path d={areaPath} fill="var(--color-chilli-600)" fillOpacity={0.1} stroke="none" />}
        <path d={linePath} fill="none" stroke="var(--color-chilli-600)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hovered && (
          <>
            <line
              x1={hovered.x}
              y1={PADDING.top}
              x2={hovered.x}
              y2={PADDING.top + plotHeight}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill="var(--color-chilli-600)" stroke="white" strokeWidth={2} />
          </>
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md border border-border bg-background px-2 py-1 text-xs whitespace-nowrap shadow-sm"
          style={{ left: `${(hovered.x / WIDTH) * 100}%`, top: 0 }}
        >
          <p className="font-semibold text-foreground">{formatValue(hovered.value)}</p>
          <p className="text-muted">{formatLabel(hovered.label)}</p>
        </div>
      )}
    </div>
  );
}
