import { apiSlice, unwrap } from "../../apiSlice";
import type {
  AnalyticsData,
  ApiStatus,
  AudienceInput,
  AudiencePreview,
  Automation,
  AutomationInput,
  Broadcast,
  BroadcastDetail,
  BusinessHours,
  BusinessProfile,
  CreateBroadcastInput,
  DeleteChatsResult,
  SavedInput,
  SavedMessage,
  UpdateProfileInput,
  UsageData,
  UsageRange,
  ChatFilter,
  ContactInput,
  ConversationPatch,
  CtaInput,
  ListInput,
  LocationInput,
  WhatsappAgent,
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
  label?: string;
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
      query: ({ filter = "all", label, search, page = 1, limit = 30 }) => {
        const params = new URLSearchParams({ filter, page: String(page), limit: String(limit) });
        if (search) params.set("search", search);
        if (label) params.set("label", label);
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
    sendChatMessage: builder.mutation<void, { id: string; text: string; replyTo?: string }>({
      query: ({ id, text, replyTo }) => ({ url: `/api/whatsapp/chats/${id}/messages`, method: "POST", body: { text, replyTo } }),
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
    sendChatMedia: builder.mutation<void, { id: string; file: File; caption: string; saveCopy?: boolean }>({
      query: ({ id, file, caption, saveCopy }) => {
        const body = new FormData();
        body.append("caption", caption);
        body.append("saveCopy", saveCopy ? "true" : "false");
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
    sendChatList: builder.mutation<void, { id: string } & ListInput>({
      query: ({ id, ...body }) => ({ url: `/api/whatsapp/chats/${id}/list`, method: "POST", body }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    sendChatCta: builder.mutation<void, { id: string } & CtaInput>({
      query: ({ id, ...body }) => ({ url: `/api/whatsapp/chats/${id}/cta`, method: "POST", body }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    sendChatLocation: builder.mutation<void, { id: string } & LocationInput>({
      query: ({ id, ...body }) => ({ url: `/api/whatsapp/chats/${id}/location`, method: "POST", body }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    sendChatContact: builder.mutation<void, { id: string } & ContactInput>({
      query: ({ id, ...body }) => ({ url: `/api/whatsapp/chats/${id}/contact`, method: "POST", body }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    reactToMessage: builder.mutation<void, { messageId: string; emoji: string }>({
      query: ({ messageId, emoji }) => ({ url: `/api/whatsapp/messages/${messageId}/react`, method: "POST", body: { emoji } }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),

    // ----- Saving files, CRM -----
    saveChatMedia: builder.mutation<void, string>({
      query: (messageId) => ({ url: `/api/whatsapp/media/${messageId}/save`, method: "POST" }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    setWhatsappMediaSettings: builder.mutation<void, boolean>({
      query: (autoSave) => ({ url: "/api/whatsapp/settings/media", method: "PUT", body: { autoSave } }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    updateChat: builder.mutation<void, { id: string } & ConversationPatch>({
      query: ({ id, ...body }) => ({ url: `/api/whatsapp/chats/${id}`, method: "PATCH", body }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp", "WhatsappLabel"],
    }),
    addChatNote: builder.mutation<void, { id: string; text: string }>({
      query: ({ id, text }) => ({ url: `/api/whatsapp/chats/${id}/notes`, method: "POST", body: { text } }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),
    listWhatsappAgents: builder.query<WhatsappAgent[], void>({
      query: () => "/api/whatsapp/agents",
      transformResponse: unwrap<WhatsappAgent[]>,
    }),
    listWhatsappLabels: builder.query<string[], void>({
      query: () => "/api/whatsapp/labels",
      transformResponse: unwrap<string[]>,
      providesTags: ["WhatsappLabel"],
    }),

    sendChatSaved: builder.mutation<void, { id: string; savedId: string }>({
      query: ({ id, savedId }) => ({ url: `/api/whatsapp/chats/${id}/saved`, method: "POST", body: { savedId } }),
      transformResponse: done,
      invalidatesTags: ["Whatsapp"],
    }),

    // ----- Deleting chats -----
    deleteChats: builder.mutation<DeleteChatsResult, { ids: string[]; deleteSavedFiles: boolean }>({
      query: (body) => ({ url: "/api/whatsapp/chats/delete", method: "POST", body }),
      transformResponse: unwrap<DeleteChatsResult>,
      invalidatesTags: ["Whatsapp", "WhatsappLabel"],
    }),

    // ----- Business profile -----
    getBusinessProfile: builder.query<BusinessProfile, void>({
      query: () => "/api/whatsapp/profile",
      transformResponse: unwrap<BusinessProfile>,
      providesTags: ["WhatsappProfile"],
    }),
    updateBusinessProfile: builder.mutation<BusinessProfile, UpdateProfileInput>({
      query: (body) => ({ url: "/api/whatsapp/profile", method: "PUT", body }),
      transformResponse: unwrap<BusinessProfile>,
      invalidatesTags: ["WhatsappProfile"],
    }),
    updateBusinessPicture: builder.mutation<BusinessProfile, File>({
      query: (file) => {
        const body = new FormData();
        body.append("file", file);
        return { url: "/api/whatsapp/profile/picture", method: "POST", body };
      },
      transformResponse: unwrap<BusinessProfile>,
      invalidatesTags: ["WhatsappProfile"],
    }),
    requestBusinessName: builder.mutation<BusinessProfile, string>({
      query: (name) => ({ url: "/api/whatsapp/profile/name", method: "POST", body: { name } }),
      transformResponse: unwrap<BusinessProfile>,
      invalidatesTags: ["WhatsappProfile"],
    }),

    // ----- Status, usage, analytics -----
    getWhatsappApiStatus: builder.query<ApiStatus, void>({
      query: () => "/api/whatsapp/status",
      transformResponse: unwrap<ApiStatus>,
    }),
    getWhatsappUsage: builder.query<UsageData, UsageRange>({
      query: (range) => `/api/whatsapp/usage?range=${range}`,
      transformResponse: unwrap<UsageData>,
    }),
    getWhatsappAnalytics: builder.query<AnalyticsData, UsageRange>({
      query: (range) => `/api/whatsapp/analytics?range=${range}`,
      transformResponse: unwrap<AnalyticsData>,
    }),

    // ----- Saved messages (the library) -----
    createSavedMessage: builder.mutation<SavedMessage, SavedInput>({
      query: (body) => ({ url: "/api/whatsapp/quick-replies", method: "POST", body }),
      transformResponse: unwrap<SavedMessage>,
      invalidatesTags: ["WhatsappQuickReply"],
    }),
    createSavedMedia: builder.mutation<SavedMessage, { title: string; caption: string; file: File }>({
      query: ({ title, caption, file }) => {
        const body = new FormData();
        body.append("title", title);
        body.append("caption", caption);
        body.append("file", file);
        return { url: "/api/whatsapp/quick-replies/media", method: "POST", body };
      },
      transformResponse: unwrap<SavedMessage>,
      invalidatesTags: ["WhatsappQuickReply"],
    }),
    updateSavedMessage: builder.mutation<SavedMessage, { id: string } & SavedInput>({
      query: ({ id, ...body }) => ({ url: `/api/whatsapp/quick-replies/${id}`, method: "PUT", body }),
      transformResponse: unwrap<SavedMessage>,
      invalidatesTags: ["WhatsappQuickReply"],
    }),

    // ----- Broadcasts -----
    previewBroadcastAudience: builder.mutation<AudiencePreview, AudienceInput>({
      query: (body) => ({ url: "/api/whatsapp/broadcasts/audience", method: "POST", body }),
      transformResponse: unwrap<AudiencePreview>,
    }),
    listBroadcasts: builder.query<Broadcast[], void>({
      query: () => "/api/whatsapp/broadcasts",
      transformResponse: unwrap<Broadcast[]>,
      providesTags: ["WhatsappBroadcast"],
    }),
    getBroadcast: builder.query<BroadcastDetail, { id: string; status?: string; page?: number }>({
      query: ({ id, status, page = 1 }) =>
        `/api/whatsapp/broadcasts/${id}?page=${page}&limit=50${status ? `&status=${status}` : ""}`,
      transformResponse: unwrap<BroadcastDetail>,
      providesTags: ["WhatsappBroadcast"],
    }),
    createBroadcast: builder.mutation<{ id: string }, CreateBroadcastInput>({
      query: (body) => ({ url: "/api/whatsapp/broadcasts", method: "POST", body }),
      transformResponse: unwrap<{ id: string }>,
      invalidatesTags: ["WhatsappBroadcast"],
    }),
    startBroadcast: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/whatsapp/broadcasts/${id}/start`, method: "POST" }),
      transformResponse: done,
      invalidatesTags: ["WhatsappBroadcast"],
    }),
    cancelBroadcast: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/whatsapp/broadcasts/${id}/cancel`, method: "POST" }),
      transformResponse: done,
      invalidatesTags: ["WhatsappBroadcast"],
    }),
    deleteBroadcast: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/whatsapp/broadcasts/${id}`, method: "DELETE" }),
      transformResponse: done,
      invalidatesTags: ["WhatsappBroadcast"],
    }),

    // ----- Automations -----
    listAutomations: builder.query<Automation[], void>({
      query: () => "/api/whatsapp/automations",
      transformResponse: unwrap<Automation[]>,
      providesTags: ["WhatsappAutomation"],
    }),
    createAutomation: builder.mutation<Automation, AutomationInput>({
      query: (body) => ({ url: "/api/whatsapp/automations", method: "POST", body }),
      transformResponse: unwrap<Automation>,
      invalidatesTags: ["WhatsappAutomation"],
    }),
    updateAutomation: builder.mutation<Automation, { id: string } & AutomationInput>({
      query: ({ id, ...body }) => ({ url: `/api/whatsapp/automations/${id}`, method: "PUT", body }),
      transformResponse: unwrap<Automation>,
      invalidatesTags: ["WhatsappAutomation"],
    }),
    toggleAutomation: builder.mutation<void, { id: string; enabled: boolean }>({
      query: ({ id, enabled }) => ({ url: `/api/whatsapp/automations/${id}`, method: "PATCH", body: { enabled } }),
      transformResponse: done,
      invalidatesTags: ["WhatsappAutomation"],
    }),
    deleteAutomation: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/whatsapp/automations/${id}`, method: "DELETE" }),
      transformResponse: done,
      invalidatesTags: ["WhatsappAutomation"],
    }),
    getBusinessHours: builder.query<BusinessHours, void>({
      query: () => "/api/whatsapp/automations/hours",
      transformResponse: unwrap<BusinessHours>,
      providesTags: ["WhatsappAutomation"],
    }),
    saveBusinessHours: builder.mutation<BusinessHours, BusinessHours>({
      query: (body) => ({ url: "/api/whatsapp/automations/hours", method: "PUT", body }),
      transformResponse: unwrap<BusinessHours>,
      invalidatesTags: ["WhatsappAutomation"],
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
  useSendChatSavedMutation,
  useDeleteChatsMutation,
  useGetBusinessProfileQuery,
  useUpdateBusinessProfileMutation,
  useUpdateBusinessPictureMutation,
  useRequestBusinessNameMutation,
  useGetWhatsappApiStatusQuery,
  useGetWhatsappUsageQuery,
  useGetWhatsappAnalyticsQuery,
  useCreateSavedMessageMutation,
  useCreateSavedMediaMutation,
  useUpdateSavedMessageMutation,
  usePreviewBroadcastAudienceMutation,
  useListBroadcastsQuery,
  useGetBroadcastQuery,
  useCreateBroadcastMutation,
  useStartBroadcastMutation,
  useCancelBroadcastMutation,
  useDeleteBroadcastMutation,
  useListAutomationsQuery,
  useCreateAutomationMutation,
  useUpdateAutomationMutation,
  useToggleAutomationMutation,
  useDeleteAutomationMutation,
  useGetBusinessHoursQuery,
  useSaveBusinessHoursMutation,
  useSendChatListMutation,
  useSendChatCtaMutation,
  useSendChatLocationMutation,
  useSendChatContactMutation,
  useReactToMessageMutation,
  useSaveChatMediaMutation,
  useSetWhatsappMediaSettingsMutation,
  useUpdateChatMutation,
  useAddChatNoteMutation,
  useListWhatsappAgentsQuery,
  useListWhatsappLabelsQuery,
  useListQuickRepliesQuery,
  useCreateQuickReplyMutation,
  useUpdateQuickReplyMutation,
  useDeleteQuickReplyMutation,
} = whatsappApi;
