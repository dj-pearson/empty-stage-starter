import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

/** The slice of the Screen Wake Lock API this hook uses. */
interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}
interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | null {
  if (typeof navigator === "undefined") return null;
  const api = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return api && typeof api.request === "function" ? api : null;
}

/**
 * Keep the screen on while `enabled` (Item 18: in-store mode, a phone in one
 * hand and a trolley in the other). Feature-detected: where the Wake Lock API
 * does not exist this does nothing and reports `supported: false`.
 *
 * The browser drops the lock whenever the page is hidden, so it is taken
 * again when the page comes back into view.
 */
export function useScreenWakeLock(enabled: boolean): { supported: boolean; active: boolean } {
  const supported = wakeLockApi() !== null;
  const [active, setActive] = useState(false);

  useEffect(() => {
    const api = wakeLockApi();
    if (!enabled || !api) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const next = await api.request("screen");
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        setActive(true);
      } catch (error) {
        // Refused (battery saver, no user gesture yet): the mode still works.
        logger.warn("Screen wake lock refused", error);
        setActive(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) void sentinel.release().catch(() => undefined);
      sentinel = null;
      setActive(false);
    };
  }, [enabled]);

  return { supported, active };
}
