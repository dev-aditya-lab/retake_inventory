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

export type ProductStatusFilter = "active" | "inactive" | "all";

export interface ProductListFilters {
  search?: string;
  category?: string;
  type?: ProductType;
  lowStockOnly?: boolean;
  /** Defaults to "active" on the server. */
  status?: ProductStatusFilter;
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
  /** B2B price, excluding GST. */
  sellingPrice?: number;
  /** Retail MRP, including GST. */
  mrp?: number;
  gstRate?: number;
  uqc?: string;
  note?: string;
}

export interface UpdateProductInput {
  id: string;
  // Admin-only identity fields. Changing a Retake product's name/type/weight
  // regenerates its barcode (and its SKU, if it was the auto-built one).
  name?: string;
  type?: ProductType;
  weightLabel?: string;
  sku?: string;
  /** External products only. */
  barcode?: string;
  category?: string;
  hsnCode?: string;
  costPrice?: number;
  sellingPrice?: number;
  mrp?: number;
  gstRate?: number;
  uqc?: string;
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
  if (filters.status) params.set("status", filters.status);
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
      invalidatesTags: [{ type: "Product", id: "LIST" }, "SkuCode", "HsnCode"],
    }),
    updateProduct: builder.mutation<Product, UpdateProductInput>({
      query: ({ id, ...body }) => ({ url: `/api/products/${id}`, method: "PATCH", body }),
      transformResponse: unwrap<Product>,
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Product", id },
        { type: "Product", id: "LIST" },
        // Product counts on the SKU/HSN code pages can change.
        "SkuCode",
        "HsnCode",
      ],
    }),
    deleteProduct: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/products/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, id) => [{ type: "Product", id }, { type: "Product", id: "LIST" }, "SkuCode", "HsnCode"],
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
  useDeleteProductMutation,
  useAdjustStockMutation,
} = productsApi;
