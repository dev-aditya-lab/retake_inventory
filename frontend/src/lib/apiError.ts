/**
 * Pulls the backend's human-readable message out of an RTK Query error
 * (`{ status, data: { message } }`), falling back to `fallback` for network
 * failures or unexpected shapes.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: unknown; details?: unknown } }).data;
    // Zod validation failures carry the useful text in details[0].message.
    if (data?.message === "Validation failed" && Array.isArray(data.details) && data.details[0]?.message) {
      return String(data.details[0].message);
    }
    if (typeof data?.message === "string" && data.message) return data.message;
  }
  if (err && typeof err === "object" && "status" in err && (err as { status: unknown }).status === "FETCH_ERROR") {
    return "Can't reach the server — check your connection and try again.";
  }
  return fallback;
}
