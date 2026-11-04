import { apiSlice, unwrap } from "../../apiSlice";
import type {
  ChatFilter,
  ChatListPage,
  ChatThread,
  ConnectionResult,
  NewTemplate,
  QuickReply,
  SaveWhatsappConfig,
  TemplateDetail,
  TemplateValues,
  WhatsappConfig,
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
    setWhatsappService: builder.mutation<void, boolean>({
      query: (enabled) => ({ url: "/api/whatsapp/settings", method: "PUT", body: { enabled } }),
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

    // ----- Connection settings (admin) -----
    getWhatsappConfig: builder.query<WhatsappConfig, void>({
      query: () => "/api/whatsapp/config",
      transformResponse: unwrap<WhatsappConfig>,
      providesTags: ["WhatsappConfig"],
    }),
    saveWhatsappConfig: builder.mutation<WhatsappConfig, SaveWhatsappConfig>({
      query: (body) => ({ url: "/api/whatsapp/config", method: "PUT", body }),
      transformResponse: unwrap<WhatsappConfig>,
      invalidatesTags: ["WhatsappConfig", "Whatsapp"],
    }),
    testWhatsappConnection: builder.mutation<ConnectionResult, void>({
      query: () => ({ url: "/api/whatsapp/config/test", method: "POST" }),
      transformResponse: unwrap<ConnectionResult>,
      invalidatesTags: ["WhatsappConfig"],
    }),
    subscribeWhatsappWebhooks: builder.mutation<void, void>({
      query: () => ({ url: "/api/whatsapp/config/subscribe", method: "POST" }),
      transformResponse: done,
    }),

    // ----- Templates -----
    listWhatsappTemplates: builder.query<TemplateDetail[], { sendableOnly?: boolean } | void>({
      query: (args) => `/api/whatsapp/templates${args && args.sendableOnly ? "?sendable=1" : ""}`,
      transformResponse: unwrap<TemplateDetail[]>,
      providesTags: ["WhatsappTemplate"],
    }),
    syncWhatsappTemplates: builder.mutation<{ total: number; removed: number }, void>({
      query: () => ({ url: "/api/whatsapp/templates/sync", method: "POST" }),
      transformResponse: unwrap<{ total: number; removed: number }>,
      invalidatesTags: ["WhatsappTemplate", "Whatsapp"],
    }),
    createWhatsappTemplate: builder.mutation<TemplateDetail, NewTemplate>({
      query: (body) => ({ url: "/api/whatsapp/templates", method: "POST", body }),
      transformResponse: unwrap<TemplateDetail>,
      invalidatesTags: ["WhatsappTemplate", "Whatsapp"],
    }),
    deleteWhatsappTemplate: builder.mutation<void, string>({
      query: (name) => ({ url: `/api/whatsapp/templates/${encodeURIComponent(name)}`, method: "DELETE" }),
      transformResponse: done,
      invalidatesTags: ["WhatsappTemplate", "Whatsapp"],
    }),

    // ----- Sending from a chat -----
    sendChatTemplate: builder.mutation<void, { id: string; templateId: string; values: TemplateValues }>({
      query: ({ id, templateId, values }) => ({
        url: `/api/whatsapp/chats/${id}/template`,
        method: "POST",
        body: { templateId, values },
      }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    sendChatMedia: builder.mutation<void, { id: string; file: File; caption: string }>({
      query: ({ id, file, caption }) => {
        const body = new FormData();
        body.append("caption", caption);
        body.append("file", file);
        return { url: `/api/whatsapp/chats/${id}/media`, method: "POST", body };
      },
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    sendChatButtons: builder.mutation<void, { id: string; body: string; buttons: string[] }>({
      query: ({ id, body, buttons }) => ({
        url: `/api/whatsapp/chats/${id}/buttons`,
        method: "POST",
        body: { body, buttons },
      }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    startWhatsappChat: builder.mutation<{ id: string }, { phone: string; name?: string }>({
      query: (body) => ({ url: "/api/whatsapp/chats/start", method: "POST", body }),
      transformResponse: unwrap<{ id: string }>,
      invalidatesTags: ["Whatsapp"],
    }),

    // ----- Quick replies -----
    listQuickReplies: builder.query<QuickReply[], void>({
      query: () => "/api/whatsapp/quick-replies",
      transformResponse: unwrap<QuickReply[]>,
      providesTags: ["WhatsappQuickReply"],
    }),
    createQuickReply: builder.mutation<QuickReply, { title: string; text: string }>({
      query: (body) => ({ url: "/api/whatsapp/quick-replies", method: "POST", body }),
      transformResponse: unwrap<QuickReply>,
      invalidatesTags: ["WhatsappQuickReply"],
    }),
    updateQuickReply: builder.mutation<QuickReply, { id: string; title: string; text: string }>({
      query: ({ id, ...body }) => ({ url: `/api/whatsapp/quick-replies/${id}`, method: "PUT", body }),
      transformResponse: unwrap<QuickReply>,
      invalidatesTags: ["WhatsappQuickReply"],
    }),
    deleteQuickReply: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/whatsapp/quick-replies/${id}`, method: "DELETE" }),
      transformResponse: done,
      invalidatesTags: ["WhatsappQuickReply"],
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
  useSetWhatsappServiceMutation,
  useAcknowledgeAlertMutation,
  useGetWhatsappConfigQuery,
  useSaveWhatsappConfigMutation,
  useTestWhatsappConnectionMutation,
  useSubscribeWhatsappWebhooksMutation,
  useListWhatsappTemplatesQuery,
  useSyncWhatsappTemplatesMutation,
  useCreateWhatsappTemplateMutation,
  useDeleteWhatsappTemplateMutation,
  useSendChatTemplateMutation,
  useSendChatMediaMutation,
  useSendChatButtonsMutation,
  useStartWhatsappChatMutation,
  useListQuickRepliesQuery,
  useCreateQuickReplyMutation,
  useUpdateQuickReplyMutation,
  useDeleteQuickReplyMutation,
} = whatsappApi;
