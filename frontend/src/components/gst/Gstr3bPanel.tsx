"use client";

import { Info } from "lucide-react";
import { useGetGstr1Query, type PeriodRange } from "@/lib/redux/features/gst/gstApi";
import { formatCurrency } from "@/lib/format";
import { GST_STATES } from "@/config/gst";

/**
 * GSTR-3B's sales figures for the period, laid out like the portal's tables.
 * They come from the same data as GSTR-1 — since July 2025 the portal fills
 * Table 3 from GSTR-1 and locks it, so these are for checking, not typing.
 */
export function Gstr3bPanel({ range }: { range: PeriodRange }) {
  const { data, isLoading, isError } = useGetGstr1Query(range);

  if (isLoading) return <p className="mt-4 text-sm text-muted">Working out GSTR-3B…</p>;
  if (isError || !data) return <p className="mt-4 text-sm text-danger">Could not load GSTR-3B figures.</p>;

  const out = data.gstr3b.outwardTaxable;

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm text-muted">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          The portal fills these in from your filed GSTR-1 and locks them — just check they match. Input tax credit (Table 4)
          comes from <span className="font-medium text-foreground">GSTR-2B</span> on the portal, which lists what your suppliers
          filed for your purchases; this app doesn&apos;t record purchases.
        </span>
      </p>

      <section className="rounded-lg border border-border bg-background">
        <h2 className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
          3.1 (a) Outward taxable supplies (other than zero rated, nil rated and exempted)
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 text-sm sm:grid-cols-5">
          <Figure label="Taxable value" value={out.taxableValue} />
          <Figure label="Integrated tax" value={out.igst} />
          <Figure label="Central tax" value={out.cgst} />
          <Figure label="State/UT tax" value={out.sgst} />
          <Figure label="Cess" value={out.cess} />
        </dl>
        <p className="border-t border-border px-3 py-2 text-xs text-muted">
          3.1 (b), (c), (d), (e): nil. Net of credit notes issued in the period.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-background">
        <h2 className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
          3.2 Inter-state supplies to unregistered persons
        </h2>
        {data.gstr3b.interStateUnregistered.length === 0 ? (
          <p className="p-3 text-sm text-muted">None this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Place of supply</th>
                <th className="px-3 py-2 text-right font-medium">Taxable value</th>
                <th className="px-3 py-2 text-right font-medium">Integrated tax</th>
              </tr>
            </thead>
            <tbody>
              {data.gstr3b.interStateUnregistered.map((row) => (
                <tr key={row.pos} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    {row.pos}-{GST_STATES[row.pos] ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.taxableValue)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.igst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-muted">Tax on sales for the period</p>
        <p className="text-2xl font-semibold text-foreground">{formatCurrency(data.gstr3b.totalTaxLiability)}</p>
        <p className="mt-1 text-xs text-muted">
          Table 6 (payment): this, minus the input tax credit the portal shows from GSTR-2B, is what you pay in cash.
        </p>
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium text-foreground">{formatCurrency(value)}</dd>
    </div>
  );
}
