"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Lock, MessageCircle, Pencil, Search, Trash2, Undo2, X } from "lucide-react";
import { useListInvoicesQuery } from "@/lib/redux/features/invoices/invoicesApi";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { ExportButtons } from "@/components/ExportButtons";
import { Pagination } from "@/components/ui/Pagination";
import { SendWhatsappDialog } from "@/components/sales/SendWhatsappDialog";
import { CancelInvoiceDialog } from "@/components/sales/CancelInvoiceDialog";
import { ReturnItemsDialog } from "@/components/sales/ReturnItemsDialog";
import { formatCurrency, formatDateTime, localDayBoundaryIso } from "@/lib/format";
import { PAYMENT_METHODS } from "@/types/cart";
import type { InvoiceListItem, InvoiceStatus } from "@/types/invoice";

const PAGE_SIZE = 20;

const paymentLabel = (value: string) => PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;

export default function SalesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SalesList />
    </Suspense>
  );
}

function SalesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnline = useOnlineStatus();
  const { data: user } = useGetMeQuery();
  const isAdmin = user?.role === "admin";

  // "All bills for this customer" — linked from the Customers page.
  const customerId = searchParams.get("customer") ?? undefined;
  const customerName = searchParams.get("name");

  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const [whatsappFor, setWhatsappFor] = useState<InvoiceListItem | null>(null);
  const [cancelFor, setCancelFor] = useState<InvoiceListItem | null>(null);
  const [returnFor, setReturnFor] = useState<string | null>(null);

  const { data, isFetching, isLoading, isError, refetch } = useListInvoicesQuery(
    {
      search: search || undefined,
      status: status || undefined,
      customer: customerId,
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
          <h1 className="text-2xl font-semibold text-foreground">Sales</h1>
          <p className="mt-1 text-sm text-muted">Every bill, newest first.</p>
        </div>
        {isAdmin && isOnline && (
          <ExportButtons path="/api/invoices/export" filenameBase="invoices" label="Export" />
        )}
      </div>

      {customerId && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-leaf-200 bg-leaf-50 px-3 py-2 text-sm">
          <span className="text-foreground">
            Bills for <span className="font-medium">{customerName ?? "this customer"}</span>
          </span>
          <button
            type="button"
            onClick={() => router.replace("/sales")}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-leaf-100"
          >
            <X size={14} aria-hidden />
            Show all
          </button>
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
          onChange={(e) => withPageReset(setStatus)(e.target.value as InvoiceStatus | "")}
          aria-label="Status"
          className="input col-span-2 sm:col-span-1"
        >
          <option value="">All bills</option>
          <option value="paid">Paid</option>
          <option value="void">Cancelled</option>
          <option value="credited">Credited (reversed)</option>
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
          You&apos;re offline — the sales list needs a connection.
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
        <p className="mt-6 text-sm text-muted">{hasFilters || customerId ? "No bills match." : "No bills yet."}</p>
      )}

      {data && data.items.length > 0 && (
        <ul className={`mt-4 flex flex-col gap-2 ${isFetching ? "opacity-60" : ""}`}>
          {data.items.map((invoice) => (
            <SaleRow
              key={invoice._id}
              invoice={invoice}
              isAdmin={isAdmin}
              onWhatsapp={() => setWhatsappFor(invoice)}
              onCancel={() => setCancelFor(invoice)}
              onReturn={() => setReturnFor(invoice.invoiceNumber)}
            />
          ))}
        </ul>
      )}

      {data && <Pagination page={page} limit={PAGE_SIZE} total={data.total} onPageChange={setPage} />}

      <SendWhatsappDialog invoice={whatsappFor} onClose={() => setWhatsappFor(null)} />
      <CancelInvoiceDialog invoice={cancelFor} onClose={() => setCancelFor(null)} />
      <ReturnItemsDialog invoiceNumber={returnFor} onClose={() => setReturnFor(null)} />
    </div>
  );
}

function SaleRow({
  invoice,
  isAdmin,
  onWhatsapp,
  onCancel,
  onReturn,
}: {
  invoice: InvoiceListItem;
  isAdmin: boolean;
  onWhatsapp: () => void;
  onCancel: () => void;
  onReturn: () => void;
}) {
  const isCancelled = invoice.status === "void";
  const isCredited = invoice.status === "credited";
  const isClosed = isCancelled || isCredited;
  const partlyReturned = !isCredited && (invoice.creditedTotal ?? 0) > 0;
  // A filed month's bill can't be edited — only returned against via a credit note.
  const isGstBill = invoice.gstVersion === 2;

  return (
    <li className={`rounded-lg border border-border bg-background p-3 ${isCancelled ? "bg-surface" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
            <span className={isClosed ? "text-muted line-through" : ""}>{invoice.invoiceNumber}</span>
            {isCancelled && (
              <span className="rounded-full bg-chilli-100 px-2 py-0.5 text-xs font-medium text-chilli-700">Cancelled</span>
            )}
            {isCredited && (
              <span className="rounded-full bg-chilli-100 px-2 py-0.5 text-xs font-medium text-chilli-700">Credited</span>
            )}
            {partlyReturned && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Returned {formatCurrency(invoice.creditedTotal ?? 0)}
              </span>
            )}
            {!isClosed && invoice.editedAt && (
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">Edited</span>
            )}
            {(invoice.priceMode ? invoice.priceMode === "exclusive" : invoice.buyerType === "B2B") && (
              <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-xs font-medium text-leaf-700">B2B</span>
            )}
            {invoice.gstLocked && !isCancelled && (
              <span className="flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
                <Lock size={11} aria-hidden />
                GST filed
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {invoice.customer.name}
            {invoice.customer.phone && <span className="text-muted"> · {invoice.customer.phone}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatDateTime(invoice.billingDate)} · {invoice.itemCount} item{invoice.itemCount === 1 ? "" : "s"} ·{" "}
            {paymentLabel(invoice.paymentMethod)}
          </p>
          {isCancelled && invoice.cancelReason && (
            <p className="mt-0.5 text-xs text-muted">Reason: {invoice.cancelReason}</p>
          )}
        </div>
        <p className={`shrink-0 text-base font-semibold ${isClosed ? "text-muted line-through" : "text-foreground"}`}>
          {formatCurrency(invoice.grandTotal)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <Link
          href={`/invoice/${invoice.invoiceNumber}`}
          target="_blank"
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
        >
          <ExternalLink size={14} aria-hidden />
          View
        </Link>
        {!isClosed && (
          <button
            type="button"
            onClick={onWhatsapp}
            className="flex items-center gap-1.5 rounded-md border border-leaf-300 px-3 py-2 text-xs font-medium text-leaf-700 hover:bg-leaf-50"
          >
            <MessageCircle size={14} aria-hidden />
            {invoice.whatsappSentAt ? "Resend WhatsApp" : "Send WhatsApp"}
          </button>
        )}
        {isAdmin && !isClosed && (
          <>
            {invoice.gstLocked ? (
              isGstBill && (
                <button
                  type="button"
                  onClick={onReturn}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
                >
                  <Undo2 size={14} aria-hidden />
                  Return items
                </button>
              )
            ) : (
              <Link
                href={`/sales/${invoice.invoiceNumber}/edit`}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
              >
                <Pencil size={14} aria-hidden />
                Edit
              </Link>
            )}
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
