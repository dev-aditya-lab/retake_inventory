"use client";

import { useGetHealthQuery } from "@/lib/redux/features/health/healthApi";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";

export default function DashboardPage() {
  const { data: user } = useGetMeQuery();
  const { data: health, error, isLoading } = useGetHealthQuery();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-foreground">Welcome{user ? `, ${user.name}` : ""}</h1>
      <p className="mt-1 text-sm text-muted">
        This is a temporary placeholder — the real dashboard (sales KPIs, low-stock alerts, recent
        invoices) lands in a later phase.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-foreground">Backend connectivity</h2>
        {isLoading && <p className="mt-2 text-sm text-muted">Checking…</p>}
        {error && <p className="mt-2 text-sm text-danger">Could not reach the backend.</p>}
        {health && (
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">MongoDB</dt>
              <dd className={health.dependencies.mongodb === "connected" ? "font-medium text-success" : "font-medium text-danger"}>
                {health.dependencies.mongodb}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Redis</dt>
              <dd className={health.dependencies.redis === "connected" ? "font-medium text-success" : "font-medium text-danger"}>
                {health.dependencies.redis}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
