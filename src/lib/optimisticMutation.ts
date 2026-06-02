import type React from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { handleSupabaseAuthError } from "@/lib/supabaseAuthError";

/**
 * US-320: optimistic state mutation with server-error rollback.
 *
 * The entity contexts previously applied local state inside the Supabase
 * `.then(...)` REGARDLESS of `error`, so a server-rejected edit looked like it
 * succeeded and then silently reverted on the next realtime sync — the
 * "my edit reverted" confusion. This helper:
 *   1. Applies the optimistic change immediately (snappy UI), capturing the
 *      prior state synchronously via the functional-setState updater.
 *   2. Runs the server call.
 *   3. On error: rolls back to the captured snapshot and shows a toast.
 *
 * Expired-JWT / 401 errors are routed through the global auth handler
 * (US-316) instead of a generic toast, so a stale tab re-auths rather than
 * flashing "couldn't save".
 *
 * The snapshot capture is reliable because React invokes the updater
 * synchronously while dispatching the optimistic `setState`, well before the
 * awaited network call resolves. This mirrors the existing
 * `copyWeekPlan`/`deleteWeekPlan` read-current-state pattern in PlanContext.
 */
export async function runOptimisticMutation<T>(
  setState: React.Dispatch<React.SetStateAction<T[]>>,
  optimistic: (prev: T[]) => T[],
  serverCall: () => PromiseLike<{ error: unknown }>,
  options: {
    /** logger.error label, e.g. "Supabase updateFood error:" */
    logLabel: string;
    /** user-facing toast on a non-auth failure */
    toastMessage?: string;
  },
): Promise<{ error: unknown } | { error: null }> {
  let snapshot: T[] = [];
  let captured = false;
  setState((prev) => {
    snapshot = prev;
    captured = true;
    return optimistic(prev);
  });

  const { error } = await serverCall();
  if (!error) return { error: null };

  logger.error(options.logLabel, error);

  // Expired session -> let the global handler refresh/redirect. Still roll
  // back so the rejected edit doesn't linger if the user stays.
  const authOutcome = await handleSupabaseAuthError(error);

  if (captured) setState(snapshot);

  if (authOutcome === "not-auth-error") {
    toast.error(
      options.toastMessage ??
        "Couldn't save your change — it's been reverted. Please try again.",
    );
  }

  return { error };
}
