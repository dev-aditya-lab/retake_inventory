import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";

import { API_BASE_URL } from "@/lib/apiBase";
import { refreshSession } from "@/lib/refreshSession";

export { API_BASE_URL };

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export function unwrap<T>(response: ApiEnvelope<T>): T {
  return response.data;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: "include",
});

/** Requests that must never trigger a refresh: they are how you sign in or refresh in the first place. */
const NO_REFRESH_URLS = new Set(["/api/auth/refresh", "/api/auth/login", "/api/auth/logout", "/api/auth/otp/request", "/api/auth/otp/verify"]);

// Access tokens are short-lived (15m). On a 401, renew the login once (shared by
// every request that fails at the same moment, see refreshSession) and retry
// the original request. Callers just see the eventual success or failure.
// Applies to every request, including the ones written as a plain URL string.
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  const url = typeof args === "string" ? args : args.url;
  if (result.error?.status === 401 && !NO_REFRESH_URLS.has(url)) {
    if (await refreshSession()) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  return result;
};

// Single RTK Query root API — feature slices (auth, products, invoices, ...)
// inject their endpoints into this instance via `apiSlice.injectEndpoints`.
export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["User", "Product", "Invoice", "StockMovement", "Cart", "Customer", "SkuCode", "HsnCode", "Report", "Gst", "CreditNote", "NonGstBill", "Whatsapp", "WhatsappConfig", "WhatsappTemplate", "WhatsappQuickReply", "WhatsappLabel", "WhatsappProfile", "WhatsappBroadcast", "WhatsappAutomation"],
  endpoints: () => ({}),
});
