"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Receipt, Search, Trash2 } from "lucide-react";
import { useDeleteCustomerMutation, useListCustomersQuery } from "@/lib/redux/features/customers/customersApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { RequireRole } from "@/components/auth/RequireRole";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditCustomerDialog } from "@/components/customers/EditCustomerDialog";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Customer } from "@/types/customer";

const PAGE_SIZE = 20;

export default function CustomersPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can manage customers.">
      <CustomerDirectory />
    </RequireRole>
  );
}

function CustomerDirectory() {
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);
  const { data, isLoading, isFetching, isError, refetch } = useListCustomersQuery({
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
      <p className="mt-1 text-sm text-muted">
        Added automatically when a bill has a phone number. Most recent buyers first.
      </p>

      <div className="relative mt-4">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          placeholder="Name, phone, company or email…"
          aria-label="Search customers"
          className="input w-full pl-9"
        />
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted">Loading customers…</p>}
      {isError && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <span className="text-danger">Could not load customers.</span>
          <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
            Try again
          </button>
        </div>
      )}
      {data && data.items.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          {search ? "No customers match." : "No customers yet — they appear here after a bill with a phone number."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className={`mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 ${isFetching ? "opacity-60" : ""}`}>
          {data.items.map((customer) => (
            <li key={customer._id} className="flex flex-col rounded-lg border border-border bg-background p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{customer.name}</p>
                <p className="truncate text-sm text-muted">
                  {customer.phone}
                  {customer.company && ` · ${customer.company}`}
                </p>
                {customer.gstin && <p className="truncate text-xs text-muted">GSTIN {customer.gstin}</p>}
              </div>

              {(customer.dueAmount ?? 0) > 0 && (
                <Link
                  href={`/sales?customer=${customer._id}&name=${encodeURIComponent(customer.name)}&payment=due`}
                  className="mt-2 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">Owes {formatCurrency(customer.dueAmount ?? 0)}</span>
                  <span className="text-xs font-medium text-primary underline">See unpaid bills</span>
                </Link>
              )}

              <dl className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-surface p-2 text-center">
                <div>
                  <dt className="text-xs text-muted">Bills</dt>
                  <dd className="text-sm font-medium text-foreground">{customer.invoiceCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Spent</dt>
                  <dd className="text-sm font-medium text-foreground">{formatCurrency(customer.totalSpent)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Last visit</dt>
                  <dd className="text-sm font-medium text-foreground">
                    {customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/sales?customer=${customer._id}&name=${encodeURIComponent(customer.name)}`}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
                >
                  <Receipt size={14} aria-hidden />
                  Bills
                </Link>
                <button
                  type="button"
                  onClick={() => setEditing(customer)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
                >
                  <Pencil size={14} aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(customer)}
                  className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-danger hover:bg-chilli-50"
                >
                  <Trash2 size={14} aria-hidden />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && <Pagination page={page} limit={PAGE_SIZE} total={data.total} onPageChange={setPage} />}

      <EditCustomerDialog customer={editing} onClose={() => setEditing(null)} />
      <DeleteCustomerDialog customer={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function DeleteCustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const [deleteCustomer, { isLoading }] = useDeleteCustomerMutation();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!customer) return;
    setError(null);
    try {
      await deleteCustomer(customer._id).unwrap();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete the customer — try again."));
    }
  }

  return (
    <ConfirmDialog
      open={!!customer}
      title="Delete customer?"
      confirmLabel="Delete customer"
      pendingLabel="Deleting…"
      isLoading={isLoading}
      error={error}
      onConfirm={handleConfirm}
      onClose={close}
      message={
        customer && (
          <div className="flex flex-col gap-2">
            <p>
              <span className="font-medium">{customer.name}</span> · {customer.phone}
            </p>
            <p className="text-muted">
              Removes them from this list only. Their {customer.invoiceCount} past bill
              {customer.invoiceCount === 1 ? "" : "s"} stay as they are. If they buy again with this phone number,
              they&apos;ll be added back.
            </p>
          </div>
        )
      }
    />
  );
}
