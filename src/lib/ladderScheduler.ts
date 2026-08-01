/**
 * Adaptive Exposure Ladder — scheduler (US-599).
 *
 * Pure module. Decides which of a child's ladder foods should actually reach
 * a plate on a given day, and which trusted food each one is served beside.
 *
 * Design constraints, in priority order:
 *
 *   1. Never over-serve. At most MAX_ACTIVE_EXPOSURES foods per kid per day
 *      and never two in the same meal slot. A plate with three new foods on
 *      it is not an exposure, it is an ambush.
 *   2. Never serve an exposure bare. Every exposure goes out next to a food
 *      the child already trusts. If no anchor is available for that slot the
 *      exposure is skipped, not downgraded.
 *   3. Never contradict the child's own signals — allergens are hard
 *      exclusions; disliked textures push a food down the queue.
 *
 * The scheduler only *selects*; writing to plan_entries is the caller's job,
 * using the existing plan_entries shape. No schema change.
 */

import type { Rung } from './exposureLadder';

export type SchedulerMealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack1' | 'snack2';

/** Slots an exposure may be placed in, in the order we prefer to fill them. */
export const SCHEDULABLE_SLOTS: SchedulerMealSlot[] = [
  'lunch',
  'dinner',
  'snack1',
  'breakfast',
  'snack2',
];

/** Hard ceiling on exposures per kid per day. Mirrored by a DB trigger. */
export const MAX_ACTIVE_EXPOSURES = 3;

export interface SchedulableLadderRow {
  id: string;
  kidId: string;
  foodId: string;
  currentRung: Rung;
  status: 'active' | 'paused' | 'mastered' | 'backed_off';
  /** ISO date 'YYYY-MM-DD', or null when nothing is scheduled. */
  nextDueOn: string | null;
  pairedSafeFoodId: string | null;
  preferredMealSlot: string | null;
  preferredPrep: string | null;
}

export interface SchedulerFood {
  id: string;
  name: string;
  isSafe: boolean;
  allergens: string[];
  /** food_properties.texture_primary, when known. */
  texturePrimary: string | null;
}

export interface SchedulerKid {
  id: string;
  allergens: string[];
  textureDislikes: string[];
  /** Slots the parent has marked as stressful. Never used for exposures. */
  stressfulSlots: string[];
  /** True when the parent has paused everything for this child (US-602). */
  laddersPaused: boolean;
}

export interface SchedulerContext {
  /** ISO date 'YYYY-MM-DD' being scheduled. */
  date: string;
  kid: SchedulerKid;
  foodsById: Map<string, SchedulerFood>;
  /**
   * Per-food acceptance rate (0..1) from attempt history, used to pick the
   * strongest available anchor. Missing entries are treated as unproven.
   */
  successRateByFoodId?: Map<string, number>;
  /** Slots already committed for this kid/date, which we will not double-book. */
  occupiedSlots?: string[];
}

export interface ScheduledExposure {
  ladderRowId: string;
  kidId: string;
  foodId: string;
  rung: Rung;
  mealSlot: SchedulerMealSlot;
  /** The trusted food this exposure is served beside. Never null. */
  anchorFoodId: string;
  preferredPrep: string | null;
}

export interface SkippedExposure {
  ladderRowId: string;
  foodId: string;
  reason:
    | 'not_active'
    | 'not_due'
    | 'kid_paused'
    | 'allergen_conflict'
    | 'no_anchor_available'
    | 'no_slot_available'
    | 'daily_cap_reached';
}

export interface SchedulerResult {
  scheduled: ScheduledExposure[];
  skipped: SkippedExposure[];
}

function lower(values: string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map((v) => v.toLowerCase().trim()).filter(Boolean));
}

/** True when a food carries any allergen the child reacts to. */
export function hasAllergenConflict(food: SchedulerFood, kid: SchedulerKid): boolean {
  const kidAllergens = lower(kid.allergens);
  if (kidAllergens.size === 0) return false;
  const foodAllergens = lower(food.allergens);
  for (const allergen of foodAllergens) {
    if (kidAllergens.has(allergen)) return true;
  }
  return false;
}

/** True when the food's primary texture is one the child has told us they dislike. */
export function hasDislikedTexture(food: SchedulerFood, kid: SchedulerKid): boolean {
  if (!food.texturePrimary) return false;
  return lower(kid.textureDislikes).has(food.texturePrimary.toLowerCase().trim());
}

/**
 * Pick the trusted food an exposure is served beside.
 *
 * Preference order: the explicitly paired anchor, then the safe food with the
 * strongest observed acceptance. Anything that conflicts with the child's
 * allergens is excluded outright, including an explicitly paired anchor —
 * a stale pairing must never outrank an allergen.
 */
export function selectAnchor(
  row: SchedulableLadderRow,
  ctx: SchedulerContext
): string | null {
  const { kid, foodsById } = ctx;
  const successRate = ctx.successRateByFoodId ?? new Map<string, number>();

  if (row.pairedSafeFoodId) {
    const paired = foodsById.get(row.pairedSafeFoodId);
    if (paired && !hasAllergenConflict(paired, kid)) {
      return paired.id;
    }
  }

  const candidates = [...foodsById.values()].filter(
    (food) =>
      food.isSafe &&
      food.id !== row.foodId &&
      !hasAllergenConflict(food, kid) &&
      !hasDislikedTexture(food, kid)
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const rateDelta = (successRate.get(b.id) ?? 0) - (successRate.get(a.id) ?? 0);
    if (rateDelta !== 0) return rateDelta;
    // Deterministic tiebreak so the same day always produces the same plan.
    return a.id.localeCompare(b.id);
  });

  return candidates[0].id;
}

/**
 * Choose the exposures to place on a given date.
 *
 * Returns both what was scheduled and what was skipped with a reason — the UI
 * needs to be able to say "nothing today because everything is resting"
 * rather than rendering an unexplained empty plan.
 */
export function selectDueExposures(
  rows: SchedulableLadderRow[],
  ctx: SchedulerContext
): SchedulerResult {
  const scheduled: ScheduledExposure[] = [];
  const skipped: SkippedExposure[] = [];

  const forThisKid = rows.filter((row) => row.kidId === ctx.kid.id);

  // A blanket pause outranks everything else, including a due date.
  if (ctx.kid.laddersPaused) {
    return {
      scheduled: [],
      skipped: forThisKid.map((row) => ({
        ladderRowId: row.id,
        foodId: row.foodId,
        reason: 'kid_paused' as const,
      })),
    };
  }

  const stressful = lower(ctx.kid.stressfulSlots);
  const takenSlots = new Set((ctx.occupiedSlots ?? []).map((s) => s.toLowerCase()));

  const eligible: SchedulableLadderRow[] = [];
  for (const row of forThisKid) {
    if (row.status !== 'active') {
      skipped.push({ ladderRowId: row.id, foodId: row.foodId, reason: 'not_active' });
      continue;
    }
    if (!row.nextDueOn || row.nextDueOn > ctx.date) {
      skipped.push({ ladderRowId: row.id, foodId: row.foodId, reason: 'not_due' });
      continue;
    }
    const food = ctx.foodsById.get(row.foodId);
    if (food && hasAllergenConflict(food, ctx.kid)) {
      skipped.push({
        ladderRowId: row.id,
        foodId: row.foodId,
        reason: 'allergen_conflict',
      });
      continue;
    }
    eligible.push(row);
  }

  // Most-overdue first, then foods whose texture the child is comfortable
  // with ahead of ones they have told us they dislike, then a stable id sort.
  eligible.sort((a, b) => {
    if (a.nextDueOn !== b.nextDueOn) return (a.nextDueOn ?? '') < (b.nextDueOn ?? '') ? -1 : 1;

    const aFood = ctx.foodsById.get(a.foodId);
    const bFood = ctx.foodsById.get(b.foodId);
    const aDisliked = aFood ? hasDislikedTexture(aFood, ctx.kid) : false;
    const bDisliked = bFood ? hasDislikedTexture(bFood, ctx.kid) : false;
    if (aDisliked !== bDisliked) return aDisliked ? 1 : -1;

    return a.id.localeCompare(b.id);
  });

  const usedSlots = new Set<string>(takenSlots);

  for (const row of eligible) {
    if (scheduled.length >= MAX_ACTIVE_EXPOSURES) {
      skipped.push({ ladderRowId: row.id, foodId: row.foodId, reason: 'daily_cap_reached' });
      continue;
    }

    const slot = pickSlot(row, usedSlots, stressful);
    if (!slot) {
      skipped.push({ ladderRowId: row.id, foodId: row.foodId, reason: 'no_slot_available' });
      continue;
    }

    const anchorFoodId = selectAnchor(row, ctx);
    if (!anchorFoodId) {
      // Better to serve nothing than to serve a new food with no safe
      // landing next to it.
      skipped.push({ ladderRowId: row.id, foodId: row.foodId, reason: 'no_anchor_available' });
      continue;
    }

    usedSlots.add(slot);
    scheduled.push({
      ladderRowId: row.id,
      kidId: row.kidId,
      foodId: row.foodId,
      rung: row.currentRung,
      mealSlot: slot,
      anchorFoodId,
      preferredPrep: row.preferredPrep,
    });
  }

  return { scheduled, skipped };
}

function pickSlot(
  row: SchedulableLadderRow,
  usedSlots: Set<string>,
  stressfulSlots: Set<string>
): SchedulerMealSlot | null {
  const preferred = row.preferredMealSlot?.toLowerCase() as SchedulerMealSlot | undefined;
  if (
    preferred &&
    SCHEDULABLE_SLOTS.includes(preferred) &&
    !usedSlots.has(preferred) &&
    !stressfulSlots.has(preferred)
  ) {
    return preferred;
  }

  for (const slot of SCHEDULABLE_SLOTS) {
    if (usedSlots.has(slot)) continue;
    if (stressfulSlots.has(slot)) continue;
    return slot;
  }

  return null;
}
