/**
 * Pure helpers for talking to Meta's Graph API. Nothing here touches env or the
 * network, so it is unit-testable; the calls themselves live in
 * services/metaGraph.service.ts.
 */

/** Swaps the version segment of a Graph base URL: ("https://graph.facebook.com/v22.0", "v23.0") -> ".../v23.0". */
export function withApiVersion(baseUrl: string, version: string | undefined): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (!version) return trimmed;
  return /\/v\d+\.\d+$/.test(trimmed) ? trimmed.replace(/\/v\d+\.\d+$/, `/${version}`) : `${trimmed}/${version}`;
}

interface GraphErrorBody {
  error?: { message?: unknown; code?: unknown; error_subcode?: unknown; error_user_title?: unknown; error_user_msg?: unknown; error_data?: { details?: unknown } };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * A short, human-readable reason from a Graph API error body. Prefers Meta's
 * own user-facing message, falls back to the technical one, and never includes
 * the whole payload (which can echo request data back).
 */
export function describeGraphError(body: unknown, fallback = "WhatsApp request failed"): string {
  const error = (body as GraphErrorBody | undefined)?.error;
  if (!error || typeof error !== "object") return fallback;

  const message = str(error.error_user_msg) ?? str(error.message) ?? fallback;
  const details = str(error.error_data?.details);
  const code = typeof error.code === "number" || typeof error.code === "string" ? ` (code ${error.code})` : "";
  return `${message}${details && details !== message ? ` - ${details}` : ""}${code}`;
}

/** True when Meta rejected the access token itself (expired, revoked, wrong app). */
export function isTokenError(body: unknown): boolean {
  const code = (body as GraphErrorBody | undefined)?.error?.code;
  return code === 190 || code === "190";
}
