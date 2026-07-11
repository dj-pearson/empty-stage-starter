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
export async function runOptimisticMutation<T extends { id: string }>(
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
  let optimisticResult: T[] = [];
  let captured = false;
  setState((prev) => {
    snapshot = prev;
    optimisticResult = optimistic(prev);
    captured = true;
    return optimisticResult;
  });

  const { error } = await serverCall();
  if (!error) return { error: null };

  logger.error(options.logLabel, error);

  // Expired session -> let the global handler refresh/redirect. Still roll
  // back so the rejected edit doesn't linger if the user stays.
  const authOutcome = await handleSupabaseAuthError(error);

  // US-535: NON-DESTRUCTIVE rollback. The old `setState(snapshot)` clobbered any
  // realtime change that arrived DURING the request. Instead, invert only the
  // optimistic diff against the CURRENT state (which may include concurrent
  // realtime inserts/edits/deletes), keyed by id and guarded by reference
  // equality so a row a realtime event has since replaced is left untouched.
  if (captured) {
    setState((current) => rollbackOptimistic(current, snapshot, optimisticResult));
  }

  if (authOutcome === "not-auth-error") {
    toast.error(
      options.toastMessage ??
        "Couldn't save your change — it's been reverted. Please try again.",
    );
  }

  return { error };
}

/**
 * Reverse an optimistic change against the CURRENT array without discarding
 * concurrent realtime updates (US-535). Pure + exported for testing.
 *
 * For each id, using reference equality to detect "still the optimistic value":
 *  - existed before + still the optimistic version  -> restore the snapshot row
 *  - existed before + replaced by a realtime event  -> keep the current row
 *  - optimistically added + still the optimistic add -> drop it
 *  - optimistically added + replaced by realtime     -> keep the current row
 *  - optimistically removed + not concurrently re-added -> re-add the snapshot row
 */
export function rollbackOptimistic<T extends { id: string }>(
  current: T[],
  snapshot: T[],
  optimisticResult: T[],
): T[] {
  const snapById = new Map(snapshot.map((r) => [r.id, r]));
  const optById = new Map(optimisticResult.map((r) => [r.id, r]));

  const result: T[] = [];
  const currentIds = new Set<string>();

  for (const row of current) {
    currentIds.add(row.id);
    const snap = snapById.get(row.id);
    const opt = optById.get(row.id);
    const isStillOptimistic = opt !== undefined && row === opt;

    if (snap !== undefined) {
      // Row existed before the mutation: restore its pre-mutation value only if
      // the current row is still the optimistic one (no concurrent realtime).
      result.push(isStillOptimistic ? snap : row);
    } else {
      // Row did NOT exist before: it was optimistically added (drop it) unless a
      // realtime event has since replaced that id (keep the realtime version).
      if (!isStillOptimistic) result.push(row);
    }
  }

  // Re-add rows that were optimistically REMOVED and haven't been concurrently
  // re-added by a realtime event.
  for (const snap of snapshot) {
    if (!currentIds.has(snap.id) && !optById.has(snap.id)) {
      result.push(snap);
    }
  }

  return result;
}
