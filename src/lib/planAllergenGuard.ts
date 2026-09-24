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
 * - An allergy recorded without a severity is severe for all of the above
 *   (owner decision 2026-09-24). The conflict's `severityRecorded` is false
 *   then, so the copy says "severity not recorded" instead of claiming the
 *   parent called it severe.
 *
 * Everything goes through findAllergenConflicts, so the planner guard, Quick
 * Build and the AI week agree with kidFit on what a hit is.
 *
 * Pure: no React, no Supabase.
 */
import type { Food, Kid, PlanEntry } from "@/types";
import {
  findAllergenConflicts,
  isConflictSeverityRecorded,
  isSevereConflict,
  type AllergenConflict,
} from "./kidFit";

export type GuardKid = Pick<Kid, "id" | "name" | "allergens"> & Partial<Pick<Kid, "allergen_severity">>;

/**
 * Which copy a conflict gets: "severe" when the parent recorded severe,
 * "severeUnrated" when they recorded the allergy with no severity (treated as
 * severe, but the copy must say the severity was not recorded), "plain" for
 * mild and moderate.
 */
export type AllergenCopyKind = "severe" | "severeUnrated" | "plain";

export function allergenCopyKind(
  conflict: Pick<AllergenConflict<Pick<Kid, "id" | "allergens">>, "severity" | "severityRecorded">,
): AllergenCopyKind {
  if (!isSevereConflict(conflict)) return "plain";
  return isConflictSeverityRecorded(conflict) ? "severe" : "severeUnrated";
}

/**
 * Every conflict for these kids and foods: recorded-severe first, then
 * unrated (treated as severe), then mild and moderate.
 */
export function allergenConflictsFor<K extends GuardKid>(
  kids: readonly K[],
  foodIds: readonly string[],
  foodById: ReadonlyMap<string, Food>,
): AllergenConflict<K>[] {
  const conflicts = findAllergenConflicts(kids, foodIds, foodById);
  const rank: Record<AllergenCopyKind, number> = { severe: 0, severeUnrated: 1, plain: 2 };
  // Array.prototype.sort is stable, so input order holds within a tier.
  return [...conflicts].sort((a, b) => rank[allergenCopyKind(a)] - rank[allergenCopyKind(b)]);
}

export interface ManualAddPrompt<K extends GuardKid = GuardKid> {
  /** True when any conflict is severe, recorded or unrated; the confirm must name it. */
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
  const lead = conflicts.find(isSevereConflict) ?? null;
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
