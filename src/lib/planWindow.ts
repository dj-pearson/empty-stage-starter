import type { PlanEntry } from "@/types";

/**
 * Merge a windowed plan_entries server load with existing (cached) state
 * (US-538).
 *
 * The authenticated load only fetches the -30d..+90d window, so a plain
 * wholesale `setPlanEntriesState(serverData)` would DISCARD cached history
 * outside that window (and then the write-through cache would persist only the
 * truncated set). This is the ONE documented exception to the US-341
 * server-authoritative-wholesale-overwrite rule: because the fetch is windowed,
 * the server is authoritative only WITHIN the window.
 *
 * In-window rows come entirely from the server (so a deletion or cross-device
 * edit inside the window still wins by id); out-of-window cached rows are kept
 * unless the server already returned a row with the same id.
 */
export function mergeWindowedPlanEntries(
  prev: PlanEntry[],
  serverEntries: PlanEntry[],
  windowStart: string,
  windowEnd: string,
): PlanEntry[] {
  const serverIds = new Set(serverEntries.map((e) => e.id));
  const outOfWindow = prev.filter(
    (e) => (e.date < windowStart || e.date > windowEnd) && !serverIds.has(e.id),
  );
  return [...serverEntries, ...outOfWindow];
}
