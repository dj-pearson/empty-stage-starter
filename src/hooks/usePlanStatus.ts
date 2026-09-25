import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";
import { useSubscription, type Subscription } from "@/hooks/useSubscription";
import { useUsageStats, type UsageErrorCode, type UsageStats } from "@/hooks/useUsageStats";
import {
  isActiveApple,
  resolvePlanStatus,
  type AppleSubscriptionRow,
  type CompRow,
  type PlanStatus,
} from "@/lib/planSource";

export type { PlanStatus } from "@/lib/planSource";

export interface PlanStatusResult {
  status: PlanStatus;
  stats: UsageStats | null;
  subscription: Subscription | null;
  usageError: UsageErrorCode | null;
  refreshing: boolean;
  refetch: () => Promise<void>;
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return new Error(err.message);
  }
  return new Error("Failed to load App Store subscription");
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/**
 * The caller's own App Store row, plus the end date of an active comp.
 *
 * Both are read under RLS (auth.uid() = user_id) and only to label the plan
 * get_usage_stats already resolved: which biller, and when a comp ends.
 */
function useEntitlementRows() {
  const { userId: authUserId } = useAuth();
  const [appleRow, setAppleRow] = useState<AppleSubscriptionRow | null>(null);
  const [compRow, setCompRow] = useState<CompRow | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchRows = useCallback(async (): Promise<void> => {
    const seq = ++seqRef.current;
    const apply = (fn: () => void) => {
      if (mountedRef.current && seq === seqRef.current) fn();
    };
    apply(() => {
      setError(null);
      if (loadedRef.current) setRefreshing(true);
    });
    try {
      let userId = authUserId;
      if (!userId) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        userId = session?.user?.id ?? null;
      }
      if (!userId) {
        apply(() => {
          setAppleRow(null);
          setCompRow(null);
        });
        loadedRef.current = true;
        return;
      }

      const [apple, comp] = await Promise.all([
        supabase
          .from("apple_subscriptions")
          .select("id, status, expires_at, product_id")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("complementary_subscriptions")
          .select("end_date")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("end_date", { ascending: false, nullsFirst: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (apple.error) throw apple.error;
      // The comp end date is a label; a failure there is logged, not fatal.
      if (comp.error) logger.warn("Could not read complementary subscription end date:", comp.error);

      loadedRef.current = true;
      apply(() => {
        // A user can hold several rows (one per original transaction). Prefer
        // the one effective_plan_id would honour, else the newest.
        const rows = apple.data ?? [];
        setAppleRow(rows.find((r) => isActiveApple(r)) ?? rows[0] ?? null);
        setCompRow(comp.error ? null : (comp.data ?? null));
      });
    } catch (err) {
      logger.error("Error fetching App Store subscription:", err);
      apply(() => setError(toError(err)));
    } finally {
      apply(() => {
        setLoading(false);
        setRefreshing(false);
      });
    }
  }, [authUserId]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  return { appleRow, compRow, error, loading, refreshing, refetch: fetchRows };
}

/**
 * The plan EatPal enforces for the signed-in account and who bills it, as one
 * PlanStatus. Read-only: it never writes, and it never calls an edge function.
 */
export function usePlanStatus(): PlanStatusResult {
  const sub = useSubscription();
  const usage = useUsageStats();
  const entitlement = useEntitlementRows();
  const online = useOnline();

  const { refetch: refetchSub } = sub;
  const { refetch: refetchUsage } = usage;
  const { refetch: refetchRows } = entitlement;

  const refetch = useCallback(async (): Promise<void> => {
    await Promise.all([refetchSub(), refetchUsage(), refetchRows()]);
  }, [refetchSub, refetchUsage, refetchRows]);

  const loading = sub.loading || usage.loading || entitlement.loading;

  const status = useMemo(
    () =>
      loading
        ? ({ kind: "loading" } as const)
        : resolvePlanStatus({
            stats: usage.stats,
            subscription: sub.subscription,
            appleRow: entitlement.appleRow,
            compRow: entitlement.compRow,
            subError: sub.error,
            usageError: usage.error,
            appleError: entitlement.error,
            loading: false,
            online,
          }),
    [
      loading,
      usage.stats,
      usage.error,
      sub.subscription,
      sub.error,
      entitlement.appleRow,
      entitlement.compRow,
      entitlement.error,
      online,
    ]
  );

  return {
    status,
    stats: usage.stats,
    subscription: sub.subscription,
    usageError: usage.error,
    refreshing: sub.refreshing || usage.isRefreshing || entitlement.refreshing,
    refetch,
  };
}
