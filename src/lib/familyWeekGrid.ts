/**
 * The desktop family week (item 2): one grid, one family dish per day and
 * slot, and under it each kid's line -- on the family dish, on a substitute,
 * or not planned -- with what kidFit knows about that kid and that dish.
 *
 * Pure. The grid component renders these; the rules live here so they are
 * tested once. Grouping per slot is groupSlot's (familySlot.ts), the same
 * reading FamilyMealCard uses on the phone, so both screens agree on what
 * "the family meal" is.
 */

import type { Food, Kid, MealSlot, PlanEntry, Recipe } from "@/types";
import { groupSlot, type GroupedSlot, type KidSlot } from "@/lib/familySlot";
import {
  buildResultIndex,
  getKidFoodFit,
  getKidRecipeFit,
  type KidFit,
  type ResultIndex,
} from "@/lib/kidFit";

export const cellKey = (date: string, slot: MealSlot): string => `${date}|${slot}`;

/**
 * The week's rows bucketed by `${date}|${slot}`, every kid included. One pass
 * over the plan, instead of a filter per cell.
 */
export function bucketWeek(
  planEntries: readonly PlanEntry[],
  dates: readonly string[],
): Map<string, PlanEntry[]> {
  const inWeek = new Set(dates);
  const out = new Map<string, PlanEntry[]>();
  for (const e of planEntries) {
    const date = typeof e.date === "string" ? e.date.slice(0, 10) : "";
    if (!inWeek.has(date)) continue;
    const k = cellKey(date, e.meal_slot);
    const list = out.get(k);
    if (list) list.push(e);
    else out.set(k, [e]);
  }
  return out;
}

/**
 * Per-kid outcome history, counting only what happened before `today`
 * (exclusive): a dinner planned for Friday is not a try yet.
 */
export function buildKidIndexes(
  planEntries: readonly PlanEntry[],
  kids: readonly Pick<Kid, "id">[],
  today: string,
): Map<string, ResultIndex> {
  const out = new Map<string, ResultIndex>();
  for (const kid of kids) out.set(kid.id, buildResultIndex(planEntries, kid.id, today));
  return out;
}

/** Fit of the dish keyed `key` (recipe id or food id) for one kid, or null when unknown. */
export function kidDishFit(
  kid: Kid,
  key: string | null,
  foodById: ReadonlyMap<string, Food>,
  recipeById: ReadonlyMap<string, Recipe>,
  index: ResultIndex,
): KidFit | null {
  if (!key) return null;
  const recipe = recipeById.get(key);
  if (recipe) return getKidRecipeFit(kid, recipe, foodById, index);
  const food = foodById.get(key);
  return food ? getKidFoodFit(kid, food, index) : null;
}

export type CellChipKind = "allergen" | "dislike" | "goTo" | "tryBite" | "history";

export interface CellChip {
  kind: CellChipKind;
  /** Canonical allergen, for "allergen". */
  allergen?: string;
  severe?: boolean;
  /** For "history": ate this many of `tries` logged offers. */
  ate?: number;
  tries?: number;
}

/**
 * At most two chips for one kid's line in a cell, most urgent first: an
 * allergen, a dislike, then the kid's go-to or a try bite, then how it went
 * before. A grid column is about 150px wide, so a third chip would wrap every
 * line in the week.
 */
export function cellFitChips(fit: KidFit | null, limit = 2): CellChip[] {
  if (!fit) return [];
  const chips: CellChip[] = [];
  if (fit.allergen) {
    chips.push({ kind: "allergen", allergen: fit.allergen, severe: fit.allergenSeverity === "severe" });
  }
  if (fit.disliked) chips.push({ kind: "dislike" });
  if (!fit.allergen && fit.alwaysEats) chips.push({ kind: "goTo" });
  else if (!fit.allergen && fit.tryBite) chips.push({ kind: "tryBite" });
  if (fit.tries > 0) chips.push({ kind: "history", ate: fit.ate, tries: fit.tries });
  return chips.slice(0, limit);
}

export type KidLineStatus = "family" | "substitute" | "unplanned";

export interface KidLine {
  kid: Kid;
  status: KidLineStatus;
  slot: KidSlot | undefined;
  /** The dish this kid is on: the family key, a substitute key, or null. */
  key: string | null;
  fit: KidFit | null;
}

export interface FamilyCell {
  group: GroupedSlot;
  lines: KidLine[];
  /** Kids on the family dish, whose rows a family move or remove acts on. */
  familyKidIds: string[];
  /** Every row of the family dish across those kids. */
  familyRowIds: string[];
  /** Everyone planned is on the family dish and at least one kid is planned. */
  everyoneShares: boolean;
}

/**
 * Read one cell for the family. Try-bite cells have no family dish: every
 * planned kid reads as their own line ("substitute"), because a try bite is
 * picked per child.
 */
export function readFamilyCell(
  entries: readonly PlanEntry[],
  slot: MealSlot,
  kids: readonly Kid[],
  foodById: ReadonlyMap<string, Food>,
  recipeById: ReadonlyMap<string, Recipe>,
  indexes: ReadonlyMap<string, ResultIndex>,
): FamilyCell {
  const group = groupSlot(entries);
  const tryBite = slot === "try_bite";
  const lines: KidLine[] = kids.map((kid) => {
    const ks = group.perKid.get(kid.id);
    const status: KidLineStatus = !ks
      ? "unplanned"
      : !tryBite && ks.key === group.familyKey
        ? "family"
        : "substitute";
    const key = ks?.key ?? null;
    const index = indexes.get(kid.id) ?? new Map();
    return { kid, status, slot: ks, key, fit: kidDishFit(kid, key, foodById, recipeById, index) };
  });
  const familyLines = lines.filter((l) => l.status === "family");
  const planned = lines.filter((l) => l.status !== "unplanned");
  return {
    group,
    lines,
    familyKidIds: familyLines.map((l) => l.kid.id),
    familyRowIds: familyLines.flatMap((l) => (l.slot ? l.slot.rows.map((r) => r.id) : [])),
    everyoneShares: !tryBite && planned.length > 0 && familyLines.length === kids.length,
  };
}

/** The drag payload type for plan row ids moved between cells. */
export const PLAN_IDS_MIME = "application/x-eatpal-plan-ids";

/** Plan row ids from a drop, or null when the payload is not ours. */
export function readDraggedIds(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((x): x is string => typeof x === "string" && x.length > 0)) return null;
    return parsed;
  } catch {
    return null;
  }
}
