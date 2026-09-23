import { apiSlice, unwrap } from "../../apiSlice";
import type { Customer, CustomerDetails } from "@/types/customer";
import type { Paginated } from "@/types/pagination";

export interface CustomerListFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateCustomerInput extends Partial<CustomerDetails> {
  id: string;
  /** Also correct the customer details printed on their past bills. */
  applyToInvoices?: boolean;
}

function toQueryString(filters: CustomerListFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const customersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listCustomers: builder.query<Paginated<Customer>, CustomerListFilters>({
      query: (filters) => `/api/customers${toQueryString(filters)}`,
      transformResponse: unwrap<Paginated<Customer>>,
      providesTags: ["Customer"],
    }),
    /** Billing counter: a returning customer's details from their phone number (null if new). */
    lookupCustomer: builder.query<Customer | null, string>({
      query: (phone) => `/api/customers/lookup?phone=${encodeURIComponent(phone)}`,
      transformResponse: unwrap<Customer | null>,
    }),
    updateCustomer: builder.mutation<{ customer: Customer; invoicesUpdated: number }, UpdateCustomerInput>({
      query: ({ id, ...body }) => ({ url: `/api/customers/${id}`, method: "PATCH", body }),
      transformResponse: unwrap<{ customer: Customer; invoicesUpdated: number }>,
      invalidatesTags: (result) => ["Customer", ...(result?.invoicesUpdated ? ["Invoice" as const] : [])],
    }),
    deleteCustomer: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/customers/${id}`, method: "DELETE" }),
      invalidatesTags: ["Customer", { type: "Invoice", id: "LIST" }],
    }),
  }),
});

export const {
  useListCustomersQuery,
  useLazyLookupCustomerQuery,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
} = customersApi;
