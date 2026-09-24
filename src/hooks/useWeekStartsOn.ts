import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";
import {
  WEEK_STARTS_ON_PREF_KEY,
  adoptWeekStartsOnUser,
  getWeekStartsOn,
  parseWeekStartsOn,
  setWeekStartsOnLocal,
  subscribeWeekStartsOn,
  type WeekStartsOn,
} from "@/lib/weekStartPref";

/**
 * Users whose server row has been requested since the signed-in user last
 * changed. Cleared on every switch: a sign-out resets the store to the
 * default, so A -> B -> A must read A's row again.
 */
const requested = new Set<string>();
/** The user the effect last adopted; a load for anyone else is dropped. */
let currentUser: string | null = null;

/** Tests only. */
export function resetWeekStartsOnRequestsForTests(): void {
  requested.clear();
  currentUser = null;
}

async function loadFromServer(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("value")
    .eq("user_id", userId)
    .eq("key", WEEK_STARTS_ON_PREF_KEY)
    .maybeSingle();
  if (error) {
    // Allow a retry on the next mount; the cache or default stands meanwhile.
    requested.delete(userId);
    logger.warn("[weekStartsOn] load failed", { code: error.code });
    return;
  }
  // The user switched while this was in flight: the answer is not theirs.
  if (currentUser !== userId) return;
  const value = parseWeekStartsOn(data?.value);
  // No row: the user never chose, so the default (already showing) stands.
  if (value !== null) setWeekStartsOnLocal(value, userId);
}

/**
 * The weekday this user's weeks begin on (0 Sunday, 1 Monday; Monday unless
 * they chose otherwise). Every planner-week surface reads this, so they agree.
 */
export function useWeekStartsOn(): WeekStartsOn {
  const { userId } = useAuth();
  const value = useSyncExternalStore(subscribeWeekStartsOn, getWeekStartsOn, getWeekStartsOn);

  useEffect(() => {
    if (!userId) return;
    if (currentUser !== userId) {
      requested.clear();
      currentUser = userId;
    }
    adoptWeekStartsOnUser(userId);
    if (requested.has(userId)) return;
    requested.add(userId);
    void loadFromServer(userId).catch((error: unknown) => {
      requested.delete(userId);
      logger.warn("[weekStartsOn] load threw", error instanceof Error ? error.message : "unknown");
    });
  }, [userId]);

  return value;
}

/**
 * The preference plus a setter for the Settings screen. The change applies on
 * this device at once and is saved to the user's row; the result says whether
 * the save reached the server.
 */
export function useWeekStartsOnSetting(): {
  weekStartsOn: WeekStartsOn;
  setWeekStartsOn: (next: WeekStartsOn) => Promise<{ error: string | null }>;
  signedIn: boolean;
} {
  const { userId } = useAuth();
  const weekStartsOn = useWeekStartsOn();

  const setWeekStartsOn = useCallback(
    async (next: WeekStartsOn) => {
      setWeekStartsOnLocal(next, userId);
      if (!userId) return { error: null };
      const { error } = await supabase
        .from("user_preferences")
        .upsert(
          { user_id: userId, key: WEEK_STARTS_ON_PREF_KEY, value: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" },
        );
      if (error) {
        logger.warn("[weekStartsOn] save failed", { code: error.code });
        return { error: error.message };
      }
      return { error: null };
    },
    [userId],
  );

  return { weekStartsOn, setWeekStartsOn, signedIn: !!userId };
}
