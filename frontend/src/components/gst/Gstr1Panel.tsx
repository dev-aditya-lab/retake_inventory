"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Lock, XCircle } from "lucide-react";
import { gstr1DownloadPath, useGetGstr1Query, useMarkGstFiledMutation, type PeriodRange } from "@/lib/redux/features/gst/gstApi";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { downloadBlob } from "@/lib/downloadFile";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency } from "@/lib/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Gstr1Report, GstIssue, SectionTotals } from "@/types/gst";

/** GSTR-1 for the chosen month/quarter: checks, section totals, the portal upload file, and "mark as filed". */
export function Gstr1Panel({ range }: { range: PeriodRange }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetGstr1Query(range);

  if (isLoading) return <p className="mt-4 text-sm text-muted">Preparing GSTR-1…</p>;
  if (isError || !data) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <span className="text-danger">Could not prepare GSTR-1.</span>
        <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
          Try again
        </button>
      </div>
    );
  }

  const errors = data.issues.filter((i) => i.level === "error");
  const warnings = data.issues.filter((i) => i.level === "warning");
  const allFiled = data.periods.every((p) => p.filed);
  const nothingToFile = data.counts.invoices === 0 && data.counts.creditNotes === 0 && data.counts.legacyInvoices === 0;

  return (
    <div className={`mt-4 flex flex-col gap-4 ${isFetching ? "opacity-70" : ""}`}>
      {allFiled && (
        <p className="flex items-center gap-2 rounded-lg border border-leaf-200 bg-leaf-50 p-3 text-sm text-foreground">
          <Lock size={16} className="text-success" aria-hidden />
          Marked as filed. Its bills are locked; returns now go through credit notes.
        </p>
      )}

      <IssueList errors={errors} warnings={warnings} />

      {nothingToFile ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          No bills in this period. You still file a GSTR-1 on the portal for it (a nil return) — select &ldquo;File Nil GSTR-1&rdquo;
          there.
        </p>
      ) : (
        <SectionSummary report={data} />
      )}

      {!nothingToFile && <DownloadAndFile range={range} report={data} blocked={errors.length > 0} allFiled={allFiled} />}
    </div>
  );
}

function IssueList({ errors, warnings }: { errors: GstIssue[]; warnings: GstIssue[] }) {
  if (errors.length === 0 && warnings.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-leaf-200 bg-leaf-50 p-3 text-sm text-foreground">
        <CheckCircle2 size={16} className="text-success" aria-hidden />
        All checks passed — the file is ready for the GST portal.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {[...errors, ...warnings].map((issue) => (
        <div
          key={issue.message}
          className={`rounded-lg border p-3 text-sm ${
            issue.level === "error" ? "border-chilli-200 bg-chilli-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          <p className="flex items-start gap-2 text-foreground">
            {issue.level === "error" ? (
              <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            )}
            <span>
              <span className="font-medium">{issue.level === "error" ? "Must fix: " : "Check: "}</span>
              {issue.message}
            </span>
          </p>
          {issue.documents && issue.documents.length > 0 && (
            <p className="mt-1 break-words pl-6 font-mono text-xs text-muted">
              {issue.documents.slice(0, 12).join(", ")}
              {issue.documents.length > 12 && ` and ${issue.documents.length - 12} more`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionSummary({ report }: { report: Gstr1Report }) {
  const { sections } = report.summary;
  const tax = (t: SectionTotals) => t.igst + t.cgst + t.sgst;
  const rows: { table: string; label: string; totals: SectionTotals; negative?: boolean }[] = [
    { table: "4A", label: "B2B — bills to GST-registered buyers", totals: sections.b2b },
    { table: "5", label: "B2CL — inter-state retail bills over ₹1 lakh", totals: sections.b2cl },
    { table: "7", label: "B2CS — other retail sales (summarised)", totals: sections.b2cs },
    { table: "7", label: "less: retail returns (credit notes)", totals: sections.b2csReturns, negative: true },
    { table: "9B", label: "CDNR — credit notes to registered buyers", totals: sections.cdnr, negative: true },
    { table: "9B", label: "CDNUR — credit notes on B2CL bills", totals: sections.cdnur, negative: true },
  ];

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 text-right font-medium">Docs</th>
              <th className="px-3 py-2 text-right font-medium">Taxable</th>
              <th className="px-3 py-2 text-right font-medium">Tax</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((row) => row.totals.count > 0)
              .map((row) => (
                <tr key={row.label} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-muted">{row.table}</td>
                  <td className="px-3 py-2 text-foreground">{row.label}</td>
                  <td className="px-3 py-2 text-right">{row.totals.count}</td>
                  <td className="px-3 py-2 text-right">
                    {row.negative ? "−" : ""}
                    {formatCurrency(row.totals.taxableValue)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.negative ? "−" : ""}
                    {formatCurrency(tax(row.totals))}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-2 border-t border-border p-3 text-xs text-muted sm:grid-cols-2">
        <p>
          Table 12 (HSN summary): {report.summary.hsnRows.b2b} B2B row(s), {report.summary.hsnRows.b2c} B2C row(s)
        </p>
        <p>
          Table 13 (documents): {report.summary.documentRanges.invoices.map((r) => `${r.from} → ${r.to}`).join("; ") || "—"}
          {report.summary.cancelledInvoices > 0 && ` · ${report.summary.cancelledInvoices} cancelled`}
        </p>
      </div>
    </section>
  );
}

function DownloadAndFile({
  range,
  report,
  blocked,
  allFiled,
}: {
  range: PeriodRange;
  report: Gstr1Report;
  blocked: boolean;
  allFiled: boolean;
}) {
  const [markFiled, { isLoading: isMarking }] = useMarkGstFiledMutation();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [arn, setArn] = useState("");
  const [markError, setMarkError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await authenticatedFetch(gstr1DownloadPath(range));
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "Download failed");
      }
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "GSTR1.json";
      downloadBlob(await res.blob(), name);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function handleMarkFiled() {
    setMarkError(null);
    try {
      await markFiled({ periods: report.periods.map((p) => p.period), arn: arn.trim() || undefined }).unwrap();
      setConfirmOpen(false);
      setArn("");
    } catch (err) {
      setMarkError(getApiErrorMessage(err, "Could not mark as filed — try again."));
    }
  }

  const periodText = report.periods.map((p) => p.label).join(", ");

  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">File on the GST portal</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground">
        <li>Download the file below.</li>
        <li>
          On <span className="font-medium">gst.gov.in</span>: Services → Returns → Returns Dashboard → pick {periodText} → GSTR-1 →{" "}
          <span className="font-medium">Prepare Offline</span> → Upload → choose the file.
        </li>
        <li>Wait for the upload to process (a few minutes), then open GSTR-1 → Generate Summary and check the totals match this page.</li>
        <li>File with EVC (OTP) or DSC. Then come back and press <span className="font-medium">Mark as filed</span>.</li>
      </ol>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleDownload}
          disabled={blocked || downloading}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Download size={16} aria-hidden />
          {downloading ? "Preparing…" : "Download file for GST portal"}
        </button>
        {!allFiled && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={blocked}
            className="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
          >
            <Lock size={16} aria-hidden />
            Mark as filed
          </button>
        )}
      </div>
      {blocked && <p className="mt-2 text-xs text-danger">Fix the &ldquo;Must fix&rdquo; items above first.</p>}
      {downloadError && <p className="mt-2 text-sm text-danger">{downloadError}</p>}

      <ConfirmDialog
        open={confirmOpen}
        title={`Mark ${periodText} as filed?`}
        confirmLabel="Mark as filed"
        pendingLabel="Saving…"
        isLoading={isMarking}
        error={markError}
        onConfirm={handleMarkFiled}
        onClose={() => {
          setMarkError(null);
          setConfirmOpen(false);
        }}
        message={
          <div className="flex flex-col gap-2">
            <p>Only do this after the GSTR-1 is filed on the portal.</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Bills in {periodText} lock — they can&apos;t be edited or deleted any more.</li>
              <li>Returns against them become credit notes, reported in the month they&apos;re issued.</li>
            </ul>
          </div>
        }
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          ARN from the portal (optional)
          <input value={arn} onChange={(e) => setArn(e.target.value)} maxLength={40} placeholder="e.g. AA2009260123456" className="input" />
        </label>
      </ConfirmDialog>
    </section>
  );
}
