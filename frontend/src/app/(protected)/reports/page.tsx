"use client";

import { useState } from "react";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import {
  useGetSalesReportQuery,
  useGetProductWiseReportQuery,
  useGetUserWiseReportQuery,
} from "@/lib/redux/features/reports/reportsApi";
import { TrendChart } from "@/components/charts/TrendChart";
import type { DateRangeInput, SalesPeriod } from "@/types/report";

const currency = (n: number) => `₹${n.toFixed(2)}`;

type PresetKey = "today" | "7d" | "30d" | "90d" | "mtd" | "all";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "Month to date" },
  { key: "all", label: "All time" },
];

function getPresetRange(preset: PresetKey): DateRangeInput {
  const now = new Date();
  const to = now.toISOString();

  switch (preset) {
    case "today": {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from: from.toISOString(), to };
    }
    case "7d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      return { from: from.toISOString(), to };
    }
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      return { from: from.toISOString(), to };
    }
    case "90d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 89);
      from.setHours(0, 0, 0, 0);
      return { from: from.toISOString(), to };
    }
    case "mtd": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: from.toISOString(), to };
    }
    case "all":
      return {};
  }
}

export default function ReportsPage() {
  const { data: currentUser } = useGetMeQuery();
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [period, setPeriod] = useState<SalesPeriod>("daily");
  const range = getPresetRange(preset);

  const { data: sales, isLoading: isLoadingSales } = useGetSalesReportQuery({ period, ...range });
  const { data: products, isLoading: isLoadingProducts } = useGetProductWiseReportQuery(range);
  const { data: users, isLoading: isLoadingUsers } = useGetUserWiseReportQuery(range);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        Only admins can view reports.
      </div>
    );
  }

  const totalRevenue = sales?.reduce((sum, s) => sum + s.revenue, 0) ?? 0;
  const totalInvoices = sales?.reduce((sum, s) => sum + s.invoiceCount, 0) ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Reports</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              preset === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-ink-100"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Sales trend</h2>
          <div className="flex gap-1">
            {(["daily", "monthly", "yearly"] as SalesPeriod[]).map((p) => (
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

        {isLoadingSales ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : (
          <>
            <div className="mt-3 flex gap-6 text-sm">
              <div>
                <p className="text-muted">Total revenue</p>
                <p className="text-lg font-semibold text-foreground">{currency(totalRevenue)}</p>
              </div>
              <div>
                <p className="text-muted">Total invoices</p>
                <p className="text-lg font-semibold text-foreground">{totalInvoices}</p>
              </div>
            </div>
            <div className="mt-3">
              <TrendChart
                data={(sales ?? []).map((s) => ({ label: s.period, value: s.revenue }))}
                formatValue={currency}
                formatLabel={(l) => l}
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">Product-wise sales</h2>
          {isLoadingProducts ? (
            <p className="mt-3 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="py-1.5 pr-2 font-medium">Product</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                    <th className="py-1.5 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {!products || products.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-3 text-sm text-muted">
                        No sales in this period.
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => (
                      <tr key={p.name} className="border-b border-border">
                        <td className="py-1.5 pr-2 text-foreground">{p.name}</td>
                        <td className="py-1.5 pr-2 text-right text-foreground">{p.quantity}</td>
                        <td className="py-1.5 text-right font-medium text-foreground">{currency(p.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">Staff-wise sales</h2>
          {isLoadingUsers ? (
            <p className="mt-3 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="py-1.5 pr-2 font-medium">Staff</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Invoices</th>
                    <th className="py-1.5 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {!users || users.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-3 text-sm text-muted">
                        No sales in this period.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.userId} className="border-b border-border">
                        <td className="py-1.5 pr-2 text-foreground">{u.name}</td>
                        <td className="py-1.5 pr-2 text-right text-foreground">{u.invoiceCount}</td>
                        <td className="py-1.5 text-right font-medium text-foreground">{currency(u.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
