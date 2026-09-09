/**
 * Tell a lost connection apart from a rejected write.
 *
 * Every optimistic write in the app funnels its failure toast through
 * `runOptimisticMutation` / `runOptimisticInsert`, and both said the same
 * thing whatever went wrong: "Please try again." When the cause is that the
 * browser has no route to the server -- a parent standing in a grocery aisle
 * on hotel wifi -- that advice cannot work, and it repeats once per tap.
 *
 * Two signals, because neither is sufficient alone:
 *
 *  1. `navigator.onLine === false`. Definitive when false, and it fires for
 *     airplane mode and a dropped radio before any request is attempted.
 *  2. The shape of the error. `navigator.onLine` is true whenever the machine
 *     holds any network interface, so a captive portal, a dead uplink or a DNS
 *     failure all report "online" while every fetch throws. supabase-js
 *     surfaces those as a TypeError from fetch, or as GoTrue's
 *     AuthRetryableFetchError.
 *
 * Deliberately NOT treated as offline: an HTTP status from the server. A 500,
 * a 403 or a PostgREST constraint violation all mean the request arrived, so
 * "you're offline" would be a lie and would hide a real defect.
 */

const OFFLINE_MESSAGE_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed", // Safari's wording for a fetch that never left the device
  "err_internet_disconnected",
  "err_network_changed",
  "err_name_not_resolved",
  "fetch failed",
];

/** True when the browser itself reports no connectivity. */
export function isBrowserOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  // `onLine` is absent on some non-browser runtimes; absent is not offline.
  return navigator.onLine === false;
}

/**
 * True when a failed Supabase call looks like it never reached the server.
 *
 * Safe to call with anything -- a null, a string, a PostgrestError.
 */
export function isOfflineFailure(error: unknown): boolean {
  if (isBrowserOffline()) return true;
  if (!error) return false;

  if (typeof error === "object") {
    const e = error as { name?: string; status?: number; code?: string; message?: string };
    // A status means the server answered. Not an offline failure, whatever the
    // message says.
    if (typeof e.status === "number" && e.status > 0) return false;
    if (e.name === "AuthRetryableFetchError") return true;
    if (e.code === "ENOTFOUND" || e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT") return true;
  }

  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message: string }).message)
        : "";

  const lowered = message.toLowerCase();
  return OFFLINE_MESSAGE_PATTERNS.some((p) => lowered.includes(p));
}

/**
 * What to tell the user when the write was rolled back.
 *
 * The offline wording says the change is gone rather than pending, because it
 * is: the web app rolls the optimistic row back and holds nothing to replay
 * (see the load-precedence contract in CLAUDE.md -- durable offline writes are
 * mobile-only today).
 */
export const OFFLINE_WRITE_MESSAGE =
  "You're offline, so that change wasn't saved. Reconnect and try again.";

/**
 * What to tell the user when the write was rolled back... unless it was queued.
 *
 * US-823: a queued write is the opposite case -- it is waiting, not lost -- and
 * saying "wasn't saved" about one would be the same lie in the other direction.
 */
export const OFFLINE_QUEUED_MESSAGE =
  "You're offline. Saved on this device and will sync when you reconnect.";

/** The offline wording when the connection is the cause, else `fallback`. */
export function writeFailureMessage(error: unknown, fallback: string): string {
  return isOfflineFailure(error) ? OFFLINE_WRITE_MESSAGE : fallback;
}


/**
 * Database internals that must never reach a parent's screen.
 *
 * These come back from PostgREST verbatim. "new row violates row-level security
 * policy for table \"plan_entries\"" tells the user nothing they can act on and
 * tells anyone reading over their shoulder a table name and a policy shape.
 */
const DATABASE_NOISE = [
  "violates row-level security",
  "violates unique constraint",
  "violates foreign key constraint",
  "violates check constraint",
  "violates not-null constraint",
  "duplicate key value",
  "does not exist",
  "permission denied for",
  "invalid input syntax for",
  "could not find the",
  "pgrst",
  "syntax error at or near",
];

/**
 * Turn a caught error into something worth showing a person.
 *
 * Three cases, in order:
 *
 *  1. No connection -> say so. `fetch` throws "TypeError: Failed to fetch",
 *     which used to be printed verbatim in the sign-in toast: the one moment a
 *     user cannot get past, told nothing they can act on.
 *  2. Database internals -> the caller's fallback. Constraint and RLS text is
 *     for the log, not the screen.
 *  3. Anything else -> through unchanged. GoTrue's messages are written FOR the
 *     user ("Invalid login credentials", "Email not confirmed", "User already
 *     registered") and replacing them with a generic fallback would make the
 *     sign-in form less usable, not more.
 */
export function userFacingError(error: unknown, fallback: string): string {
  if (isOfflineFailure(error)) return OFFLINE_MESSAGE;

  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";

  if (!message.trim()) return fallback;

  const lowered = message.toLowerCase();
  if (DATABASE_NOISE.some((p) => lowered.includes(p))) return fallback;

  return message;
}

/** Shown when a read or an action could not reach the server at all. */
export const OFFLINE_MESSAGE =
  "You're offline. Check your connection and try again.";
