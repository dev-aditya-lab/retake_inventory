import { apiSlice, unwrap } from "../../apiSlice";
import type { Invoice, InvoiceCustomer, InvoiceListItem, InvoiceStatus } from "@/types/invoice";
import type { CreditNote } from "@/types/creditNote";
import type { PaymentMethod } from "@/types/cart";
import type { Paginated } from "@/types/pagination";
import type { DueSummary, PaymentFilter } from "@/types/payment";

export interface InvoiceListFilters {
  search?: string;
  status?: InvoiceStatus;
  /** Only bills in this payment state (still owing, overdue, settled…). */
  payment?: PaymentFilter;
  /** Customer directory id — "all bills for this customer". */
  customer?: string;
  /** ISO datetimes (start/end of the chosen local days). */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** A page of invoices, plus the money still to collect across ALL of them (not just this page). */
export interface InvoicePage extends Paginated<InvoiceListItem> {
  dues: DueSummary;
}

/** A payment (advance, part-payment, the rest) or a refund to record against a bill. */
export interface RecordPaymentInput {
  amount: number;
  method: PaymentMethod;
  kind?: "payment" | "refund";
  /** ISO datetime the money changed hands; left out = now. */
  receivedAt?: string;
  note?: string;
}

export interface UpdateInvoiceInput {
  invoiceNumber: string;
  /** stateCode: place of supply (blank = from the GSTIN, or the shop's state). */
  customer: InvoiceCustomer & { stateCode?: string };
  /** The price list unitPrice is from: "exclusive" = B2B price excl. GST, "inclusive" = the MRP. */
  priceMode: "exclusive" | "inclusive";
  items: { product: string; quantity: number; unitPrice: number }[];
  otherCharges: number;
  note?: string;
}

function toQueryString(filters: InvoiceListFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// Editing or cancelling a bill moves stock and changes revenue and GST, so it
// refreshes products, reports, customer totals and GST returns as well.
const saleSideEffectTags = [
  { type: "Invoice" as const, id: "LIST" },
  { type: "Product" as const, id: "LIST" },
  "Report" as const,
  "Customer" as const,
  "Gst" as const,
  "CreditNote" as const,
];

// Recording a payment changes what is owing — on this bill, in the list and in the customer's balance.
const paymentTags = (invoiceNumber: string) => [
  { type: "Invoice" as const, id: invoiceNumber },
  { type: "Invoice" as const, id: "LIST" },
  "Customer" as const,
];

export const invoicesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getInvoice: builder.query<Invoice, string>({
      query: (invoiceNumber) => `/api/invoices/${invoiceNumber}`,
      transformResponse: unwrap<Invoice>,
      providesTags: (_r, _e, invoiceNumber) => [{ type: "Invoice", id: invoiceNumber }],
    }),
    listInvoices: builder.query<InvoicePage, InvoiceListFilters>({
      query: (filters) => `/api/invoices${toQueryString(filters)}`,
      transformResponse: unwrap<InvoicePage>,
      providesTags: [{ type: "Invoice", id: "LIST" }],
    }),
    updateInvoice: builder.mutation<Invoice, UpdateInvoiceInput>({
      query: ({ invoiceNumber, ...body }) => ({ url: `/api/invoices/${invoiceNumber}`, method: "PATCH", body }),
      transformResponse: unwrap<Invoice>,
      invalidatesTags: (_r, _e, { invoiceNumber }) => [{ type: "Invoice", id: invoiceNumber }, ...saleSideEffectTags],
    }),
    /** Cancels the bill, or — if its month is filed — issues a full credit note (returned as creditNote). */
    cancelInvoice: builder.mutation<
      { invoice: Invoice; creditNote: CreditNote | null },
      { invoiceNumber: string; reason?: string }
    >({
      query: ({ invoiceNumber, reason }) => ({
        url: `/api/invoices/${invoiceNumber}/cancel`,
        method: "POST",
        body: { reason },
      }),
      transformResponse: unwrap<{ invoice: Invoice; creditNote: CreditNote | null }>,
      invalidatesTags: (_r, _e, { invoiceNumber }) => [{ type: "Invoice", id: invoiceNumber }, ...saleSideEffectTags],
    }),
    listInvoiceCreditNotes: builder.query<CreditNote[], string>({
      query: (invoiceNumber) => `/api/invoices/${invoiceNumber}/credit-notes`,
      transformResponse: unwrap<CreditNote[]>,
      providesTags: (_r, _e, invoiceNumber) => [{ type: "CreditNote", id: invoiceNumber }],
    }),
    /** Return some items from a filed month's bill — issued as a credit note. */
    issueCreditNote: builder.mutation<
      CreditNote,
      { invoiceNumber: string; items: { product: string; quantity: number }[]; reason?: string }
    >({
      query: ({ invoiceNumber, ...body }) => ({ url: `/api/invoices/${invoiceNumber}/credit-notes`, method: "POST", body }),
      transformResponse: unwrap<CreditNote>,
      invalidatesTags: (_r, _e, { invoiceNumber }) => [{ type: "Invoice", id: invoiceNumber }, ...saleSideEffectTags],
    }),
    getCreditNote: builder.query<CreditNote, string>({
      query: (noteNumber) => `/api/credit-notes/${noteNumber}`,
      transformResponse: unwrap<CreditNote>,
      providesTags: (_r, _e, noteNumber) => [{ type: "CreditNote", id: noteNumber }],
    }),
    /**
     * Money received against a bill. Refreshes the invoice, the list and the customer's
     * balance — but never GST returns or reports: payments don't change the tax invoice.
     */
    recordInvoicePayment: builder.mutation<Invoice, RecordPaymentInput & { invoiceNumber: string }>({
      query: ({ invoiceNumber, ...body }) => ({ url: `/api/invoices/${invoiceNumber}/payments`, method: "POST", body }),
      transformResponse: unwrap<Invoice>,
      invalidatesTags: (_r, _e, { invoiceNumber }) => paymentTags(invoiceNumber),
    }),
    /** Removes a payment entry that was typed in by mistake (admin). */
    deleteInvoicePayment: builder.mutation<Invoice, { invoiceNumber: string; paymentId: string }>({
      query: ({ invoiceNumber, paymentId }) => ({ url: `/api/invoices/${invoiceNumber}/payments/${paymentId}`, method: "DELETE" }),
      transformResponse: unwrap<Invoice>,
      invalidatesTags: (_r, _e, { invoiceNumber }) => paymentTags(invoiceNumber),
    }),
    /** Sets (or, with null, clears) the day the balance is expected by. */
    setInvoiceDueDate: builder.mutation<Invoice, { invoiceNumber: string; dueDate: string | null }>({
      query: ({ invoiceNumber, dueDate }) => ({ url: `/api/invoices/${invoiceNumber}/due-date`, method: "PATCH", body: { dueDate } }),
      transformResponse: unwrap<Invoice>,
      invalidatesTags: (_r, _e, { invoiceNumber }) => paymentTags(invoiceNumber),
    }),
    sendInvoiceWhatsapp: builder.mutation<void, { invoiceNumber: string; phone?: string }>({
      query: ({ invoiceNumber, phone }) => ({
        url: `/api/invoices/${invoiceNumber}/send-whatsapp`,
        method: "POST",
        body: phone ? { phone } : {},
      }),
      invalidatesTags: (_r, _e, { invoiceNumber }) => [
        { type: "Invoice", id: invoiceNumber },
        { type: "Invoice", id: "LIST" },
      ],
    }),
    sendInvoiceEmail: builder.mutation<void, string>({
      query: (invoiceNumber) => ({ url: `/api/invoices/${invoiceNumber}/send-email`, method: "POST" }),
      invalidatesTags: (_r, _e, invoiceNumber) => [{ type: "Invoice", id: invoiceNumber }],
    }),
  }),
});

export const {
  useGetInvoiceQuery,
  useListInvoicesQuery,
  useUpdateInvoiceMutation,
  useCancelInvoiceMutation,
  useListInvoiceCreditNotesQuery,
  useIssueCreditNoteMutation,
  useGetCreditNoteQuery,
  useRecordInvoicePaymentMutation,
  useDeleteInvoicePaymentMutation,
  useSetInvoiceDueDateMutation,
  useSendInvoiceWhatsappMutation,
  useSendInvoiceEmailMutation,
} = invoicesApi;
