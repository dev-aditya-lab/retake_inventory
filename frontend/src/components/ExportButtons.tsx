"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { exportSpreadsheet, type SpreadsheetFormat } from "@/lib/exportFile";

export function ExportButtons({ path, filenameBase, label }: { path: string; filenameBase: string; label: string }) {
  const [pending, setPending] = useState<SpreadsheetFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: SpreadsheetFormat) {
    setPending(format);
    setError(null);
    try {
      await exportSpreadsheet(path, format, filenameBase);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">{label}</span>
      <button
        type="button"
        onClick={() => handleExport("csv")}
        disabled={pending !== null}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
      >
        <FileDown size={14} aria-hidden />
        {pending === "csv" ? "Exporting…" : "CSV"}
      </button>
      <button
        type="button"
        onClick={() => handleExport("xlsx")}
        disabled={pending !== null}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
      >
        <FileDown size={14} aria-hidden />
        {pending === "xlsx" ? "Exporting…" : "Excel"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
