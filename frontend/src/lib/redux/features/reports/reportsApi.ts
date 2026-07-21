import { apiSlice, unwrap } from "../../apiSlice";
import type { DashboardSummary, DateRangeInput, ProductWiseRow, SalesPeriod, SalesReportRow, UserWiseRow } from "@/types/report";

function toQueryString(range?: DateRangeInput, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const reportsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getDashboard: builder.query<DashboardSummary, void>({
      query: () => "/api/reports/dashboard",
      transformResponse: unwrap<DashboardSummary>,
    }),
    getSalesReport: builder.query<SalesReportRow[], { period: SalesPeriod } & DateRangeInput>({
      query: ({ period, ...range }) => `/api/reports/sales${toQueryString(range, { period })}`,
      transformResponse: unwrap<SalesReportRow[]>,
    }),
    getProductWiseReport: builder.query<ProductWiseRow[], DateRangeInput | void>({
      query: (range) => `/api/reports/products${toQueryString(range ?? undefined)}`,
      transformResponse: unwrap<ProductWiseRow[]>,
    }),
    getUserWiseReport: builder.query<UserWiseRow[], DateRangeInput | void>({
      query: (range) => `/api/reports/users${toQueryString(range ?? undefined)}`,
      transformResponse: unwrap<UserWiseRow[]>,
    }),
  }),
});

export const { useGetDashboardQuery, useGetSalesReportQuery, useGetProductWiseReportQuery, useGetUserWiseReportQuery } =
  reportsApi;
