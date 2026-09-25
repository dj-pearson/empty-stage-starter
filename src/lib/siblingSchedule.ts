/**
 * US-718: turning a sibling-solver answer into something the planner can hold.
 *
 * "Use this meal" used to call addPlanEntry with `food_id: ''`. plan_entries
 * .food_id is a NOT NULL uuid, so an empty string is not a missing value -- it
 * is an invalid one, and the insert was rejected every time. Before US-717 the
 * context then appended a locally-generated row anyway, so the meal appeared on
 * the planner, was written to the localStorage backup, and existed nowhere
 * else.
 *
 * A solver result names a RECIPE, not a food, so there is no food_id to send.
 * The recipe is scheduled through schedule_recipe_to_plan, which expands the
 * recipe's own foods into real rows, once per child.
 */

import type { Food } from '@/types';
import type { KidPlate } from '@/lib/platePlanner';
import {
  allergenConflictsFor,
  allergenCopyKind,
  type AllergenCopyKind,
  type GuardKid,
} from '@/lib/planAllergenGuard';
import { isSevereConflict } from '@/lib/kidFit';

export interface SiblingScheduleRequest {
  p_kid_id: string;
  p_recipe_id: string;
  p_date: string;
  p_meal_slot: string;
}

export type SiblingScheduleFailure = 'no_date' | 'no_kids' | 'no_recipe';

export type SiblingScheduleRequestsResult =
  | { ok: true; requests: SiblingScheduleRequest[] }
  | { ok: false; reason: SiblingScheduleFailure };

/**
 * One RPC payload per child, or the reason there is nothing to send: no
 * recipe (blank id), no date or slot, or no usable child id. Blank and
 * repeated kid ids are dropped rather than sent.
 */
export function buildSiblingScheduleRequestsResult(args: {
  recipeId: string | null | undefined;
  kidIds: Array<string | null | undefined>;
  date: string;
  mealSlot: string;
}): SiblingScheduleRequestsResult {
  const { recipeId, kidIds, date, mealSlot } = args;
  if (!recipeId || !recipeId.trim()) return { ok: false, reason: 'no_recipe' };
  if (!date || !mealSlot) return { ok: false, reason: 'no_date' };

  const seen = new Set<string>();
  const requests: SiblingScheduleRequest[] = [];

  for (const kidId of kidIds) {
    if (!kidId || !kidId.trim()) continue;
    if (seen.has(kidId)) continue;
    seen.add(kidId);
    requests.push({
      p_kid_id: kidId,
      p_recipe_id: recipeId,
      p_date: date,
      p_meal_slot: mealSlot,
    });
  }

  if (requests.length === 0) return { ok: false, reason: 'no_kids' };
  return { ok: true, requests };
}

/**
 * One RPC payload per child. Returns an empty list rather than a bad payload
 * when there is nothing schedulable; use buildSiblingScheduleRequestsResult to
 * learn which of recipe, date/slot or children was missing.
 */
export function buildSiblingScheduleRequests(args: {
  recipeId: string | null | undefined;
  kidIds: Array<string | null | undefined>;
  date: string;
  mealSlot: string;
}): SiblingScheduleRequest[] {
  const out = buildSiblingScheduleRequestsResult(args);
  return out.ok ? out.requests : [];
}

export interface SiblingScheduleBlock<K extends GuardKid = GuardKid> {
  kid: K;
  /** Canonical allergen, when an allergen is why the child was removed. */
  allergen?: string;
  /** Copy for an allergen block; absent for a plate that is empty or cannot be served. */
  copyKind?: AllergenCopyKind;
  cause: 'allergen' | 'plate_blocked' | 'plate_empty';
}

export interface SiblingScheduleGuardResult<K extends GuardKid = GuardKid> {
  /** Kids it is safe to put this recipe on the plan for, in input order. */
  schedule: string[];
  /** One entry per removed kid, worst reason first. */
  blocked: SiblingScheduleBlock<K>[];
  /** The recipe has no food_ids, so schedule_recipe_to_plan would raise 'Recipe has no foods'. */
  noFoods: boolean;
}

/**
 * The last check before a sibling pick is written to the plan, run on the
 * kids it is about to be written for (not the kids it was solved for, which
 * can differ once a chip is toggled).
 *
 * Uses allergenConflictsFor, the matcher behind the planner grid's badges, so
 * the guard and the grid cannot disagree about a hit. A severe or unrated
 * conflict removes the child; mild and moderate stay (the plate note says
 * what to hold back). A plate that is blocked or empty removes the child too.
 */
export function siblingScheduleGuard<K extends GuardKid>(args: {
  kids: readonly K[];
  recipeFoodIds: readonly string[] | null | undefined;
  foodById: ReadonlyMap<string, Food>;
  plates?: readonly KidPlate[] | null;
}): SiblingScheduleGuardResult<K> {
  const foodIds = args.recipeFoodIds ?? [];
  const blockedByKid = new Map<string, SiblingScheduleBlock<K>>();

  // Sorted recorded-severe, then unrated, then mild/moderate, so the first
  // severe conflict per kid is the one to name.
  for (const c of allergenConflictsFor(args.kids, foodIds, args.foodById)) {
    if (!isSevereConflict(c)) continue;
    if (blockedByKid.has(c.kid.id)) continue;
    blockedByKid.set(c.kid.id, {
      kid: c.kid,
      allergen: c.allergen,
      copyKind: allergenCopyKind(c),
      cause: 'allergen',
    });
  }

  const plateByKid = new Map((args.plates ?? []).map((p) => [p.kidId, p]));
  for (const kid of args.kids) {
    if (blockedByKid.has(kid.id)) continue;
    const plate = plateByKid.get(kid.id);
    if (!plate) continue;
    if (plate.blocked) {
      const by = plate.blockedBy;
      blockedByKid.set(kid.id, {
        kid,
        ...(by?.kind === 'severe_allergen' ? { copyKind: by.copyKind } : {}),
        cause: 'plate_blocked',
      });
    } else if (plate.isEmpty) {
      blockedByKid.set(kid.id, { kid, cause: 'plate_empty' });
    }
  }

  const schedule: string[] = [];
  const seen = new Set<string>();
  for (const kid of args.kids) {
    if (seen.has(kid.id)) continue;
    seen.add(kid.id);
    if (!blockedByKid.has(kid.id)) schedule.push(kid.id);
  }

  return {
    schedule,
    // Insertion order: recorded-severe allergens, unrated, then plate blocks.
    blocked: [...blockedByKid.values()],
    noFoods: foodIds.length === 0,
  };
}
