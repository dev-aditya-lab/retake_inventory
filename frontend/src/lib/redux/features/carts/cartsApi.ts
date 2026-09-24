import { apiSlice, unwrap } from "../../apiSlice";
import type { CartCustomer, CartData, CartGst, PaymentMethod } from "@/types/cart";
import type { Invoice } from "@/types/invoice";
import type { NonGstBill } from "@/types/nonGstBill";

interface UpdateCartInput {
  id: string;
  customer?: CartCustomer;
  isB2b?: boolean;
  gstApplicable?: boolean;
  gst?: CartGst;
  otherCharges?: number;
  paymentMethod?: PaymentMethod;
  note?: string;
}

interface AddItemInput {
  id: string;
  productId?: string;
  ean13?: string;
  quantity: number;
}

// Every cart mutation already returns the fresh cart (or, for discard/
// checkout, just needs the cart removed from the list) — patching the
// `listCarts` cache directly from that response avoids a second network
// round-trip per action that tag-invalidation would otherwise cause. With
// invalidation, every scan/qty-change/field-edit was: mutation, then a full
// re-fetch of the whole cart list before the UI could update.
export const cartsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listCarts: builder.query<CartData[], void>({
      query: () => "/api/carts",
      transformResponse: unwrap<CartData[]>,
      providesTags: [{ type: "Cart", id: "LIST" }],
    }),
    createCart: builder.mutation<CartData, void>({
      query: () => ({ url: "/api/carts", method: "POST" }),
      transformResponse: unwrap<CartData>,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data: cart } = await queryFulfilled;
        dispatch(
          cartsApi.util.updateQueryData("listCarts", undefined, (draft) => {
            draft.push(cart);
          }),
        );
      },
    }),
    updateCart: builder.mutation<CartData, UpdateCartInput>({
      query: ({ id, ...body }) => ({ url: `/api/carts/${id}`, method: "PATCH", body }),
      transformResponse: unwrap<CartData>,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data: cart } = await queryFulfilled;
        dispatch(
          cartsApi.util.updateQueryData("listCarts", undefined, (draft) => {
            const idx = draft.findIndex((c) => c.id === cart.id);
            if (idx !== -1) draft[idx] = cart;
          }),
        );
      },
    }),
    discardCart: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/carts/${id}`, method: "DELETE" }),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(
          cartsApi.util.updateQueryData("listCarts", undefined, (draft) => {
            const idx = draft.findIndex((c) => c.id === id);
            if (idx !== -1) draft.splice(idx, 1);
          }),
        );
      },
    }),
    addCartItem: builder.mutation<CartData, AddItemInput>({
      query: ({ id, ...body }) => ({ url: `/api/carts/${id}/items`, method: "POST", body }),
      transformResponse: unwrap<CartData>,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data: cart } = await queryFulfilled;
        dispatch(
          cartsApi.util.updateQueryData("listCarts", undefined, (draft) => {
            const idx = draft.findIndex((c) => c.id === cart.id);
            if (idx !== -1) draft[idx] = cart;
          }),
        );
      },
    }),
    updateCartItem: builder.mutation<CartData, { id: string; productId: string; quantity: number }>({
      query: ({ id, productId, quantity }) => ({
        url: `/api/carts/${id}/items/${productId}`,
        method: "PATCH",
        body: { quantity },
      }),
      transformResponse: unwrap<CartData>,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data: cart } = await queryFulfilled;
        dispatch(
          cartsApi.util.updateQueryData("listCarts", undefined, (draft) => {
            const idx = draft.findIndex((c) => c.id === cart.id);
            if (idx !== -1) draft[idx] = cart;
          }),
        );
      },
    }),
    removeCartItem: builder.mutation<CartData, { id: string; productId: string }>({
      query: ({ id, productId }) => ({ url: `/api/carts/${id}/items/${productId}`, method: "DELETE" }),
      transformResponse: unwrap<CartData>,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data: cart } = await queryFulfilled;
        dispatch(
          cartsApi.util.updateQueryData("listCarts", undefined, (draft) => {
            const idx = draft.findIndex((c) => c.id === cart.id);
            if (idx !== -1) draft[idx] = cart;
          }),
        );
      },
    }),
    checkout: builder.mutation<Invoice, string>({
      query: (id) => ({ url: `/api/carts/${id}/checkout`, method: "POST" }),
      transformResponse: unwrap<Invoice>,
      invalidatesTags: [{ type: "Product", id: "LIST" }, { type: "Invoice", id: "LIST" }, "Report", "Customer", "Gst"],
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(
          cartsApi.util.updateQueryData("listCarts", undefined, (draft) => {
            const idx = draft.findIndex((c) => c.id === id);
            if (idx !== -1) draft.splice(idx, 1);
          }),
        );
      },
    }),
    // A cart set to "GST not applicable". Deliberately touches only products and
    // the non-GST list — never GST returns, reports or the customer directory.
    checkoutNonGst: builder.mutation<NonGstBill, string>({
      query: (id) => ({ url: `/api/carts/${id}/checkout-non-gst`, method: "POST" }),
      transformResponse: unwrap<NonGstBill>,
      invalidatesTags: [{ type: "Product", id: "LIST" }, { type: "NonGstBill", id: "LIST" }],
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(
          cartsApi.util.updateQueryData("listCarts", undefined, (draft) => {
            const idx = draft.findIndex((c) => c.id === id);
            if (idx !== -1) draft.splice(idx, 1);
          }),
        );
      },
    }),
  }),
});

export const {
  useListCartsQuery,
  useCreateCartMutation,
  useUpdateCartMutation,
  useDiscardCartMutation,
  useAddCartItemMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useCheckoutMutation,
  useCheckoutNonGstMutation,
} = cartsApi;
