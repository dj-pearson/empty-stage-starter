import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

/**
 * US-316: centralized expired-JWT / 401 handling.
 *
 * CLAUDE.md prescribes "JWT expired -> refresh or redirect to /auth" but
 * nothing implemented it globally — expired-token errors came back as
 * `result.error` (PostgREST code PGRST301, or HTTP 401) and were silently
 * ignored, so a user who left a tab open saw an empty app instead of a
 * re-auth prompt.
 *
 * Flow: detect the auth error, attempt a single `refreshSession()`. On
 * success the caller can retry the failed read/mutation; on failure we
 * redirect to /auth (preserving the current path so the user lands back
 * where they were).
 */

export type AuthErrorOutcome = "not-auth-error" | "refreshed" | "redirected";

/**
 * True when a Supabase error represents an expired/invalid session.
 * supabase-js error objects carry `{ code, message, status }`:
 *   - PostgREST returns code `PGRST301` for an expired/invalid JWT.
 *   - The gateway / GoTrue can surface HTTP 401.
 *   - Message text varies ("JWT expired", "invalid JWT", "token is expired").
 */
export function isSupabaseAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; status?: number; message?: string };
  if (e.code === "PGRST301") return true;
  if (e.status === 401) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("jwt expired") ||
    msg.includes("jwt is expired") ||
    msg.includes("token is expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("not authenticated")
  );
}

/** Redirect to /auth, preserving where the user was so they return post-login. */
function redirectToAuth(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  // Don't loop if we're already on the auth screen.
  if (pathname.startsWith("/auth")) return;
  const redirect = encodeURIComponent(`${pathname}${search}`);
  window.location.assign(`/auth?redirect=${redirect}`);
}

/**
 * Handle a potential auth error. Returns:
 *   - "not-auth-error": the error isn't session-related; caller handles it.
 *   - "refreshed": session was refreshed; caller may retry the operation.
 *   - "redirected": refresh failed; user is being sent to /auth.
 *
 * Safe to call with any error — non-auth errors are a cheap no-op.
 */
export async function handleSupabaseAuthError(
  error: unknown,
): Promise<AuthErrorOutcome> {
  if (!isSupabaseAuthError(error)) return "not-auth-error";

  try {
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && data?.session) {
      logger.debug("Session refreshed after auth error");
      return "refreshed";
    }
    logger.warn(
      "Session refresh failed after auth error; redirecting to /auth",
      refreshError,
    );
  } catch (err) {
    logger.warn(
      "Session refresh threw after auth error; redirecting to /auth",
      err,
    );
  }

  redirectToAuth();
  return "redirected";
}
