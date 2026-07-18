import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

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

// Access tokens are short-lived (15m). On a 401, try one silent refresh
// (rotates the httpOnly refresh cookie) and retry the original request once
// before giving up — callers just see the eventual success or failure.
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && typeof args !== "string" && args.url !== "/api/auth/refresh") {
    const refreshResult = await rawBaseQuery({ url: "/api/auth/refresh", method: "POST" }, api, extraOptions);
    if (refreshResult.data) {
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
  tagTypes: ["User", "Product", "Invoice", "StockMovement"],
  endpoints: () => ({}),
});
