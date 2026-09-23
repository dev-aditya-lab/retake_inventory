import { apiSlice, unwrap } from "../../apiSlice";
import type { HsnCode, SkuCode } from "@/types/catalog";

export interface SkuCodeInput {
  name: string;
  skuCode: string;
  productId: number;
  category?: string;
}

export interface HsnCodeInput {
  code: string;
  description?: string;
  /** null clears a previously set rate. */
  gstRate?: number | null;
}

interface CascadeResult<T> {
  code: T;
  /** Products whose name/SKU/HSN was rewritten to follow the change. */
  productsUpdated: number;
}

// Code changes can rename products or rewrite their SKUs/HSN codes, so they
// also refresh the product catalog.
export const catalogApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listSkuCodes: builder.query<SkuCode[], void>({
      query: () => "/api/sku-codes",
      transformResponse: unwrap<SkuCode[]>,
      providesTags: ["SkuCode"],
    }),
    createSkuCode: builder.mutation<SkuCode, SkuCodeInput>({
      query: (body) => ({ url: "/api/sku-codes", method: "POST", body }),
      transformResponse: unwrap<SkuCode>,
      invalidatesTags: ["SkuCode"],
    }),
    updateSkuCode: builder.mutation<CascadeResult<SkuCode>, Partial<SkuCodeInput> & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/api/sku-codes/${id}`, method: "PATCH", body }),
      transformResponse: unwrap<CascadeResult<SkuCode>>,
      invalidatesTags: ["SkuCode", "Product"],
    }),
    deleteSkuCode: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/sku-codes/${id}`, method: "DELETE" }),
      invalidatesTags: ["SkuCode"],
    }),

    listHsnCodes: builder.query<HsnCode[], void>({
      query: () => "/api/hsn-codes",
      transformResponse: unwrap<HsnCode[]>,
      providesTags: ["HsnCode"],
    }),
    createHsnCode: builder.mutation<HsnCode, HsnCodeInput>({
      query: (body) => ({ url: "/api/hsn-codes", method: "POST", body }),
      transformResponse: unwrap<HsnCode>,
      invalidatesTags: ["HsnCode"],
    }),
    updateHsnCode: builder.mutation<CascadeResult<HsnCode>, Partial<HsnCodeInput> & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/api/hsn-codes/${id}`, method: "PATCH", body }),
      transformResponse: unwrap<CascadeResult<HsnCode>>,
      invalidatesTags: ["HsnCode", "Product"],
    }),
    deleteHsnCode: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/hsn-codes/${id}`, method: "DELETE" }),
      invalidatesTags: ["HsnCode"],
    }),
  }),
});

export const {
  useListSkuCodesQuery,
  useCreateSkuCodeMutation,
  useUpdateSkuCodeMutation,
  useDeleteSkuCodeMutation,
  useListHsnCodesQuery,
  useCreateHsnCodeMutation,
  useUpdateHsnCodeMutation,
  useDeleteHsnCodeMutation,
} = catalogApi;
