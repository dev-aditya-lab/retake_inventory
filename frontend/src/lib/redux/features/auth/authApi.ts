import { apiSlice, unwrap, type ApiEnvelope } from "../../apiSlice";
import type { AuthUser } from "@/types/auth";

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<AuthUser, void>({
      query: () => "/api/auth/me",
      transformResponse: unwrap<AuthUser>,
      providesTags: ["User"],
    }),
    // Staff sign in with a one-time code sent to their WhatsApp (or email): no passwords.
    requestOtp: builder.mutation<void, { identifier: string }>({
      query: (body) => ({ url: "/api/auth/otp/request", method: "POST", body }),
      transformResponse: () => undefined,
    }),
    verifyOtp: builder.mutation<AuthUser, { identifier: string; code: string }>({
      query: (body) => ({ url: "/api/auth/otp/verify", method: "POST", body }),
      transformResponse: unwrap<AuthUser>,
      invalidatesTags: ["User"],
    }),
    // A staff member editing their own name / phone. An empty phone clears it.
    updateProfile: builder.mutation<AuthUser, { name?: string; phone?: string }>({
      query: (body) => ({ url: "/api/auth/me", method: "PATCH", body }),
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

export const { useGetMeQuery, useRequestOtpMutation, useVerifyOtpMutation, useUpdateProfileMutation, useLogoutMutation } = authApi;
