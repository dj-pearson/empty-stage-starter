/**
 * Today's plan, read per kid and per slot, for the home screen.
 *
 * A recipe lands as one plan row per food, so "Mac and cheese for dinner" is
 * three or four rows for each kid. The old TodayMeals card read a
 * `food_ids` field PlanEntry does not have and so never showed anything; the
 * hero and the Today list now read the day from here, where every slot is
 * grouped by familySlot.groupSlot and speaks through its primary row, which is
 * the one an outcome is logged on.
 *
 * Pure: no React, no Supabase. Dates are local 'YYYY-MM-DD' keys, never
 * toISOString(), which shifts the day for anyone west of UTC in the evening.
 */

import type { Kid, MealResult, MealSlot, PlanEntry } from "@/types";
import { groupSlot, isSubstitute as isSubstituteOf, type GroupedSlot } from "@/lib/familySlot";
import { addIsoDays, toISODate } from "@/lib/date-utils";

/** The hour (local, 24h) a slot becomes due. try_bite has none: it is due all day. */
export const SLOT_HOURS: Readonly<Record<Exclude<MealSlot, "try_bite">, number>> = {
  breakfast: 7,
  snack1: 10,
  lunch: 12,
  snack2: 15,
  dinner: 18,
};

/** Slots in the order a day runs. */
export const DAY_SLOTS: readonly MealSlot[] = ["breakfast", "snack1", "lunch", "snack2", "dinner", "try_bite"];

export type SlotStatus = "not_planned" | "upcoming" | "due" | "ate" | "tasted" | "refused";

export interface TodayDish {
  kidId: string;
  slot: MealSlot;
  /** recipe_id ?? food_id of what this kid is eating in the slot. */
  dishKey: string;
  recipeId: string | null;
  /** Food ids of this kid's rows for the dish, in row order, deduped. */
  foodIds: string[];
  /** The row an outcome is logged on. */
  primaryEntryId: string;
  primary: PlanEntry;
  /** This kid is on a different dish from the one most of the family shares. */
  isSubstitute: boolean;
  result: MealResult;
}

export interface TodayPlan {
  todayKey: string;
  /** kid id -> slot -> dish. Every kid passed in has an entry, possibly empty. */
  byKid: Map<string, Partial<Record<MealSlot, TodayDish>>>;
  /** The grouped slot, for callers that want the family dish. */
  slots: Map<MealSlot, GroupedSlot>;
}

const dateKey = (value: string | null | undefined): string =>
  typeof value === "string" ? value.slice(0, 10) : "";

function slotHour(slot: MealSlot): number | null {
  return slot === "try_bite" ? null : SLOT_HOURS[slot] ?? null;
}

/**
 * Where a slot stands for one kid right now. A recorded result wins; with none,
 * a slot is 'upcoming' before its hour and 'due' from it on. try_bite is due
 * all day. `now` is only consulted for the hour: callers pass today's entry.
 */
export function slotStatus(
  entry: Pick<PlanEntry, "result"> | undefined | null,
  slot: MealSlot,
  now: Date,
): SlotStatus {
  if (!entry) return "not_planned";
  if (entry.result === "ate" || entry.result === "tasted" || entry.result === "refused") return entry.result;
  const hour = slotHour(slot);
  if (hour === null) return "due";
  return now.getHours() >= hour ? "due" : "upcoming";
}

function dishFrom(group: GroupedSlot, kidId: string, slot: MealSlot): TodayDish | null {
  const kidSlot = group.perKid.get(kidId);
  if (!kidSlot) return null;
  const foodIds: string[] = [];
  for (const row of kidSlot.rows) {
    if (row.food_id && !foodIds.includes(row.food_id)) foodIds.push(row.food_id);
  }
  return {
    kidId,
    slot,
    dishKey: kidSlot.key,
    recipeId: kidSlot.primary.recipe_id ?? null,
    foodIds,
    primaryEntryId: kidSlot.primary.id,
    primary: kidSlot.primary,
    isSubstitute: isSubstituteOf(group, kidId),
    result: kidSlot.primary.result ?? null,
  };
}

function bucketBySlot(entries: readonly PlanEntry[]): Map<MealSlot, PlanEntry[]> {
  const out = new Map<MealSlot, PlanEntry[]>();
  for (const e of entries) {
    const list = out.get(e.meal_slot);
    if (list) list.push(e);
    else out.set(e.meal_slot, [e]);
  }
  return out;
}

/**
 * Today's plan for `kids`. Entries for other dates, and for kids not in the
 * list, are ignored; so a sibling who is not being shown cannot decide which
 * dish counts as the family's.
 */
export function buildTodayPlan(
  planEntries: readonly PlanEntry[],
  kids: readonly Pick<Kid, "id">[],
  todayKey: string,
): TodayPlan {
  const kidIds = new Set(kids.map((k) => k.id));
  const todays = planEntries.filter((e) => dateKey(e.date) === todayKey && kidIds.has(e.kid_id));

  const byKid = new Map<string, Partial<Record<MealSlot, TodayDish>>>();
  for (const k of kids) byKid.set(k.id, {});

  const slots = new Map<MealSlot, GroupedSlot>();
  for (const [slot, rows] of bucketBySlot(todays)) {
    const group = groupSlot(rows);
    slots.set(slot, group);
    for (const kidId of group.perKid.keys()) {
      const dish = dishFrom(group, kidId, slot);
      const record = byKid.get(kidId);
      if (dish && record) record[slot] = dish;
    }
  }

  return { todayKey, byKid, slots };
}

export interface UnloggedMeal extends TodayDish {
  /** Local date key of the meal. */
  date: string;
}

/**
 * The most recent meal that has already happened and has no outcome, for the
 * "how did it go?" row. Looks back `lookbackDays` days before today (default:
 * yesterday), since asking about last Tuesday's lunch is noise. Try-bites are
 * left out: the Today list has a row of their own for them.
 *
 * Ordering: newest date first, then the later slot of the day, so at 19:00
 * dinner is asked about before lunch, and this morning's breakfast before
 * last night's dinner.
 */
export function lastUnloggedEntry(
  planEntries: readonly PlanEntry[],
  kidIds: readonly string[],
  now: Date,
  lookbackDays = 1,
): UnloggedMeal | null {
  const todayKey = toISODate(now);
  const earliest = addIsoDays(todayKey, -Math.max(0, lookbackDays));
  const wanted = new Set(kidIds);

  const byDateSlot = new Map<string, PlanEntry[]>();
  for (const e of planEntries) {
    if (!wanted.has(e.kid_id) || e.meal_slot === "try_bite") continue;
    const d = dateKey(e.date);
    if (!d || d > todayKey || d < earliest) continue;
    const key = `${d}|${e.meal_slot}`;
    const list = byDateSlot.get(key);
    if (list) list.push(e);
    else byDateSlot.set(key, [e]);
  }

  let best: UnloggedMeal | null = null;
  let bestRank = "";
  for (const [key, rows] of byDateSlot) {
    const [date, slotRaw] = key.split("|");
    const slot = slotRaw as MealSlot;
    const group = groupSlot(rows);
    // Kids in the order they were passed, so ties resolve the same way each render.
    for (const kidId of kidIds) {
      const dish = dishFrom(group, kidId, slot);
      if (!dish || dish.result) continue;
      if (date === todayKey && slotStatus(dish.primary, slot, now) !== "due") continue;
      const hour = String(slotHour(slot) ?? 0).padStart(2, "0");
      const rank = `${date}|${hour}`;
      if (!best || rank > bestRank) {
        best = { ...dish, date };
        bestRank = rank;
      }
    }
  }
  return best;
}
