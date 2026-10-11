import { apiSlice, unwrap } from "../../apiSlice";
import type {
  ChatFilter,
  ChatListPage,
  ChatThread,
  WhatsappHealth,
  WhatsappSummary,
} from "@/types/whatsapp";

/** Endpoints that return only {success}: nothing to hand back to the caller. */
const done = (): undefined => undefined;

export interface ListChatsArgs {
  filter?: ChatFilter;
  search?: string;
  page?: number;
  limit?: number;
}

export const whatsappApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWhatsappSummary: builder.query<WhatsappSummary, void>({
      query: () => "/api/whatsapp/summary",
      transformResponse: unwrap<WhatsappSummary>,
      providesTags: ["Whatsapp"],
    }),
    listChats: builder.query<ChatListPage, ListChatsArgs>({
      query: ({ filter = "all", search, page = 1, limit = 30 }) => {
        const params = new URLSearchParams({ filter, page: String(page), limit: String(limit) });
        if (search) params.set("search", search);
        return `/api/whatsapp/chats?${params.toString()}`;
      },
      transformResponse: unwrap<ChatListPage>,
      providesTags: ["Whatsapp"],
    }),
    // The newest `limit` messages; asking for a larger limit is how earlier history is loaded.
    getChat: builder.query<ChatThread, { id: string; limit?: number }>({
      query: ({ id, limit = 50 }) => `/api/whatsapp/chats/${id}?limit=${limit}`,
      transformResponse: unwrap<ChatThread>,
      providesTags: ["Whatsapp"],
    }),
    markChatRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/whatsapp/chats/${id}/read`, method: "POST" }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    sendChatMessage: builder.mutation<void, { id: string; text: string }>({
      query: ({ id, text }) => ({ url: `/api/whatsapp/chats/${id}/messages`, method: "POST", body: { text } }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    getWhatsappHealth: builder.query<WhatsappHealth, void>({
      query: () => "/api/whatsapp/health",
      transformResponse: unwrap<WhatsappHealth>,
      providesTags: ["Whatsapp"],
    }),
    acknowledgeAlert: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/whatsapp/alerts/${id}/acknowledge`, method: "POST" }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
  }),
});

export const {
  useGetWhatsappSummaryQuery,
  useListChatsQuery,
  useGetChatQuery,
  useMarkChatReadMutation,
  useSendChatMessageMutation,
  useGetWhatsappHealthQuery,
  useAcknowledgeAlertMutation,
} = whatsappApi;
