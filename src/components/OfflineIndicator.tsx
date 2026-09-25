import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
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
  const { t } = useTranslation();
  const { userId } = useAuth();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      // Kept in a ref so an unmount (sign-out, route change) inside the two
      // seconds does not set state on a component that is gone, and a second
      // `online` event restarts the wait rather than stacking another timer.
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
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
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
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
        // On a phone the dashboard header is fixed at top-0, h-14, z-50, so the
        // banner starts at top-14 and sits one layer above it: below the header
        // on screen, not hidden under it. From md up the header is sticky in the
        // content column and top-4 clears it by centring over the page.
        "fixed top-14 left-1/2 -translate-x-1/2 md:top-4 z-[60] flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium bg-warning text-warning-foreground",
      )}
    >
      {isReconnecting ? (
        <>
          <RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          {t("offline.reconnecting", { defaultValue: "Reconnecting..." })}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          {t("offline.banner", { defaultValue: "You're offline" })}
          {pendingCount > 0 && (
            <span className="ml-1 bg-background/20 px-2 py-0.5 rounded-full text-xs">
              {t("offline.pending", {
                defaultValue: "{{count}} changes waiting to sync",
                count: pendingCount,
              })}
            </span>
          )}
        </>
      )}
    </div>
  );
}
