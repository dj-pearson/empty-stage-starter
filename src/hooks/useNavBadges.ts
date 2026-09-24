/**
 * Live values for the navigation badges (item 33), computed once in the
 * Dashboard shell and handed to the sidebar, the bottom bar and More.
 *
 * Three of the four come from contexts the shell already reads (grocery, plan,
 * kids) and are memoized, so a render costs no network. The fourth, ladder
 * foods due today, is not in memory anywhere outside Food Tracker, so it is one
 * head-only count query per (user, kids, day), cached at module level so a
 * remount of the shell does not ask again. A logged tasting invalidates it,
 * since that is what moves a food's next due date.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGrocery, useKids, usePlan } from "@/contexts/AppContext";
import { useDefaultGroceryListId } from "@/hooks/useDefaultGroceryListId";
import { useExposureLadderFlag } from "@/hooks/useExposureLadderFlag";
import { selectTargetKids } from "@/hooks/useTonightPlan";
import { onFoodAttemptLogged } from "@/lib/foodAttemptHistory";
import { onLadderChanged } from "@/lib/ladderEvents";
import { logger } from "@/lib/logger";
import type { NavBadges } from "@/lib/navigation";
import { toISODate } from "@/lib/date-utils";
import {
  countBadge,
  countGroceryLeft,
  countPastDueUnlogged,
  isDinnerUnplanned,
  nextBadgeBoundary,
} from "@/lib/navBadges";

/** How long a cached ladder count is trusted before a remount reads again. */
export const LADDER_COUNT_TTL_MS = 5 * 60_000;

interface CachedCount {
  count: number;
  at: number;
}

const ladderCountCache = new Map<string, CachedCount>();
const ladderCountInflight = new Map<string, Promise<number | null>>();
/**
 * Bumped per key when the ladder changes. A read that started before the
 * change must not land in the cache as fresh: it counted the old ladder.
 */
const ladderCountGeneration = new Map<string, number>();

function invalidateLadderCount(key: string): void {
  ladderCountCache.delete(key);
  ladderCountInflight.delete(key);
  ladderCountGeneration.set(key, (ladderCountGeneration.get(key) ?? 0) + 1);
}

/** For tests, and for sign-out paths that want a clean slate. */
export function clearLadderDueCache(): void {
  ladderCountCache.clear();
  ladderCountInflight.clear();
  ladderCountGeneration.clear();
}

/**
 * Active ladder rows for `kidIds` due on or before `todayKey`: the same rows
 * groupLadder files under dueToday. Null when the read failed, so the badge
 * shows nothing rather than a confident zero.
 */
export async function fetchLadderDueCount(
  kidIds: readonly string[],
  todayKey: string
): Promise<number | null> {
  if (kidIds.length === 0) return 0;
  try {
    const { count, error } = await supabase
      .from("kid_food_ladder")
      .select("id", { count: "exact", head: true })
      .in("kid_id", [...kidIds])
      .eq("status", "active")
      .lte("next_due_on", todayKey);
    if (error) {
      logger.warn("Nav badge: ladder count failed", error);
      return null;
    }
    return count ?? 0;
  } catch (error) {
    logger.warn("Nav badge: ladder count failed", error);
    return null;
  }
}

function readLadderDueCount(key: string, kidIds: readonly string[], todayKey: string): Promise<number | null> {
  const inflight = ladderCountInflight.get(key);
  if (inflight) return inflight;
  const generation = ladderCountGeneration.get(key) ?? 0;
  const p = fetchLadderDueCount(kidIds, todayKey).then((count) => {
    if ((ladderCountGeneration.get(key) ?? 0) !== generation) return count;
    ladderCountInflight.delete(key);
    if (count !== null) ladderCountCache.set(key, { count, at: Date.now() });
    return count;
  });
  ladderCountInflight.set(key, p);
  return p;
}

function freshCached(key: string): number | undefined {
  const hit = ladderCountCache.get(key);
  if (!hit) return undefined;
  return Date.now() - hit.at < LADDER_COUNT_TTL_MS ? hit.count : undefined;
}

/** Milliseconds until the cached count for `key` goes stale (0 when it already is). */
function msUntilStale(key: string): number {
  const hit = ladderCountCache.get(key);
  return hit ? Math.max(0, hit.at + LADDER_COUNT_TTL_MS - Date.now()) : 0;
}

/**
 * Ladder foods due today for `kidIds`, or null while unknown. `enabled` false
 * (the exposure_ladder kill switch) skips the read entirely.
 */
export function useLadderDueCount(
  userId: string | null | undefined,
  kidIds: readonly string[],
  todayKey: string,
  enabled: boolean
): number | null {
  const idsKey = useMemo(() => [...new Set(kidIds)].sort().join(","), [kidIds]);
  const key = userId && enabled && idsKey ? `${userId}|${idsKey}|${todayKey}` : null;
  const [state, setState] = useState<{ key: string | null; count: number | null }>(() => ({
    key,
    count: key ? freshCached(key) ?? null : null,
  }));
  const [bump, setBump] = useState(0);

  // A logged tasting, or a ladder edit made on this device, moves
  // next_due_on or status; drop the cache (and any read already in flight,
  // which counted the old ladder) and read again.
  useEffect(() => {
    if (!key) return;
    const invalidate = () => {
      invalidateLadderCount(key);
      setBump((n) => n + 1);
    };
    const offAttempt = onFoodAttemptLogged(invalidate);
    const offLadder = onLadderChanged(invalidate);
    return () => {
      offAttempt();
      offLadder();
    };
  }, [key]);

  // Changes made on another device have no same-tab signal. Re-read when the
  // cached count goes stale while the shell stays mounted, and when the tab
  // is shown again with a stale count.
  useEffect(() => {
    if (!key || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && freshCached(key) === undefined) setBump((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [key]);

  useEffect(() => {
    if (!key) {
      setState({ key: null, count: null });
      return;
    }
    let cancelled = false;
    let staleTimer: number | undefined;
    const scheduleRefresh = () => {
      if (cancelled || !ladderCountCache.has(key)) return;
      staleTimer = window.setTimeout(() => setBump((n) => n + 1), msUntilStale(key) + 1);
    };
    const cached = freshCached(key);
    if (cached !== undefined) {
      setState({ key, count: cached });
      scheduleRefresh();
    } else {
      void readLadderDueCount(key, idsKey.split(","), todayKey).then((count) => {
        if (cancelled) return;
        setState({ key, count });
        scheduleRefresh();
      });
    }
    return () => {
      cancelled = true;
      if (staleTimer !== undefined) window.clearTimeout(staleTimer);
    };
  }, [key, idsKey, todayKey, bump]);

  // Never show one kid's (or yesterday's) count under another key.
  return state.key === key ? state.count : null;
}

/**
 * The clock, re-read only at the moments the past-due count can change: each
 * slot hour and midnight, plus whenever the tab is shown again. A per-minute
 * tick would re-render the whole shell sixty times an hour for a number that
 * changes five times a day.
 */
function useBadgeClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const delay = Math.max(1_000, nextBadgeBoundary(now).getTime() - Date.now() + 1_000);
    const id = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(id);
  }, [now]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return now;
}

export function useNavBadges(): NavBadges {
  const { userId } = useAuth();
  const { kids, activeKidId, kidsHydrated } = useKids();
  const { planEntries } = usePlan();
  const { groceryItems, groceryHydrated } = useGrocery();
  const defaultListId = useDefaultGroceryListId();
  const ladderEnabled = useExposureLadderFlag();
  const now = useBadgeClock();
  // From the badge clock, which ticks at midnight, so a tab left open and
  // visible overnight moves to the new day with everything else.
  const todayKey = useMemo(() => toISODate(now), [now]);

  // Same scope as Home and the Food Tracker: the picked kid, or everyone.
  const targetKids = useMemo(() => selectTargetKids(kids, activeKidId), [kids, activeKidId]);
  const targetKidIds = useMemo(() => targetKids.map((k) => k.id), [targetKids]);

  const groceryLeft = useMemo(
    () => (groceryHydrated ? countGroceryLeft(groceryItems, defaultListId) : 0),
    [groceryHydrated, groceryItems, defaultListId]
  );
  const dinnerUnplanned = useMemo(
    () => kidsHydrated && isDinnerUnplanned(planEntries, targetKids, todayKey),
    [kidsHydrated, planEntries, targetKids, todayKey]
  );
  const unlogged = useMemo(
    () => (kidsHydrated ? countPastDueUnlogged(planEntries, targetKids, now, todayKey) : 0),
    [kidsHydrated, planEntries, targetKids, now, todayKey]
  );
  const ladderDue = useLadderDueCount(userId, targetKidIds, todayKey, ladderEnabled);

  return useMemo<NavBadges>(() => {
    const out: NavBadges = {};
    const grocery = countBadge(groceryLeft);
    if (grocery) out.groceryLeft = grocery;
    if (dinnerUnplanned) out.dinnerUnplanned = { kind: "dot" };
    const meals = countBadge(unlogged);
    if (meals) out.unloggedMeals = meals;
    const ladder = countBadge(ladderDue ?? 0);
    if (ladder) out.ladderDue = ladder;
    return out;
  }, [groceryLeft, dinnerUnplanned, unlogged, ladderDue]);
}
