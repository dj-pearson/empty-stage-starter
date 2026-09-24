/**
 * Allergen rules for anything that puts food on a child's plan (item 29).
 *
 * - A suggestion or auto-generated plan never places a food that hits a
 *   target kid's allergy. Severe hits are the hard floor the owner set; mild
 *   and moderate hits are dropped from auto-plans too, because a generated
 *   week has nowhere to show a per-meal warning before it is written.
 * - A manual add of a hit asks first. A severe hit asks with the child and the
 *   allergen named in the title and on the button, so "Add anyway" is never a
 *   reflex click.
 *
 * Everything goes through findAllergenConflicts, so the planner guard, Quick
 * Build and the AI week agree with kidFit on what a hit is.
 *
 * Pure: no React, no Supabase.
 */
import type { Food, Kid, PlanEntry } from "@/types";
import { findAllergenConflicts, type AllergenConflict } from "./kidFit";

export type GuardKid = Pick<Kid, "id" | "name" | "allergens"> & Partial<Pick<Kid, "allergen_severity">>;

/** Every conflict for these kids and foods, severe ones first. */
export function allergenConflictsFor<K extends GuardKid>(
  kids: readonly K[],
  foodIds: readonly string[],
  foodById: ReadonlyMap<string, Food>,
): AllergenConflict<K>[] {
  const conflicts = findAllergenConflicts(kids, foodIds, foodById);
  return [
    ...conflicts.filter((c) => c.severity === "severe"),
    ...conflicts.filter((c) => c.severity !== "severe"),
  ];
}

export interface ManualAddPrompt<K extends GuardKid = GuardKid> {
  /** True when any conflict is a severe allergy; the confirm must name it. */
  severe: boolean;
  /** The first severe conflict, for the title and button text. */
  lead: AllergenConflict<K> | null;
  conflicts: AllergenConflict<K>[];
}

/**
 * What a manual add has to ask, or null when nothing conflicts and the add
 * can go straight through.
 */
export function manualAddPrompt<K extends GuardKid>(
  kids: readonly K[],
  foodIds: readonly string[],
  foodById: ReadonlyMap<string, Food>,
): ManualAddPrompt<K> | null {
  const conflicts = allergenConflictsFor(kids, foodIds, foodById);
  if (conflicts.length === 0) return null;
  const lead = conflicts.find((c) => c.severity === "severe") ?? null;
  return { severe: lead !== null, lead, conflicts };
}

type EntryLike = Pick<PlanEntry, "kid_id" | "food_id">;

/**
 * Drop generated entries whose food hits the kid's allergy. Used on the AI
 * week reply: the edge function filters too, but an older deployment or a
 * model reply naming a sibling's food must not reach the plan either way.
 */
export function dropAllergenEntries<E extends EntryLike, K extends GuardKid>(
  entries: readonly E[],
  kids: readonly K[],
  foodById: ReadonlyMap<string, Food>,
): { kept: E[]; dropped: AllergenConflict<K>[] } {
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const blocked = new Map<string, AllergenConflict<K>>();
  for (const kid of kids) {
    const ids = entries.filter((e) => e.kid_id === kid.id).map((e) => e.food_id);
    for (const c of findAllergenConflicts([kid], ids, foodById)) {
      blocked.set(`${kid.id}|${c.food.id}`, c);
    }
  }
  const kept: E[] = [];
  const dropped: AllergenConflict<K>[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const key = `${e.kid_id}|${e.food_id}`;
    const hit = kidById.has(e.kid_id) ? blocked.get(key) : undefined;
    if (!hit) {
      kept.push(e);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      dropped.push(hit);
    }
  }
  return { kept, dropped };
}
