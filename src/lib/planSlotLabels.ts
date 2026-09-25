/**
 * The planner's slot order and labels. A leaf module so a screen that only
 * needs a slot's name (Meal Builder) does not pull useRecipeQuickPlan and its
 * grocery and allergen hooks into its chunk. useRecipeQuickPlan re-exports all
 * three, so existing imports keep working.
 */
import type { TFunction } from "i18next";
import type { MealSlot } from "@/types";

/** Every planner slot, in the planner's order. */
export const RECIPE_PLAN_SLOTS: readonly MealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack1",
  "snack2",
  "try_bite",
];

export const SLOT_DEFAULT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack1: "Snack 1",
  snack2: "Snack 2",
  try_bite: "Try Bite",
};

/** The planner's own label for a slot, never the raw slot id. */
export function slotLabel(t: TFunction, slot: MealSlot): string {
  return t(`planner.mobile.slot.${slot}`, { defaultValue: SLOT_DEFAULT_LABELS[slot] });
}
