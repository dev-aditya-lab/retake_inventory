import { apiSlice, unwrap } from "../../apiSlice";
import type { AuthUser, UserRole } from "@/types/auth";

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
}

interface UpdateUserInput {
  id: string;
  name?: string;
  phone?: string;
  role?: UserRole;
  isActive?: boolean;
}

export const usersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listUsers: builder.query<AuthUser[], void>({
      query: () => "/api/users",
      transformResponse: unwrap<AuthUser[]>,
      providesTags: ["User"],
    }),
    createUser: builder.mutation<AuthUser, CreateUserInput>({
      query: (body) => ({ url: "/api/users", method: "POST", body }),
      transformResponse: unwrap<AuthUser>,
      invalidatesTags: ["User"],
    }),
    updateUser: builder.mutation<AuthUser, UpdateUserInput>({
      query: ({ id, ...body }) => ({ url: `/api/users/${id}`, method: "PATCH", body }),
      transformResponse: unwrap<AuthUser>,
      invalidatesTags: ["User"],
    }),
  }),
});

export const { useListUsersQuery, useCreateUserMutation, useUpdateUserMutation } = usersApi;
