import { useState, useEffect, useRef, useCallback } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";
import { parseServerTimestamp, usageState } from "@/lib/usageState";

/**
 * get_usage_stats returns untyped JSON (types.ts says `Json`). Parse it rather
 * than cast it: a renamed key would otherwise render as "undefined of
 * undefined" instead of an error state. Unknown keys pass through, so an
 * additive server change does not break older builds.
 */
const meterSchema = z.object({
  current: z.number(),
  limit: z.number().nullable(),
  percentage: z.number(),
});

const quotaSchema = meterSchema.extend({
  resets_at: z.string(),
});

const usageStatsSchema = z.object({
  plan: z.object({
    name: z.string(),
    max_children: z.number().nullable(),
    max_pantry_foods: z.number().nullable(),
    ai_coach_daily_limit: z.number().nullable(),
    food_tracker_monthly_limit: z.number().nullable(),
    has_food_chaining: z.boolean().nullable().transform((v) => v ?? false),
    has_meal_builder: z.boolean().nullable().transform((v) => v ?? false),
    has_nutrition_tracking: z.boolean().nullable().transform((v) => v ?? false),
    is_complementary: z.boolean().optional(),
  }),
  usage: z.object({
    children: meterSchema,
    pantry_foods: meterSchema,
    ai_coach: quotaSchema,
    food_tracker: quotaSchema,
  }),
});

export type UsageStats = z.infer<typeof usageStatsSchema>;

/**
 * Why the last fetch failed: 'network' (offline, timeout, fetch rejected),
 * 'forbidden' (the RPC refused the caller, SQLSTATE 42501, or no session), or
 * 'unknown' (anything else, including a response that did not parse).
 */
export type UsageErrorCode = "network" | "forbidden" | "unknown";

export function parseUsageStats(data: unknown): UsageStats | null {
  const parsed = usageStatsSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function classifyError(err: unknown): UsageErrorCode {
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "";
  const message =
    err && typeof err === "object" && "message" in err && typeof err.message === "string"
      ? err.message
      : "";
  if (code === "42501" || code === "PGRST301" || /permission denied|not authenticated|may only be called/i.test(message)) {
    return "forbidden";
  }
  if (
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    err instanceof TypeError ||
    /failed to fetch|network|timeout|load failed/i.test(message)
  ) {
    return "network";
  }
  return "unknown";
}

class UsageStatsError extends Error {
  constructor(public readonly code: UsageErrorCode, message: string) {
    super(message);
  }
}

export function useUsageStats() {
  const { userId: authUserId } = useAuth();
  const [stats, setStats] = useState<UsageStats | null>(null);
  // `loading` is the first load only; `isRefreshing` covers every later one.
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<UsageErrorCode | null>(null);

  // Guard state writes: realtime fires fetchStats repeatedly, so ignore any
  // response that isn't the latest in-flight fetch (stale overwrite) or that
  // lands after unmount.
  const isMountedRef = useRef(true);
  const fetchSeqRef = useRef(0);
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resolveUserId = useCallback(async (): Promise<string | null> => {
    if (authUserId) return authUserId;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  }, [authUserId]);

  const fetchStats = useCallback(async (): Promise<void> => {
    const seq = ++fetchSeqRef.current;
    const apply = (fn: () => void) => {
      if (isMountedRef.current && seq === fetchSeqRef.current) fn();
    };
    apply(() => {
      setError(null);
      if (hasLoadedRef.current) setIsRefreshing(true);
    });
    try {
      const userId = await resolveUserId();
      if (!userId) {
        throw new UsageStatsError("forbidden", "Not authenticated");
      }

      const { data, error: rpcError } = await supabase.rpc("get_usage_stats", {
        p_user_id: userId,
      });

      if (rpcError) throw rpcError;

      const parsed = parseUsageStats(data);
      if (!parsed) {
        throw new UsageStatsError("unknown", "get_usage_stats returned an unexpected shape");
      }

      hasLoadedRef.current = true;
      apply(() => setStats(parsed));
    } catch (err) {
      logger.error("Error fetching usage stats:", err);
      // Keep the last good stats; the caller decides whether a stale meter
      // with an error beats no meter at all.
      apply(() => setError(err instanceof UsageStatsError ? err.code : classifyError(err)));
    } finally {
      apply(() => {
        setLoading(false);
        setIsRefreshing(false);
      });
    }
  }, [resolveUserId]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refetchSoon = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void fetchStats();
      }, 300);
    };

    void fetchStats();

    // Scope both realtime channels to THIS user's rows, so another user's usage
    // or billing change doesn't wake every connected client with a refetch.
    resolveUserId()
      .then((userId) => {
        if (cancelled || !userId) return;
        logger.debug('Subscribing to usage-updates');
        channel = supabase
          .channel(`usage-updates:${userId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "user_usage_tracking",
              filter: `user_id=eq.${userId}`,
            },
            refetchSoon
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "user_subscriptions",
              filter: `user_id=eq.${userId}`,
            },
            refetchSoon
          )
          .subscribe();
      })
      .catch((err: unknown) => logger.error("Error subscribing to usage-updates:", err));

    // A parent who left the tab open overnight comes back to today's count.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchStats();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisibility);
      logger.debug('Unsubscribing from usage-updates');
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchStats, resolveUserId]);

  // One timer, for the earliest reset (the AI coach's daily quota, normally),
  // so the meter drops back to zero at midnight UTC without a reload.
  const aiResetsAt = stats?.usage.ai_coach.resets_at ?? null;
  const trackerResetsAt = stats?.usage.food_tracker.resets_at ?? null;
  useEffect(() => {
    const times = [parseServerTimestamp(aiResetsAt), parseServerTimestamp(trackerResetsAt)]
      .filter((d): d is Date => d !== null)
      .map((d) => d.getTime());
    if (times.length === 0) return;
    const delay = Math.min(...times) - Date.now();
    // Already past (a clock skew or a stale response): the next visibility or
    // realtime event refetches; don't spin. setTimeout also caps near 24.8 days.
    if (delay <= 0 || delay > 2 ** 31 - 1) return;
    const timer = setTimeout(() => {
      void fetchStats();
    }, delay + 1000);
    return () => clearTimeout(timer);
  }, [aiResetsAt, trackerResetsAt, fetchStats]);

  const isAtLimit = (percentage: number) => percentage >= 100;

  return {
    stats,
    loading,
    isRefreshing,
    error,
    refetch: fetchStats,
    isAtLimit,
    /** Delegates to usageState, the one definition of near/full/over. */
    getUsageStatus: usageState,
  };
}
