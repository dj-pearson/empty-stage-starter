import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface UsageStats {
  plan: {
    name: string;
    max_children: number | null;
    max_pantry_foods: number | null;
    ai_coach_daily_limit: number | null;
    food_tracker_monthly_limit: number | null;
    has_food_chaining: boolean;
    has_meal_builder: boolean;
    has_nutrition_tracking: boolean;
    is_complementary?: boolean;
  };
  usage: {
    children: {
      current: number;
      limit: number | null;
      percentage: number;
    };
    pantry_foods: {
      current: number;
      limit: number | null;
      percentage: number;
    };
    ai_coach: {
      current: number;
      limit: number | null;
      percentage: number;
      resets_at: string;
    };
    food_tracker: {
      current: number;
      limit: number | null;
      percentage: number;
      resets_at: string;
    };
  };
}

export function useUsageStats() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guard state writes: realtime fires fetchStats repeatedly, so ignore any
  // response that isn't the latest in-flight fetch (stale overwrite) or that
  // lands after unmount.
  const isMountedRef = useRef(true);
  const fetchSeqRef = useRef(0);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchStats = async () => {
    const seq = ++fetchSeqRef.current;
    const apply = (fn: () => void) => {
      if (isMountedRef.current && seq === fetchSeqRef.current) fn();
    };
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      // @ts-expect-error - RPC function exists but not in generated types
      const { data, error: rpcError } = await supabase.rpc("get_usage_stats", {
        p_user_id: user.id,
      });

      if (rpcError) throw rpcError;

      apply(() => setStats(data as unknown as UsageStats));
    } catch (err) {
      logger.error("Error fetching usage stats:", err);
      apply(() =>
        setError(err instanceof Error ? err.message : "Failed to fetch usage stats"),
      );
    } finally {
      apply(() => setLoading(false));
    }
  };

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    fetchStats();

    // Scope both realtime channels to THIS user's rows, so another user's usage
    // or billing change doesn't wake every connected client with a refetch.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      logger.debug('Subscribing to usage-updates');
      channel = supabase
        .channel(`usage-updates:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_usage_tracking",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchStats();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_subscriptions",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchStats();
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      logger.debug('Unsubscribing from usage-updates');
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const isNearLimit = (percentage: number) => percentage >= 75;
  const isAtLimit = (percentage: number) => percentage >= 100;

  const getUsageColor = (percentage: number) => {
    if (percentage >= 100) return "destructive";
    if (percentage >= 90) return "warning";
    if (percentage >= 75) return "caution";
    return "success";
  };

  const getUsageStatus = (current: number, limit: number | null) => {
    if (limit === null) return "unlimited";
    if (current >= limit) return "limit_reached";
    if (current / limit >= 0.9) return "approaching_limit";
    if (current / limit >= 0.75) return "near_limit";
    return "ok";
  };

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
    isNearLimit,
    isAtLimit,
    getUsageColor,
    getUsageStatus,
  };
}

