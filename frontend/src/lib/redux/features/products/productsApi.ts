import { apiSlice, unwrap } from "../../apiSlice";
import type { Product, ProductType } from "@/types/product";

export interface DecodedBarcode {
  type: ProductType;
  productName: string;
  productId: number;
  weightLabel: string;
  variant: string;
}

/** Path builder for a product's on-demand-rendered barcode image — fetched via authenticatedFetch, not RTK Query (a Blob doesn't belong in serializable Redux state). */
export function productBarcodePath(id: string, format: "png" | "svg" = "png"): string {
  return `/api/products/${id}/barcode?format=${format}`;
}

export interface ProductListFilters {
  search?: string;
  category?: string;
  type?: ProductType;
  lowStockOnly?: boolean;
}

interface CreateProductInput {
  category: string;
  name: string;
  type: ProductType;
  weightLabel: string;
  /** A pre-existing barcode (e.g. scanned from a third-party product) — skips Retake's own EAN-13 generation. */
  barcode?: string;
  /** Required for external products; auto-generated from the SKU scheme for Retake's own products if omitted. */
  sku?: string;
  hsnCode?: string;
  costPrice?: number;
  sellingPrice?: number;
  note?: string;
}

interface UpdateProductInput {
  id: string;
  category?: string;
  hsnCode?: string;
  costPrice?: number;
  sellingPrice?: number;
  lowStockThreshold?: number;
  note?: string;
  isActive?: boolean;
}

interface AdjustStockInput {
  id: string;
  quantityChange: number;
  type: "restock" | "adjustment" | "correction";
  note?: string;
}

function toQueryString(filters: ProductListFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.type) params.set("type", filters.type);
  if (filters.lowStockOnly) params.set("lowStockOnly", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const productsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listProducts: builder.query<Product[], ProductListFilters | void>({
      query: (filters) => `/api/products${toQueryString(filters ?? {})}`,
      transformResponse: unwrap<Product[]>,
      providesTags: (result) =>
        result
          ? [...result.map((p) => ({ type: "Product" as const, id: p._id })), { type: "Product" as const, id: "LIST" }]
          : [{ type: "Product" as const, id: "LIST" }],
    }),
    getProduct: builder.query<Product, string>({
      query: (id) => `/api/products/${id}`,
      transformResponse: unwrap<Product>,
      providesTags: (_result, _error, id) => [{ type: "Product", id }],
    }),
    getProductByBarcode: builder.query<Product, string>({
      query: (ean13) => `/api/products/barcode/${ean13}`,
      transformResponse: unwrap<Product>,
    }),
    decodeBarcode: builder.query<DecodedBarcode, string>({
      query: (ean13) => `/api/products/barcode/decode/${ean13}`,
      transformResponse: unwrap<DecodedBarcode>,
    }),
    createProduct: builder.mutation<Product, CreateProductInput>({
      query: (body) => ({ url: "/api/products", method: "POST", body }),
      transformResponse: unwrap<Product>,
      invalidatesTags: [{ type: "Product", id: "LIST" }],
    }),
    updateProduct: builder.mutation<Product, UpdateProductInput>({
      query: ({ id, ...body }) => ({ url: `/api/products/${id}`, method: "PATCH", body }),
      transformResponse: unwrap<Product>,
      invalidatesTags: (_result, _error, { id }) => [{ type: "Product", id }, { type: "Product", id: "LIST" }],
    }),
    adjustStock: builder.mutation<Product, AdjustStockInput>({
      query: ({ id, ...body }) => ({ url: `/api/products/${id}/stock`, method: "POST", body }),
      transformResponse: unwrap<Product>,
      invalidatesTags: (_result, _error, { id }) => [{ type: "Product", id }, { type: "Product", id: "LIST" }],
    }),
  }),
});

export const {
  useListProductsQuery,
  useGetProductQuery,
  useLazyGetProductByBarcodeQuery,
  useLazyDecodeBarcodeQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useAdjustStockMutation,
} = productsApi;
