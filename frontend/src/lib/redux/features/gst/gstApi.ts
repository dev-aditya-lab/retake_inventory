import { apiSlice, unwrap } from "../../apiSlice";
import type { GstFiling, GstReadiness, Gstr1Report } from "@/types/gst";

export interface PeriodRange {
  /** "YYYY-MM" */
  from: string;
  /** "YYYY-MM" — the last month of a quarter; omit for a single month. */
  to?: string;
}

export function gstr1Query({ from, to }: PeriodRange): string {
  const params = new URLSearchParams({ from });
  if (to && to !== from) params.set("to", to);
  return params.toString();
}

/** Path for the portal upload file — downloaded via authenticatedFetch, not RTK Query. */
export function gstr1DownloadPath(range: PeriodRange): string {
  return `/api/gst/gstr1/download?${gstr1Query(range)}`;
}

// Everything that changes invoices, products or filings can change these
// reports, so they share one tag and refetch together.
export const gstApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getGstReadiness: builder.query<GstReadiness, void>({
      query: () => "/api/gst/readiness",
      transformResponse: unwrap<GstReadiness>,
      providesTags: ["Gst"],
    }),
    getGstr1: builder.query<Gstr1Report, PeriodRange>({
      query: (range) => `/api/gst/gstr1?${gstr1Query(range)}`,
      transformResponse: unwrap<Gstr1Report>,
      providesTags: ["Gst"],
    }),
    listGstFilings: builder.query<GstFiling[], void>({
      query: () => "/api/gst/filings",
      transformResponse: unwrap<GstFiling[]>,
      providesTags: ["Gst"],
    }),
    markGstFiled: builder.mutation<void, { periods: string[]; arn?: string }>({
      query: (body) => ({ url: "/api/gst/filings", method: "POST", body }),
      invalidatesTags: ["Gst", { type: "Invoice", id: "LIST" }, "Invoice"],
    }),
    unmarkGstFiled: builder.mutation<void, string>({
      query: (period) => ({ url: `/api/gst/filings/${period}`, method: "DELETE" }),
      invalidatesTags: ["Gst", { type: "Invoice", id: "LIST" }, "Invoice"],
    }),
    bulkSetProductGst: builder.mutation<
      { updated: number },
      { productIds: string[]; hsnCode?: string; gstRate?: number; uqc?: string }
    >({
      query: (body) => ({ url: "/api/gst/products/bulk", method: "POST", body }),
      transformResponse: unwrap<{ updated: number }>,
      invalidatesTags: ["Gst", "Product", "HsnCode"],
    }),
  }),
});

export const {
  useGetGstReadinessQuery,
  useGetGstr1Query,
  useListGstFilingsQuery,
  useMarkGstFiledMutation,
  useUnmarkGstFiledMutation,
  useBulkSetProductGstMutation,
} = gstApi;
