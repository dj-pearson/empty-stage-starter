import { useState, useEffect, useCallback } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineSyncDriver } from "@/hooks/useOfflineSyncDriver";
import { pendingWriteCount } from "@/lib/webSyncQueue";

/**
 * The offline banner, and the mount point for the queue that makes it true.
 *
 * US-823: this file used to export queueMutation() and clearMutationQueue()
 * over a localStorage key 'eatpal_offline_mutations', with a QueuedMutation
 * type and a "<n> pending changes" badge. A grep across src/, app/, functions/
 * and supabase/ returned exactly three hits: the three declarations. Nothing
 * called them and nothing drained the key, so pendingCount was permanently 0,
 * the badge could never render, and anything ever queued would have sat there
 * for good. All of it is gone; the count below reads the real queue in
 * src/lib/webSyncQueue.ts, and useOfflineSyncDriver actually replays it.
 */
export function OfflineIndicator() {
  const { userId } = useAuth();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useOfflineSyncDriver(userId);

  const refreshPendingCount = useCallback(() => {
    let stale = false;
    void pendingWriteCount(userId).then((n) => {
      if (!stale) setPendingCount(n);
    });
    return () => {
      stale = true;
    };
  }, [userId]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsReconnecting(true);
      // The drain runs off the same `online` event. Re-read after it has had a
      // moment so the badge reflects what is left, not what was there.
      setTimeout(() => {
        setIsReconnecting(false);
        refreshPendingCount();
      }, 2000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      refreshPendingCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const cancel = refreshPendingCount();

    return () => {
      cancel();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshPendingCount]);

  // While offline the count changes with every tap, and nothing else is going
  // to tell us. Poll only in the state where the banner is on screen anyway.
  useEffect(() => {
    if (isOnline) return;
    const id = setInterval(refreshPendingCount, 2000);
    return () => clearInterval(id);
  }, [isOnline, refreshPendingCount]);

  if (isOnline && !isReconnecting) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        // US-824: top-centre, not bottom. Three overlays shared the bottom edge on
        // every dashboard route -- this banner, the install prompt and the support
        // FAB -- and the cookie bar (bottom-0, z-[100]) covered all of them for a
        // first-time visitor. A connectivity banner belongs at the top anyway.
        "fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all",
        isReconnecting
          ? "bg-amber-500 text-white"
          : "bg-destructive text-destructive-foreground",
      )}
    >
      {isReconnecting ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          Reconnecting...
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          You are offline
          {pendingCount > 0 && (
            <span className="ml-1 bg-background/20 px-2 py-0.5 rounded-full text-xs">
              {pendingCount} pending {pendingCount === 1 ? "change" : "changes"}
            </span>
          )}
        </>
      )}
    </div>
  );
}
