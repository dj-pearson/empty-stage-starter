import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { createWebSyncQueue,
  purgeForeignQueuesFromBrowser, createGroceryExecutor, notifySyncQueueChanged } from "@/lib/webSyncQueue";

/**
 * US-823: replay the web app's queued writes.
 *
 * Two triggers, and the second is the one the native driver was missing (it
 * fired only on a reconnect, so an app reopened online never drained -- fixed
 * in the same story):
 *
 *   1. the browser's `online` event, for a tab that was open the whole time;
 *   2. once per mount, because a queue written in a previous session is
 *      exactly the case a transition can never catch. A shopper who closed the
 *      tab in the aisle and opened it at home has no offline->online edge.
 *
 * A drain is never run concurrently with itself: `online` can fire while a
 * mount drain is still in flight, and replaying the same op twice would be two
 * writes for one tap.
 */
export function useOfflineSyncDriver(userId: string | null | undefined): void {
  const draining = useRef(false);
  const drainedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    // US-823: a shared tablet accumulates one queue per person who has ever
    // signed in on it, because sign-out deliberately KEEPS the signed-out
    // user's queue (their unsent writes are the thing this story protects).
    // Dropping the other accounts' queues here bounds that growth without
    // touching the one that is about to be drained.
    const purged = purgeForeignQueuesFromBrowser(userId);
    if (purged.length > 0) {
      logger.info(`[webSyncQueue] purged ${purged.length} queue(s) belonging to other accounts`);
    }

    let cancelled = false;

    const drain = async (reason: "mount" | "online") => {
      if (draining.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      draining.current = true;
      try {
        const queue = createWebSyncQueue(userId);
        const pending = await queue.peek();
        if (pending.length === 0 || cancelled) return;

        const result = await queue.drain(createGroceryExecutor());
        // Rows marked "not synced yet" re-read the queue on this, whatever the
        // outcome: sent ops leave it, dropped ones too.
        notifySyncQueueChanged();
        if (cancelled) return;

        logger.info(
          `[webSyncQueue] drain (${reason}): ${result.succeeded} sent, ${result.failed} waiting, ${result.dropped} dropped`,
        );
        if (result.succeeded > 0) {
          toast.success(
            result.succeeded === 1
              ? "Synced 1 change made offline."
              : `Synced ${result.succeeded} changes made offline.`,
          );
        }
        // A dropped op is a change the user was told was saved. Saying so is
        // the whole difference between this and losing it silently.
        if (result.dropped > 0) {
          toast.error(
            result.dropped === 1
              ? "1 offline change couldn't be saved and was discarded."
              : `${result.dropped} offline changes couldn't be saved and were discarded.`,
          );
        }
      } catch (err) {
        logger.warn("[webSyncQueue] drain failed", err);
      } finally {
        draining.current = false;
      }
    };

    if (drainedFor.current !== userId) {
      drainedFor.current = userId;
      void drain("mount");
    }

    const onOnline = () => void drain("online");
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [userId]);
}
