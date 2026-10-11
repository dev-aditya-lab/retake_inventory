"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Receipt, Search, Wallet } from "lucide-react";
import { useListNonGstCustomersQuery } from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { RequireRole } from "@/components/auth/RequireRole";
import { ExportButtons } from "@/components/ExportButtons";
import { Pagination } from "@/components/ui/Pagination";
import { NonGstTabs } from "@/components/nonGst/NonGstTabs";
import { formatCurrency, formatDate } from "@/lib/format";
import type { NonGstCustomerSort } from "@/types/nonGstOverview";

const PAGE_SIZE = 20;

const SORT_OPTIONS: { value: NonGstCustomerSort; label: string }[] = [
  { value: "recent", label: "Latest buyers first" },
  { value: "spent", label: "Highest spenders" },
  { value: "due", label: "Owes the most" },
  { value: "bills", label: "Most bills" },
  { value: "name", label: "Name (A–Z)" },
];

export default function NonGstCustomersPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can see the non-GST customers.">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <CustomerList />
      </Suspense>
    </RequireRole>
  );
}

/**
 * Everyone who has a non-GST bill, worked out from the bills themselves (these
 * bills don't create entries in the main Customers directory). The same person
 * typed as "98765 43210" and "+91 9876543210" is counted once.
 */
function CustomerList() {
  const searchParams = useSearchParams();
  const isOnline = useOnlineStatus();

  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<NonGstCustomerSort>(searchParams.get("due") === "true" ? "due" : "recent");
  const [dueOnly, setDueOnly] = useState(searchParams.get("due") === "true");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const { data, isFetching, isLoading, isError, refetch } = useListNonGstCustomersQuery(
    { search: search || undefined, sort, due: dueOnly || undefined, page, limit: PAGE_SIZE },
    { skip: !isOnline },
  );

  const hasFilters = !!(searchInput || dueOnly);

  return (
    <div className="mx-auto max-w-4xl">
      <NonGstTabs
        title="Customers"
        description="Everyone who has bought without GST — what they've spent, and who still owes you money."
        actions={isOnline && <ExportButtons path="/api/non-gst-bills/customers/export" filenameBase="non-gst-customers" label="Export" />}
      />

      {data && data.totals.due > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span className="text-foreground">
            {dueOnly || search ? "These customers owe" : "Customers owe"}{" "}
            <span className="font-semibold">{formatCurrency(data.totals.due)}</span>
            {data.totals.overdue > 0 && (
              <span className="font-medium text-chilli-700"> · {formatCurrency(data.totals.overdue)} overdue</span>
            )}
          </span>
          {!dueOnly && (
            <button
              type="button"
              onClick={() => {
                setDueOnly(true);
                setSort("due");
                setPage(1);
              }}
              className="text-xs font-medium text-primary underline"
            >
              Show only those who owe
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative col-span-2 sm:col-span-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Name, phone or company…"
            aria-label="Search customers"
            className="input w-full pl-9"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as NonGstCustomerSort);
            setPage(1);
          }}
          aria-label="Sort by"
          className="input"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="col-span-2 flex items-center gap-2 text-sm text-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(e) => {
              setDueOnly(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4"
          />
          Only customers who owe money
        </label>
      </div>

      {!isOnline && (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          You&apos;re offline — this list needs a connection.
        </p>
      )}
      {isOnline && isLoading && <p className="mt-6 text-sm text-muted">Loading customers…</p>}
      {isOnline && isError && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <span className="text-danger">Could not load customers.</span>
          <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
            Try again
          </button>
        </div>
      )}
      {data && data.items.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          {hasFilters ? "No customers match." : "No customers yet — they appear here once a non-GST bill is made."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className={`mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 ${isFetching ? "opacity-60" : ""}`}>
          {data.items.map((customer) => {
            const billsHref = `/non-gst-bills/bills?customer=${encodeURIComponent(customer.key)}&name=${encodeURIComponent(customer.name)}`;
            return (
              <li key={customer.key} className="flex flex-col rounded-lg border border-border bg-background p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{customer.name}</p>
                  <p className="truncate text-sm text-muted">
                    {customer.phone || "No phone"}
                    {customer.company && ` · ${customer.company}`}
                  </p>
                </div>

                {customer.due > 0 && (
                  <Link
                    href={`${billsHref}&payment=due`}
                    className="mt-2 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-foreground">
                      Owes {formatCurrency(customer.due)}
                      {customer.overdue > 0 && (
                        <span className="text-chilli-700"> · {formatCurrency(customer.overdue)} overdue</span>
                      )}
                    </span>
                    <span className="text-xs font-medium text-primary underline">
                      {customer.dueBillCount} unpaid bill{customer.dueBillCount === 1 ? "" : "s"}
                    </span>
                  </Link>
                )}

                <dl className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-surface p-2 text-center">
                  <div>
                    <dt className="text-xs text-muted">Bills</dt>
                    <dd className="text-sm font-medium text-foreground">{customer.billCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Spent</dt>
                    <dd className="text-sm font-medium text-foreground">{formatCurrency(customer.totalSales)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Last bill</dt>
                    <dd className="text-sm font-medium text-foreground">{formatDate(customer.lastBillAt)}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={billsHref}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
                  >
                    <Receipt size={14} aria-hidden />
                    All bills
                  </Link>
                  {customer.due > 0 && (
                    <Link
                      href={`${billsHref}&payment=due`}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                    >
                      <Wallet size={14} aria-hidden />
                      Collect payment
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && <Pagination page={page} limit={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </div>
  );
}
