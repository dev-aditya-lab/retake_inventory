import { apiSlice, unwrap } from "../../apiSlice";

export interface PushConfig {
  /** False until the server has VAPID keys (and the web-push package) configured. */
  enabled: boolean;
  publicKey: string | null;
}

export interface PushSubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const done = (): undefined => undefined;

export const pushApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPushConfig: builder.query<PushConfig, void>({
      query: () => "/api/push/config",
      transformResponse: unwrap<PushConfig>,
    }),
    subscribePush: builder.mutation<void, PushSubscriptionBody>({
      query: (body) => ({ url: "/api/push/subscribe", method: "POST", body }),
      transformResponse: done,
    }),
    unsubscribePush: builder.mutation<void, { endpoint: string }>({
      query: (body) => ({ url: "/api/push/unsubscribe", method: "POST", body }),
      transformResponse: done,
    }),
    sendTestPush: builder.mutation<void, void>({
      query: () => ({ url: "/api/push/test", method: "POST" }),
      transformResponse: done,
    }),
  }),
});

export const {
  useGetPushConfigQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
  useSendTestPushMutation,
} = pushApi;
