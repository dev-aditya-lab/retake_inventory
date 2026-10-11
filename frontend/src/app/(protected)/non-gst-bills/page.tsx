"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, Clock, FileText, IndianRupee, Package, Plus, TrendingUp, Wallet } from "lucide-react";
import { useGetNonGstOverviewQuery } from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { RequireRole } from "@/components/auth/RequireRole";
import { NonGstTabs } from "@/components/nonGst/NonGstTabs";
import { StatTile } from "@/components/dashboard/StatTile";
import { TrendChart } from "@/components/charts/TrendChart";
import { TopBarChart } from "@/components/charts/TopBarChart";
import { DATE_PRESETS, getPresetRange, type PresetKey } from "@/lib/dateRangePresets";
import { formatCurrency, formatDate, localDayBoundaryIso } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/types/payment";
import type { PaymentMethod } from "@/types/cart";
import type { NonGstCustomer, NonGstTrendPeriod } from "@/types/nonGstOverview";

type RangeChoice = PresetKey | "custom";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-05" → "5 Oct 2026", "2026-10" → "Oct 2026". */
function formatPeriodLabel(period: string): string {
  const [year, month, day] = period.split("-");
  const monthName = MONTHS[Number(month) - 1] ?? month;
  return day ? `${Number(day)} ${monthName} ${year}` : `${monthName} ${year}`;
}

const billsLink = (customer: NonGstCustomer, extra = "") =>
  `/non-gst-bills/bills?customer=${encodeURIComponent(customer.key)}&name=${encodeURIComponent(customer.name)}${extra}`;

export default function NonGstOverviewPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can see the non-GST sales.">
      <Overview />
    </RequireRole>
  );
}

/**
 * Analysis of the bills made without GST. These bills are kept out of the
 * Dashboard, Reports and GST returns on purpose, so this is the one place to
 * see how that side of the business is doing.
 */
function Overview() {
  const isOnline = useOnlineStatus();
  const [choice, setChoice] = useState<RangeChoice>("30d");
  const [period, setPeriod] = useState<NonGstTrendPeriod>("daily");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => {
    if (choice === "custom") {
      return {
        from: customFrom ? localDayBoundaryIso(customFrom, "start") : undefined,
        to: customTo ? localDayBoundaryIso(customTo, "end") : undefined,
      };
    }
    return getPresetRange(choice);
  }, [choice, customFrom, customTo]);

  const { data, isLoading, isFetching, isError, refetch } = useGetNonGstOverviewQuery({ period, ...range }, { skip: !isOnline });

  const summary = data?.summary;
  const hasSales = (summary?.billCount ?? 0) > 0;
  const rangeLabel = DATE_PRESETS.find((p) => p.key === choice)?.label.toLowerCase() ?? "the chosen dates";

  return (
    <div className="mx-auto max-w-4xl">
      <NonGstTabs
        title="Overview"
        description="How the bills made without GST are doing. These are kept out of the Dashboard, Reports and GST returns."
        actions={
          <Link
            href="/billing"
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus size={16} aria-hidden />
            New bill
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => setChoice(preset.key)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              choice === preset.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-ink-100"
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setChoice("custom")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
            choice === "custom" ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-ink-100"
          }`}
        >
          Pick dates
        </button>
      </div>

      {choice === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            aria-label="From date"
            className="input"
          />
          <span className="text-muted">to</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            aria-label="To date"
            className="input"
          />
        </div>
      )}

      {!isOnline && (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          You&apos;re offline — this needs a connection.
        </p>
      )}
      {isOnline && isLoading && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {isOnline && isError && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <span className="text-danger">Could not load the numbers.</span>
          <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
            Try again
          </button>
        </div>
      )}

      {data && summary && (
        <div className={isFetching ? "opacity-60" : ""}>
          {data.dues.dueCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
              <span className="text-foreground">
                <span className="font-semibold">{formatCurrency(data.dues.dueAmount)}</span> still to collect from {data.dues.dueCount}{" "}
                bill{data.dues.dueCount === 1 ? "" : "s"}
                {data.dues.overdueCount > 0 && (
                  <span className="font-medium text-chilli-700">
                    {" "}
                    · {formatCurrency(data.dues.overdueAmount)} overdue ({data.dues.overdueCount})
                  </span>
                )}
              </span>
              <span className="flex gap-3 text-xs font-medium">
                <Link href="/non-gst-bills/bills?payment=due" className="text-primary underline">
                  Show what&apos;s due
                </Link>
                {data.dues.overdueCount > 0 && (
                  <Link href="/non-gst-bills/bills?payment=overdue" className="text-primary underline">
                    Show overdue
                  </Link>
                )}
              </span>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Sales" value={formatCurrency(summary.amount)} icon={IndianRupee} />
            <StatTile label="Bills" value={String(summary.billCount)} icon={FileText} />
            <StatTile label="Average bill" value={formatCurrency(summary.averageBill)} icon={TrendingUp} />
            <StatTile label="Units sold" value={String(summary.unitsSold)} icon={Package} />
            <StatTile label="Money received" value={formatCurrency(summary.collected)} icon={Banknote} />
            <StatTile
              label="Still to collect"
              value={formatCurrency(summary.outstanding)}
              icon={Wallet}
              tone={summary.outstanding > 0 ? "warning" : "default"}
            />
          </div>
          {summary.cancelledCount > 0 && (
            <p className="mt-2 text-xs text-muted">
              Not counted: {summary.cancelledCount} cancelled bill{summary.cancelledCount === 1 ? "" : "s"} (
              {formatCurrency(summary.cancelledAmount)}).
            </p>
          )}

          {!hasSales ? (
            <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
              No non-GST bills in {rangeLabel}. On the Billing screen, untick “GST applicable” to make one.
            </p>
          ) : (
            <>
              <section className="mt-4 rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground">Sales over time</h2>
                  <div className="flex gap-1">
                    {(["daily", "monthly"] as NonGstTrendPeriod[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${
                          period === p ? "bg-primary text-primary-foreground" : "text-muted hover:bg-ink-100"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <TrendChart
                    data={data.trend.map((row) => ({ label: row.period, value: row.amount }))}
                    formatValue={formatCurrency}
                    formatLabel={formatPeriodLabel}
                  />
                </div>
              </section>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-border bg-surface p-4">
                  <h2 className="text-sm font-medium text-foreground">Top products</h2>
                  <div className="mt-3">
                    <TopBarChart
                      data={data.topProducts.map((p) => ({
                        label: p.name,
                        value: p.revenue,
                        sublabel: `${p.quantity} unit${p.quantity === 1 ? "" : "s"} sold`,
                      }))}
                      formatValue={formatCurrency}
                    />
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-surface p-4">
                  <h2 className="text-sm font-medium text-foreground">Top customers</h2>
                  <ul className="mt-3 flex flex-col divide-y divide-border">
                    {data.topCustomers.map((customer) => (
                      <li key={customer.key}>
                        <Link href={billsLink(customer)} className="flex items-center justify-between gap-3 py-2 hover:bg-ink-100">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{customer.name}</span>
                            <span className="block truncate text-xs text-muted">
                              {customer.billCount} bill{customer.billCount === 1 ? "" : "s"}
                              {customer.phone && ` · ${customer.phone}`}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-foreground">{formatCurrency(customer.totalSales)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-lg border border-border bg-surface p-4">
                  <h2 className="text-sm font-medium text-foreground">B2B price vs retail</h2>
                  <div className="mt-3">
                    <TopBarChart
                      data={data.priceLists.map((row) => ({
                        label: row.priceList === "b2b" ? "B2B price" : "Retail (MRP)",
                        value: row.amount,
                        sublabel: `${row.billCount} bill${row.billCount === 1 ? "" : "s"}`,
                      }))}
                      formatValue={formatCurrency}
                    />
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-surface p-4">
                  <h2 className="text-sm font-medium text-foreground">How it was paid</h2>
                  <div className="mt-3">
                    {data.paymentMethods.length === 0 ? (
                      <p className="text-sm text-muted">No money received on these bills yet.</p>
                    ) : (
                      <TopBarChart
                        data={data.paymentMethods.map((row) => ({
                          label: PAYMENT_METHOD_LABELS[row.method as PaymentMethod] ?? row.method,
                          value: row.amount,
                        }))}
                        formatValue={formatCurrency}
                      />
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

          {data.topDebtors.length > 0 && (
            <section className="mt-4 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Clock size={16} className="text-muted" aria-hidden />
                  Who owes you
                </h2>
                <Link href="/non-gst-bills/customers?due=true" className="text-xs font-medium text-primary underline">
                  See all
                </Link>
              </div>
              <ul className="mt-2 flex flex-col divide-y divide-border">
                {data.topDebtors.map((customer) => (
                  <li key={customer.key}>
                    <Link
                      href={billsLink(customer, "&payment=due")}
                      className="flex items-center justify-between gap-3 py-2 hover:bg-ink-100"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{customer.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {customer.dueBillCount} unpaid bill{customer.dueBillCount === 1 ? "" : "s"} · last bill{" "}
                          {formatDate(customer.lastBillAt)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-foreground">{formatCurrency(customer.due)}</span>
                        {customer.overdue > 0 && (
                          <span className="block text-xs font-medium text-chilli-700">{formatCurrency(customer.overdue)} overdue</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
