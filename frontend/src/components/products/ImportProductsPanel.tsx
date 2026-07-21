"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { productsApi } from "@/lib/redux/features/products/productsApi";
import { useAppDispatch } from "@/lib/redux/hooks";

interface ImportRowResult {
  row: number;
  sku: string;
  status: "updated" | "would-update" | "unchanged" | "error";
  changes: Record<string, { from: unknown; to: unknown }>;
  error?: string;
}

const STATUS_STYLES: Record<ImportRowResult["status"], string> = {
  "would-update": "bg-chilli-100 text-chilli-700",
  updated: "bg-leaf-100 text-leaf-700",
  unchanged: "bg-ink-100 text-muted",
  error: "bg-danger/10 text-danger",
};

function formatChanges(changes: ImportRowResult["changes"]): string {
  const entries = Object.entries(changes);
  if (entries.length === 0) return "—";
  return entries.map(([field, { from, to }]) => `${field}: ${String(from)} → ${String(to)}`).join(", ");
}

async function runImport(file: File, dryRun: boolean): Promise<ImportRowResult[]> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authenticatedFetch(`/api/products/import?dryRun=${dryRun}`, { method: "POST", body: formData });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? "Import failed");
  return body.data.results as ImportRowResult[];
}

export function ImportProductsPanel({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [committed, setCommitted] = useState(false);
  const [phase, setPhase] = useState<"idle" | "previewing" | "committing">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(selected: File | null) {
    setFile(selected);
    setResults(null);
    setCommitted(false);
    setError(null);
    if (!selected) return;

    setPhase("previewing");
    try {
      setResults(await runImport(selected, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPhase("idle");
    }
  }

  async function handleCommit() {
    if (!file) return;
    setPhase("committing");
    setError(null);
    try {
      setResults(await runImport(file, false));
      setCommitted(true);
      dispatch(productsApi.util.invalidateTags([{ type: "Product", id: "LIST" }]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPhase("idle");
    }
  }

  const changeCount = results?.filter((r) => r.status === "would-update" || r.status === "updated").length ?? 0;
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Import products</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-ink-100">
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className="mt-2 text-xs text-muted">
          Upload a CSV or Excel file with a <span className="font-medium">sku</span> column plus any of costPrice,
          sellingPrice, hsnCode, lowStockThreshold, note, isActive, quantityInStock. Rows are matched by SKU — new
          products are never created from an import.
        </p>

        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted hover:border-primary">
          <Upload size={16} aria-hidden />
          {file ? file.name : "Choose a CSV or XLSX file"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </label>

        {phase === "previewing" && <p className="mt-3 text-sm text-muted">Checking file…</p>}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {results && (
          <>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted">
                {committed
                  ? `Committed ${changeCount} change${changeCount === 1 ? "" : "s"}.`
                  : `${changeCount} row${changeCount === 1 ? "" : "s"} would change.`}
                {errorCount > 0 && ` ${errorCount} row${errorCount === 1 ? "" : "s"} with errors.`}
              </p>
            </div>

            <div className="mt-2 max-h-80 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-muted">
                    <th className="py-1.5 pl-2 font-medium">Row</th>
                    <th className="py-1.5 font-medium">SKU</th>
                    <th className="py-1.5 font-medium">Status</th>
                    <th className="py-1.5 pr-2 font-medium">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.row} className="border-b border-border last:border-0">
                      <td className="py-1.5 pl-2 text-foreground">{r.row}</td>
                      <td className="py-1.5 text-foreground">{r.sku || "—"}</td>
                      <td className="py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-foreground">{r.error ?? formatChanges(r.changes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!committed && changeCount > 0 && (
              <button
                type="button"
                onClick={handleCommit}
                disabled={phase === "committing"}
                className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {phase === "committing" ? "Committing…" : `Commit ${changeCount} change${changeCount === 1 ? "" : "s"}`}
              </button>
            )}

            {committed && (
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Done
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
