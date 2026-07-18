import { apiSlice, unwrap } from "../../apiSlice";
import type { Invoice } from "@/types/invoice";

export const invoicesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getInvoice: builder.query<Invoice, string>({
      query: (invoiceNumber) => `/api/invoices/${invoiceNumber}`,
      transformResponse: unwrap<Invoice>,
      providesTags: (_r, _e, invoiceNumber) => [{ type: "Invoice", id: invoiceNumber }],
    }),
    sendInvoiceWhatsapp: builder.mutation<void, string>({
      query: (invoiceNumber) => ({ url: `/api/invoices/${invoiceNumber}/send-whatsapp`, method: "POST" }),
      invalidatesTags: (_r, _e, invoiceNumber) => [{ type: "Invoice", id: invoiceNumber }],
    }),
    sendInvoiceEmail: builder.mutation<void, string>({
      query: (invoiceNumber) => ({ url: `/api/invoices/${invoiceNumber}/send-email`, method: "POST" }),
      invalidatesTags: (_r, _e, invoiceNumber) => [{ type: "Invoice", id: invoiceNumber }],
    }),
  }),
});

export const { useGetInvoiceQuery, useSendInvoiceWhatsappMutation, useSendInvoiceEmailMutation } = invoicesApi;
