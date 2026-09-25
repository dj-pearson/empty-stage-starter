/**
 * The numbers behind the navigation badges (item 33).
 *
 * Pure: no React, no Supabase. Each function reads state the app already holds
 * (grocery items, plan entries, the clock), so the shell can recompute them on
 * every context change without a network request. The one number that is not
 * in memory, ladder foods due today, is fetched by useNavBadges and only
 * formatted here.
 *
 * Every rule mirrors the screen the badge points at, so the badge and the page
 * never disagree:
 *  - Grocery counts what Home's "left to buy" counts (filterItemsByList on the
 *    default list, unchecked only).
 *  - Home counts slots todayPlan.slotStatus calls 'due': planned for today,
 *    past their hour, no result.
 *  - Food Tracker counts what ladderOverview.groupLadder files under dueToday.
 */

import type { GroceryItem, Kid, MealSlot, PlanEntry } from "@/types";
import { filterItemsByList } from "@/lib/groceryData";
import { SLOT_HOURS, buildTodayPlan, slotStatus } from "@/lib/todayPlan";
import type { NavBadgeValue } from "@/lib/navigation";

/** Unchecked items on the default list. Null-list rows belong to the default. */
export function countGroceryLeft(
  items: readonly GroceryItem[],
  defaultListId: string | null
): number {
  return filterItemsByList([...items], defaultListId, defaultListId).filter((i) => !i.checked).length;
}

/**
 * True when none of `kids` has a dinner planned for `todayKey`. With no kids
 * there is nothing to plan for yet, and Home's setup checklist says so; a dot
 * here would be a second voice saying the same thing less clearly.
 */
export function isDinnerUnplanned(
  planEntries: readonly PlanEntry[],
  kids: readonly Pick<Kid, "id">[],
  todayKey: string
): boolean {
  if (kids.length === 0) return false;
  const kidIds = new Set(kids.map((k) => k.id));
  return !planEntries.some(
    (e) => e.meal_slot === "dinner" && kidIds.has(e.kid_id) && String(e.date ?? "").slice(0, 10) === todayKey
  );
}

/**
 * Today's meals, per kid and slot, whose hour has passed with no result.
 * try_bite is left out: it is due all day, so it is never past due, and the
 * Today list already gives it a row.
 */
export function countPastDueUnlogged(
  planEntries: readonly PlanEntry[],
  kids: readonly Pick<Kid, "id">[],
  now: Date,
  todayKey: string
): number {
  const today = buildTodayPlan(planEntries, kids, todayKey);
  let count = 0;
  for (const slots of today.byKid.values()) {
    for (const [slot, dish] of Object.entries(slots) as [MealSlot, (typeof slots)[MealSlot]][]) {
      if (!dish || slot === "try_bite") continue;
      if (slotStatus(dish.primary, slot, now) === "due") count += 1;
    }
  }
  return count;
}

/**
 * When the past-due count can next change on its own: the next slot hour
 * today, or the next local midnight. The shell sets one timer for that instant
 * instead of re-rendering on a per-minute tick.
 */
export function nextBadgeBoundary(now: Date): Date {
  const hours = Object.values(SLOT_HOURS).sort((a, b) => a - b);
  for (const h of hours) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0, 0);
    if (at.getTime() > now.getTime()) return at;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

/** A count badge, or nothing for zero. */
export function countBadge(count: number): NavBadgeValue | undefined {
  return count > 0 ? { kind: "count", count } : undefined;
}

/** What a count badge shows. Past 99 the exact figure stops being useful at badge size. */
export function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
