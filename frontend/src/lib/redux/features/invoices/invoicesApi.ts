import { apiSlice, unwrap } from "../../apiSlice";
import type { Invoice, InvoiceCustomer, InvoiceListItem, InvoiceStatus } from "@/types/invoice";
import type { CreditNote } from "@/types/creditNote";
import type { PaymentMethod } from "@/types/cart";
import type { Paginated } from "@/types/pagination";

export interface InvoiceListFilters {
  search?: string;
  status?: InvoiceStatus;
  /** Customer directory id — "all bills for this customer". */
  customer?: string;
  /** ISO datetimes (start/end of the chosen local days). */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface UpdateInvoiceInput {
  invoiceNumber: string;
  /** stateCode: place of supply (blank = from the GSTIN, or the shop's state). */
  customer: InvoiceCustomer & { stateCode?: string };
  /** The price list unitPrice is from: "exclusive" = B2B price excl. GST, "inclusive" = the MRP. */
  priceMode: "exclusive" | "inclusive";
  items: { product: string; quantity: number; unitPrice: number }[];
  otherCharges: number;
  paymentMethod: PaymentMethod;
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

export const invoicesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getInvoice: builder.query<Invoice, string>({
      query: (invoiceNumber) => `/api/invoices/${invoiceNumber}`,
      transformResponse: unwrap<Invoice>,
      providesTags: (_r, _e, invoiceNumber) => [{ type: "Invoice", id: invoiceNumber }],
    }),
    listInvoices: builder.query<Paginated<InvoiceListItem>, InvoiceListFilters>({
      query: (filters) => `/api/invoices${toQueryString(filters)}`,
      transformResponse: unwrap<Paginated<InvoiceListItem>>,
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
  useSendInvoiceWhatsappMutation,
  useSendInvoiceEmailMutation,
} = invoicesApi;
