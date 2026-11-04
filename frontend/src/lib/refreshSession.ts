import { API_BASE_URL } from "./apiBase";

/**
 * Asks the server for a fresh login (the access cookie lasts 15 minutes, the
 * refresh cookie 30 days). Each refresh token works once, so when several
 * requests find the login expired at the same moment (a screen that polls
 * a few endpoints, say) they must NOT each refresh: the first would succeed and
 * the rest would fail, which used to log people out. All callers share one
 * request instead and get the same answer.
 *
 * Resolves true when the session was renewed, false when it genuinely can't be
 * (expired or signed out elsewhere) or the server couldn't be reached.
 */
let inFlight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  inFlight ??= fetch(`${API_BASE_URL}/api/auth/refresh`, { method: "POST", credentials: "include" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
