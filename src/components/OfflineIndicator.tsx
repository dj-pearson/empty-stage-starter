import { useState, useEffect, useCallback } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

const MUTATION_QUEUE_KEY = "eatpal_offline_mutations";

interface QueuedMutation {
  id: string;
  table: string;
  operation: "insert" | "update" | "delete";
  data: unknown;
  timestamp: number;
}

function getQueuedMutations(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(MUTATION_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

export function queueMutation(mutation: Omit<QueuedMutation, "id" | "timestamp">): void {
  try {
    const queue = getQueuedMutations();
    queue.push({
      ...mutation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
    localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    logger.warn("Failed to queue offline mutation");
  }
}

export function clearMutationQueue(): void {
  localStorage.removeItem(MUTATION_QUEUE_KEY);
}

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const updatePendingCount = useCallback(() => {
    setPendingCount(getQueuedMutations().length);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsReconnecting(true);
      // Give a moment for connections to re-establish
      setTimeout(() => {
        setIsReconnecting(false);
        updatePendingCount();
      }, 2000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      updatePendingCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    updatePendingCount();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [updatePendingCount]);

  if (isOnline && !isReconnecting) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all",
        isReconnecting
          ? "bg-amber-500 text-white"
          : "bg-destructive text-destructive-foreground"
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
            <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">
              {pendingCount} pending {pendingCount === 1 ? "change" : "changes"}
            </span>
          )}
        </>
      )}
    </div>
  );
}
