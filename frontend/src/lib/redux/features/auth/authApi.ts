import { apiSlice, unwrap, type ApiEnvelope } from "../../apiSlice";
import type { AuthUser } from "@/types/auth";

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<AuthUser, void>({
      query: () => "/api/auth/me",
      transformResponse: unwrap<AuthUser>,
      providesTags: ["User"],
    }),
    login: builder.mutation<AuthUser, { email: string; password: string }>({
      query: (body) => ({ url: "/api/auth/login", method: "POST", body }),
      transformResponse: unwrap<AuthUser>,
      invalidatesTags: ["User"],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: "/api/auth/logout", method: "POST" }),
      transformResponse: (_response: ApiEnvelope<null>) => undefined,
      invalidatesTags: ["User"],
    }),
  }),
});

export const { useGetMeQuery, useLoginMutation, useLogoutMutation } = authApi;
