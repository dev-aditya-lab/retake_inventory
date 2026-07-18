import { apiSlice } from "../../apiSlice";

interface HealthResponse {
  success: boolean;
  service: string;
  timestamp: string;
  dependencies: { mongodb: string; redis: string };
}

export const healthApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getHealth: builder.query<HealthResponse, void>({
      query: () => "/health",
    }),
  }),
});

export const { useGetHealthQuery } = healthApi;
