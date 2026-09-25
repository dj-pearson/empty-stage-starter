/**
 * "We cooked it; how did it go?" (item 9), render-free.
 *
 * After "I Made It" or Cook Mode's Done, the parent logs ate / tasted /
 * refused per kid. The result is written through the plan, never beside it:
 * the kid's plan entry for this recipe today carries the result (which is what
 * the journal, insights and the exposure ladder read), and when there is none
 * one is scheduled first for the current meal slot.
 *
 * Pure: no React, no Supabase.
 */
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { groupSlot } from "@/lib/familySlot";
import { QUICK_LOG_SLOT_ORDER, slotForTime } from "@/lib/quickLog";
import {
  countUncheckedIngredients,
  getKidRecipeFit,
  isAllergyUnknown,
  isFitSeverityRecorded,
  isSevereFit,
} from "@/lib/kidFit";

/**
 * The entry a kid's result for this recipe belongs on today, or undefined.
 *
 * A recipe lands as one row per food; the result goes on the primary row
 * (familySlot's rule, the same one the quick log uses). When the recipe is
 * planned in more than one slot today, the slot for this time of day wins,
 * then the first slot nobody has logged, then the first slot.
 */
export function findTodayRecipeEntry(
  planEntries: readonly PlanEntry[],
  recipeId: string,
  kidId: string,
  todayKey: string,
  now: Date,
): PlanEntry | undefined {
  const rows = planEntries.filter(
    (e) => e.kid_id === kidId && e.date === todayKey && e.recipe_id === recipeId,
  );
  if (rows.length === 0) return undefined;
  const bySlot = new Map<string, PlanEntry[]>();
  for (const r of rows) {
    const list = bySlot.get(r.meal_slot);
    if (list) list.push(r);
    else bySlot.set(r.meal_slot, [r]);
  }
  const primaries = [...bySlot.entries()]
    .sort(([a], [b]) => QUICK_LOG_SLOT_ORDER.indexOf(a as PlanEntry["meal_slot"]) - QUICK_LOG_SLOT_ORDER.indexOf(b as PlanEntry["meal_slot"]))
    .map(([, list]) => groupSlot(list).perKid.get(kidId)?.primary)
    .filter((e): e is PlanEntry => Boolean(e));
  const wanted = slotForTime(now);
  return (
    primaries.find((e) => e.meal_slot === wanted) ??
    primaries.find((e) => !e.result) ??
    primaries[0]
  );
}

/** The primary row for one kid among rows a schedule call just wrote. */
export function primaryForKid(rows: readonly PlanEntry[], kidId: string): PlanEntry | undefined {
  const mine = rows.filter((r) => r.kid_id === kidId);
  if (mine.length === 0) return undefined;
  return groupSlot(mine).perKid.get(kidId)?.primary;
}

/**
 * Why a kid cannot have this recipe put on today's plan, or null when they
 * can. The planner's allergen gate: an allergen hit, or allergy data we could
 * not check, is never planned in one tap. A kid who already has the recipe on
 * today's plan is not gated here; the caller only asks for kids it would
 * have to schedule.
 */
export type CookLogGate =
  | {
      reason: "allergen";
      allergen: string;
      /** Severe, recorded or unrated (an unrated allergy is treated as severe). */
      severe: boolean;
      /** False when the severity was not recorded; copy must not call it the parent's "severe". */
      severityRecorded?: boolean;
    }
  | { reason: "unknown" }
  | { reason: "no-foods" };

export function cookLogGate(
  kid: Kid,
  recipe: Recipe,
  foodById: ReadonlyMap<string, Food>,
  planEntries: readonly PlanEntry[],
): CookLogGate | null {
  if ((recipe.food_ids ?? []).length === 0) return { reason: "no-foods" };
  const fit = getKidRecipeFit(kid, recipe, foodById, planEntries);
  if (fit.allergen) {
    return {
      reason: "allergen",
      allergen: fit.allergen,
      severe: isSevereFit(fit),
      severityRecorded: isFitSeverityRecorded(fit),
    };
  }
  // Same rule as useRecipeQuickPlan's isKidAllergyUnknown: no list at all, or
  // a list and an ingredient we could not check against it.
  const unchecked = countUncheckedIngredients(recipe, foodById);
  if (isAllergyUnknown(kid) || ((kid.allergens?.length ?? 0) > 0 && unchecked > 0)) {
    return { reason: "unknown" };
  }
  return null;
}
