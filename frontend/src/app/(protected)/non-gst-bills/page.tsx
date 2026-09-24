"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, MessageCircle, Pencil, Search, Trash2 } from "lucide-react";
import { useListNonGstBillsQuery } from "@/lib/redux/features/nonGstBills/nonGstBillsApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { RequireRole } from "@/components/auth/RequireRole";
import { ExportButtons } from "@/components/ExportButtons";
import { Pagination } from "@/components/ui/Pagination";
import { SendWhatsappDialog } from "@/components/sales/SendWhatsappDialog";
import { CancelNonGstBillDialog } from "@/components/sales/CancelNonGstBillDialog";
import { formatCurrency, formatDateTime, localDayBoundaryIso } from "@/lib/format";
import { PAYMENT_METHODS } from "@/types/cart";
import type { NonGstBillListItem, NonGstBillStatus } from "@/types/nonGstBill";

const PAGE_SIZE = 20;

const paymentLabel = (value: string) => PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;

export default function NonGstBillsPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can see the non-GST bills.">
      <NonGstBillsList />
    </RequireRole>
  );
}

/**
 * Bills made with "GST applicable" unticked. A section of its own: these have
 * their own bill numbers and never appear in Sales, the GST page, GST returns
 * or the reports.
 */
function NonGstBillsList() {
  const isOnline = useOnlineStatus();

  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<NonGstBillStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const [whatsappFor, setWhatsappFor] = useState<NonGstBillListItem | null>(null);
  const [cancelFor, setCancelFor] = useState<NonGstBillListItem | null>(null);

  const { data, isFetching, isLoading, isError, refetch } = useListNonGstBillsQuery(
    {
      search: search || undefined,
      status: status || undefined,
      from: from ? localDayBoundaryIso(from, "start") : undefined,
      to: to ? localDayBoundaryIso(to, "end") : undefined,
      page,
      limit: PAGE_SIZE,
    },
    { skip: !isOnline },
  );

  // Any filter change starts again from page 1.
  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const hasFilters = !!(searchInput || status || from || to);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Non-GST bills</h1>
          <p className="mt-1 text-sm text-muted">
            Bills made without GST, newest first. They have their own bill numbers and are kept out of the GST returns and
            reports.
          </p>
        </div>
        {isOnline && <ExportButtons path="/api/non-gst-bills/export" filenameBase="non-gst-bills" label="Export" />}
      </div>

      {data && (
        <div className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-muted">{hasFilters ? "Matching bills" : "All bills"}: </span>
          <span className="font-semibold text-foreground">{formatCurrency(data.totals.amount)}</span>
          <span className="text-muted">
            {" "}
            across {data.totals.count} bill{data.totals.count === 1 ? "" : "s"} (cancelled ones not counted)
          </span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative col-span-2 sm:col-span-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => withPageReset(setSearchInput)(e.target.value)}
            placeholder="Bill no., customer name or phone…"
            aria-label="Search bills"
            className="input w-full pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => withPageReset(setStatus)(e.target.value as NonGstBillStatus | "")}
          aria-label="Status"
          className="input col-span-2 sm:col-span-1"
        >
          <option value="">All bills</option>
          <option value="paid">Paid</option>
          <option value="void">Cancelled</option>
        </select>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => withPageReset(setFrom)(e.target.value)}
          aria-label="From date"
          className="input"
        />
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => withPageReset(setTo)(e.target.value)}
          aria-label="To date"
          className="input"
        />
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearchInput("");
            setStatus("");
            setFrom("");
            setTo("");
            setPage(1);
          }}
          className="mt-2 text-xs font-medium text-muted underline"
        >
          Clear filters
        </button>
      )}

      {!isOnline && (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          You&apos;re offline — this list needs a connection.
        </p>
      )}
      {isOnline && isLoading && <p className="mt-6 text-sm text-muted">Loading bills…</p>}
      {isOnline && isError && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <span className="text-danger">Could not load bills.</span>
          <button type="button" onClick={() => refetch()} className="font-medium text-primary underline">
            Try again
          </button>
        </div>
      )}
      {data && data.items.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          {hasFilters
            ? "No bills match."
            : "No non-GST bills yet. On the Billing screen, untick “GST applicable” to make one."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className={`mt-4 flex flex-col gap-2 ${isFetching ? "opacity-60" : ""}`}>
          {data.items.map((bill) => (
            <BillRow key={bill._id} bill={bill} onWhatsapp={() => setWhatsappFor(bill)} onCancel={() => setCancelFor(bill)} />
          ))}
        </ul>
      )}

      {data && <Pagination page={page} limit={PAGE_SIZE} total={data.total} onPageChange={setPage} />}

      <SendWhatsappDialog
        kind="non_gst"
        invoice={whatsappFor && { ...whatsappFor, invoiceNumber: whatsappFor.billNumber }}
        onClose={() => setWhatsappFor(null)}
      />
      <CancelNonGstBillDialog bill={cancelFor} onClose={() => setCancelFor(null)} />
    </div>
  );
}

function BillRow({
  bill,
  onWhatsapp,
  onCancel,
}: {
  bill: NonGstBillListItem;
  onWhatsapp: () => void;
  onCancel: () => void;
}) {
  const isCancelled = bill.status === "void";

  return (
    <li className={`rounded-lg border border-border bg-background p-3 ${isCancelled ? "bg-surface" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
            <span className={isCancelled ? "text-muted line-through" : ""}>{bill.billNumber}</span>
            {isCancelled && (
              <span className="rounded-full bg-chilli-100 px-2 py-0.5 text-xs font-medium text-chilli-700">Cancelled</span>
            )}
            {!isCancelled && bill.editedAt && (
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">Edited</span>
            )}
            {bill.priceList === "b2b" && (
              <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-xs font-medium text-leaf-700">B2B</span>
            )}
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {bill.customer.name}
            {bill.customer.phone && <span className="text-muted"> · {bill.customer.phone}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatDateTime(bill.billingDate)} · {bill.itemCount} item{bill.itemCount === 1 ? "" : "s"} ·{" "}
            {paymentLabel(bill.paymentMethod)}
          </p>
          {isCancelled && bill.cancelReason && <p className="mt-0.5 text-xs text-muted">Reason: {bill.cancelReason}</p>}
        </div>
        <p className={`shrink-0 text-base font-semibold ${isCancelled ? "text-muted line-through" : "text-foreground"}`}>
          {formatCurrency(bill.grandTotal)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <Link
          href={`/invoice/${bill.billNumber}`}
          target="_blank"
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
        >
          <ExternalLink size={14} aria-hidden />
          View
        </Link>
        {!isCancelled && (
          <>
            <button
              type="button"
              onClick={onWhatsapp}
              className="flex items-center gap-1.5 rounded-md border border-leaf-300 px-3 py-2 text-xs font-medium text-leaf-700 hover:bg-leaf-50"
            >
              <MessageCircle size={14} aria-hidden />
              {bill.whatsappSentAt ? "Resend WhatsApp" : "Send WhatsApp"}
            </button>
            <Link
              href={`/non-gst-bills/${bill.billNumber}/edit`}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
            >
              <Pencil size={14} aria-hidden />
              Edit
            </Link>
            <button
              type="button"
              onClick={onCancel}
              className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-danger hover:bg-chilli-50"
            >
              <Trash2 size={14} aria-hidden />
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}
