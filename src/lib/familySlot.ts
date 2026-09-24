import type { PlanEntry } from "@/types";

/**
 * One (date, slot) of the family plan, read per kid.
 *
 * A recipe lands as one row per food, so a kid eating "Mac and cheese" has
 * three or four rows in the slot, one of them flagged is_primary_dish. The
 * mobile planner used to derive "what is the family eating" twice, in two
 * different ways (MobileMealPlanner counted rows and returned a food_id,
 * FamilyMealCard deduped and returned a recipe), so the card could say
 * "Mac and cheese" while a change or "eat with family" acted on the pasta row
 * alone. Everything that needs the answer now reads it from here.
 */

export type FamilyTargetKind = "recipe" | "food";

export interface FamilyTarget {
  kind: FamilyTargetKind;
  id: string;
}

export interface KidSlot {
  /** recipe_id ?? food_id of the dish this kid is eating. */
  key: string;
  /** This kid's rows that belong to that dish. */
  rows: PlanEntry[];
  /** The row outcomes are logged on: the primary dish when there is one. */
  primary: PlanEntry;
  /** Every row this kid has in the slot, including strays under other keys. */
  allRows: PlanEntry[];
}

export interface GroupedSlot {
  /** The dish most kids share, or null for an empty slot. */
  familyKey: string | null;
  familyTarget: FamilyTarget | null;
  perKid: Map<string, KidSlot>;
}

/** A recipe row is keyed by its recipe, a plain food row by its food. */
export function entryKey(entry: PlanEntry): string {
  return entry.recipe_id || entry.food_id;
}

export function entryTarget(entry: PlanEntry): FamilyTarget {
  return entry.recipe_id
    ? { kind: "recipe", id: entry.recipe_id }
    : { kind: "food", id: entry.food_id };
}

/**
 * Deterministic "which row speaks for this kid": the flagged primary dish,
 * then any recipe row, then the lowest id. Input order is not trusted,
 * because realtime and a server load deliver the same rows in different
 * orders and the card must not flip between them.
 */
function comparePrimary(a: PlanEntry, b: PlanEntry): number {
  const ap = a.is_primary_dish ? 1 : 0;
  const bp = b.is_primary_dish ? 1 : 0;
  if (ap !== bp) return bp - ap;
  const ar = a.recipe_id ? 1 : 0;
  const br = b.recipe_id ? 1 : 0;
  if (ar !== br) return br - ar;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function groupSlot(entries: readonly PlanEntry[]): GroupedSlot {
  const byKid = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    const list = byKid.get(e.kid_id);
    if (list) list.push(e);
    else byKid.set(e.kid_id, [e]);
  }

  const perKid = new Map<string, KidSlot>();
  const counts = new Map<string, { n: number; target: FamilyTarget; order: number }>();
  let order = 0;
  for (const [kidId, rows] of byKid) {
    const primary = [...rows].sort(comparePrimary)[0];
    const key = entryKey(primary);
    perKid.set(kidId, {
      key,
      rows: rows.filter((r) => entryKey(r) === key),
      primary,
      allRows: rows,
    });
    const c = counts.get(key);
    if (c) c.n += 1;
    else counts.set(key, { n: 1, target: entryTarget(primary), order: order++ });
  }

  // Most kids wins; a tie goes to a recipe (it is the "meal" the others are
  // substitutes for), then to whichever kid came first.
  let best: { key: string; n: number; target: FamilyTarget; order: number } | null = null;
  for (const [key, c] of counts) {
    if (
      !best ||
      c.n > best.n ||
      (c.n === best.n && c.target.kind === "recipe" && best.target.kind !== "recipe") ||
      (c.n === best.n && c.target.kind === best.target.kind && c.order < best.order)
    ) {
      best = { key, ...c };
    }
  }

  return {
    familyKey: best?.key ?? null,
    familyTarget: best?.target ?? null,
    perKid,
  };
}

/** True when the kid has a plan in the slot that is not the family dish. */
export function isSubstitute(group: GroupedSlot, kidId: string): boolean {
  const slot = group.perKid.get(kidId);
  return !!slot && group.familyKey !== null && slot.key !== group.familyKey;
}

/** Kids (of `kidIds`) currently eating the family dish. */
export function kidsOnFamilyMeal(group: GroupedSlot, kidIds: readonly string[]): string[] {
  return kidIds.filter((id) => {
    const slot = group.perKid.get(id);
    return !!slot && slot.key === group.familyKey;
  });
}
