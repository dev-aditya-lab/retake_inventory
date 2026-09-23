"use client";

import Link from "next/link";
import { IndianRupee, Receipt, PackageX } from "lucide-react";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { useGetDashboardQuery } from "@/lib/redux/features/reports/reportsApi";
import { StatTile } from "@/components/dashboard/StatTile";
import { TrendChart } from "@/components/charts/TrendChart";
import { TopBarChart } from "@/components/charts/TopBarChart";

const currency = (n: number) => `₹${n.toFixed(2)}`;

export default function DashboardPage() {
  const { data: user } = useGetMeQuery();
  const { data: summary, isLoading, isError } = useGetDashboardQuery();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Welcome{user ? `, ${user.name}` : ""}</h1>

      {isLoading && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {isError && <p className="mt-6 text-sm text-danger">Could not load the dashboard.</p>}

      {summary && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Today's revenue" value={currency(summary.today.revenue)} icon={IndianRupee} />
            <StatTile label="Today's invoices" value={String(summary.today.invoiceCount)} icon={Receipt} />
            <Link href={`/products${summary.lowStockCount > 0 ? "?lowStockOnly=true" : ""}`}>
              <StatTile
                label="Low stock items"
                value={String(summary.lowStockCount)}
                icon={PackageX}
                tone={summary.lowStockCount > 0 ? "warning" : "default"}
              />
            </Link>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-medium text-foreground">Revenue — last 14 days</h2>
            <div className="mt-3">
              <TrendChart
                data={summary.revenueTrend.map((d) => ({ label: d.date, value: d.revenue }))}
                formatValue={currency}
                formatLabel={(label) => new Date(label).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-medium text-foreground">Top products (14 days)</h2>
              <div className="mt-3">
                {summary.topProducts.length === 0 ? (
                  <p className="text-sm text-muted">No sales yet.</p>
                ) : (
                  <TopBarChart
                    data={summary.topProducts.map((p) => ({
                      label: p.name,
                      value: p.revenue,
                      sublabel: `${p.quantity} sold`,
                    }))}
                    formatValue={currency}
                  />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">Recent invoices</h2>
                <Link href="/sales" className="text-xs font-medium text-primary hover:underline">
                  View all
                </Link>
              </div>
              {summary.recentInvoices.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No invoices yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col divide-y divide-border">
                  {summary.recentInvoices.map((inv) => (
                    <li key={inv.invoiceNumber}>
                      <Link
                        href={`/invoice/${inv.invoiceNumber}`}
                        target="_blank"
                        className="flex items-center justify-between gap-2 py-2 text-sm hover:opacity-70"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{inv.invoiceNumber}</p>
                          <p className="truncate text-xs text-muted">{inv.customerName}</p>
                        </div>
                        <p className="shrink-0 font-medium text-foreground">{currency(inv.grandTotal)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
