import { API_BASE_URL } from "./apiBase";
import { refreshSession } from "./refreshSession";

/**
 * Plain fetch with the same credentials + silent-refresh-on-401 behavior as
 * the RTK Query base query, for requests (like binary image downloads) that
 * don't belong in the Redux-cached store — e.g. a Blob isn't serializable
 * and doesn't need cross-component cache invalidation via tags.
 */
export async function authenticatedFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const request = () => fetch(url, { ...init, credentials: "include" });

  let res = await request();
  if (res.status === 401 && (await refreshSession())) {
    res = await request();
  }
  return res;
}
