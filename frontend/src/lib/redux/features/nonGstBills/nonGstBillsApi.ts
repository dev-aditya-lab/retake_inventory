import { apiSlice, unwrap } from "../../apiSlice";
import type { NonGstBill, NonGstBillListItem, NonGstBillStatus, PriceList } from "@/types/nonGstBill";
import type { InvoiceCustomer } from "@/types/invoice";
import type { Paginated } from "@/types/pagination";
import type { DueSummary, PaymentFilter } from "@/types/payment";
import type {
  NonGstCustomerPage,
  NonGstCustomerSort,
  NonGstOverview,
  NonGstTrendPeriod,
} from "@/types/nonGstOverview";
import type { RecordPaymentInput } from "../invoices/invoicesApi";

export interface NonGstBillListFilters {
  search?: string;
  status?: NonGstBillStatus;
  /** Only bills in this payment state (still owing, overdue, settled…). */
  payment?: PaymentFilter;
  /** One customer's bills — a `key` from the Customers tab. */
  customer?: string;
  /** ISO datetimes (start/end of the chosen local days). */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface NonGstOverviewQuery {
  period: NonGstTrendPeriod;
  /** ISO datetimes; both left out = all time. */
  from?: string;
  to?: string;
}

export interface NonGstCustomerFilters {
  search?: string;
  sort?: NonGstCustomerSort;
  /** Only customers who still owe money. */
  due?: boolean;
  page?: number;
  limit?: number;
}

/** A page of bills, plus what the filtered paid bills add up to. */
export interface NonGstBillPage extends Paginated<NonGstBillListItem> {
  totals: { amount: number; count: number };
  /** Money still to collect across all non-GST bills. */
  dues: DueSummary;
}

export interface UpdateNonGstBillInput {
  billNumber: string;
  customer: Omit<InvoiceCustomer, "gstin">;
  priceList: PriceList;
  items: { product: string; quantity: number; unitPrice: number }[];
  otherCharges: number;
  note?: string;
}

function toQueryString(filters: NonGstBillListFilters | NonGstOverviewQuery | NonGstCustomerFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// Recording a payment changes what is owing on the bill and in the non-GST list — nothing else.
const paymentTags = (billNumber: string) => [
  { type: "NonGstBill" as const, id: billNumber },
  { type: "NonGstBill" as const, id: "LIST" },
];

// Editing or cancelling a bill moves stock — so products refresh, and only the
// non-GST list. GST returns, reports and customer totals never change for these.
const billSideEffectTags = [
  { type: "NonGstBill" as const, id: "LIST" },
  { type: "Product" as const, id: "LIST" },
];

export const nonGstBillsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getNonGstBill: builder.query<NonGstBill, string>({
      query: (billNumber) => `/api/non-gst-bills/${billNumber}`,
      transformResponse: unwrap<NonGstBill>,
      providesTags: (_r, _e, billNumber) => [{ type: "NonGstBill", id: billNumber }],
    }),
    listNonGstBills: builder.query<NonGstBillPage, NonGstBillListFilters>({
      query: (filters) => `/api/non-gst-bills${toQueryString(filters)}`,
      transformResponse: unwrap<NonGstBillPage>,
      providesTags: [{ type: "NonGstBill", id: "LIST" }],
    }),
    // Overview and customers are worked out from the bills, so any bill change
    // (a payment, an edit, a cancellation) refreshes them through the LIST tag.
    getNonGstOverview: builder.query<NonGstOverview, NonGstOverviewQuery>({
      query: (filters) => `/api/non-gst-bills/overview${toQueryString(filters)}`,
      transformResponse: unwrap<NonGstOverview>,
      providesTags: [{ type: "NonGstBill", id: "LIST" }],
    }),
    listNonGstCustomers: builder.query<NonGstCustomerPage, NonGstCustomerFilters>({
      query: (filters) => `/api/non-gst-bills/customers${toQueryString(filters)}`,
      transformResponse: unwrap<NonGstCustomerPage>,
      providesTags: [{ type: "NonGstBill", id: "LIST" }],
    }),
    updateNonGstBill: builder.mutation<NonGstBill, UpdateNonGstBillInput>({
      query: ({ billNumber, ...body }) => ({ url: `/api/non-gst-bills/${billNumber}`, method: "PATCH", body }),
      transformResponse: unwrap<NonGstBill>,
      invalidatesTags: (_r, _e, { billNumber }) => [{ type: "NonGstBill", id: billNumber }, ...billSideEffectTags],
    }),
    cancelNonGstBill: builder.mutation<NonGstBill, { billNumber: string; reason?: string }>({
      query: ({ billNumber, reason }) => ({
        url: `/api/non-gst-bills/${billNumber}/cancel`,
        method: "POST",
        body: { reason },
      }),
      transformResponse: unwrap<NonGstBill>,
      invalidatesTags: (_r, _e, { billNumber }) => [{ type: "NonGstBill", id: billNumber }, ...billSideEffectTags],
    }),
    recordNonGstBillPayment: builder.mutation<NonGstBill, RecordPaymentInput & { billNumber: string }>({
      query: ({ billNumber, ...body }) => ({ url: `/api/non-gst-bills/${billNumber}/payments`, method: "POST", body }),
      transformResponse: unwrap<NonGstBill>,
      invalidatesTags: (_r, _e, { billNumber }) => paymentTags(billNumber),
    }),
    deleteNonGstBillPayment: builder.mutation<NonGstBill, { billNumber: string; paymentId: string }>({
      query: ({ billNumber, paymentId }) => ({ url: `/api/non-gst-bills/${billNumber}/payments/${paymentId}`, method: "DELETE" }),
      transformResponse: unwrap<NonGstBill>,
      invalidatesTags: (_r, _e, { billNumber }) => paymentTags(billNumber),
    }),
    setNonGstBillDueDate: builder.mutation<NonGstBill, { billNumber: string; dueDate: string | null }>({
      query: ({ billNumber, dueDate }) => ({ url: `/api/non-gst-bills/${billNumber}/due-date`, method: "PATCH", body: { dueDate } }),
      transformResponse: unwrap<NonGstBill>,
      invalidatesTags: (_r, _e, { billNumber }) => paymentTags(billNumber),
    }),
    sendNonGstBillWhatsapp: builder.mutation<void, { billNumber: string; phone?: string }>({
      query: ({ billNumber, phone }) => ({
        url: `/api/non-gst-bills/${billNumber}/send-whatsapp`,
        method: "POST",
        body: phone ? { phone } : {},
      }),
      invalidatesTags: (_r, _e, { billNumber }) => [
        { type: "NonGstBill", id: billNumber },
        { type: "NonGstBill", id: "LIST" },
      ],
    }),
    sendNonGstBillEmail: builder.mutation<void, string>({
      query: (billNumber) => ({ url: `/api/non-gst-bills/${billNumber}/send-email`, method: "POST" }),
      invalidatesTags: (_r, _e, billNumber) => [{ type: "NonGstBill", id: billNumber }],
    }),
  }),
});

export const {
  useGetNonGstBillQuery,
  useListNonGstBillsQuery,
  useGetNonGstOverviewQuery,
  useListNonGstCustomersQuery,
  useUpdateNonGstBillMutation,
  useCancelNonGstBillMutation,
  useRecordNonGstBillPaymentMutation,
  useDeleteNonGstBillPaymentMutation,
  useSetNonGstBillDueDateMutation,
  useSendNonGstBillWhatsappMutation,
  useSendNonGstBillEmailMutation,
} = nonGstBillsApi;
