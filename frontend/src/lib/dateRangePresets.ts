import type { DateRangeInput } from "@/types/report";

export type PresetKey = "today" | "7d" | "30d" | "90d" | "mtd" | "all";

export const DATE_PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "Month to date" },
  { key: "all", label: "All time" },
];

/**
 * Ranges run to the END of today, not "now": a page re-computes this on every
 * render, and a to-the-millisecond `to` made every render a brand-new query —
 * the data refetched forever and never left "Loading…". End of day is stable
 * all day and still includes bills made later today.
 */
export function getPresetRange(preset: PresetKey): DateRangeInput {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const to = endOfToday.toISOString();

  const startOfDaysAgo = (daysAgo: number) => {
    const from = new Date(now);
    from.setDate(from.getDate() - daysAgo);
    from.setHours(0, 0, 0, 0);
    return from.toISOString();
  };

  switch (preset) {
    case "today":
      return { from: startOfDaysAgo(0), to };
    case "7d":
      return { from: startOfDaysAgo(6), to };
    case "30d":
      return { from: startOfDaysAgo(29), to };
    case "90d":
      return { from: startOfDaysAgo(89), to };
    case "mtd":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to };
    case "all":
      return {};
  }
}
