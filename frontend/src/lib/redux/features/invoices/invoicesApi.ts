import { apiSlice, unwrap } from "../../apiSlice";
import type { Invoice, InvoiceCustomer, InvoiceListItem, InvoiceStatus } from "@/types/invoice";
import type { GstType, PaymentMethod } from "@/types/cart";
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
  customer: InvoiceCustomer;
  items: { product: string; quantity: number; unitPrice: number }[];
  gst: { enabled: boolean; type?: GstType; percentage: number };
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

// Editing or cancelling a bill moves stock and changes revenue, so it
// refreshes products, reports and customer totals as well as the bill.
const saleSideEffectTags = [
  { type: "Invoice" as const, id: "LIST" },
  { type: "Product" as const, id: "LIST" },
  "Report" as const,
  "Customer" as const,
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
    cancelInvoice: builder.mutation<Invoice, { invoiceNumber: string; reason?: string }>({
      query: ({ invoiceNumber, reason }) => ({
        url: `/api/invoices/${invoiceNumber}/cancel`,
        method: "POST",
        body: { reason },
      }),
      transformResponse: unwrap<Invoice>,
      invalidatesTags: (_r, _e, { invoiceNumber }) => [{ type: "Invoice", id: invoiceNumber }, ...saleSideEffectTags],
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
  useSendInvoiceWhatsappMutation,
  useSendInvoiceEmailMutation,
} = invoicesApi;
