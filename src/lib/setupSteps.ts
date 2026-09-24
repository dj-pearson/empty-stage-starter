import type { Food, GroceryItem, Kid, PlanEntry } from "@/types";
import { toISODate } from "@/lib/date-utils";

/**
 * First-run setup for /dashboard, as a pure function of the loaded slices.
 *
 * One threshold (3 safe foods), counted household-wide, and a plan for any
 * kid counts: the checklist answers "is this account set up", not "is every
 * child set up". Returns null until the slices are hydrated, so an account
 * that is still loading never flashes "Add your child" at a parent who has
 * three.
 */

export type SetupStepId = "kid" | "foods" | "plan" | "grocery";

export interface SetupStep {
  id: SetupStepId;
  done: boolean;
}

export interface SetupStepsInput {
  kids: readonly Pick<Kid, "id">[];
  foods: readonly Pick<Food, "is_safe">[];
  planEntries: readonly Pick<PlanEntry, "date">[];
  groceryItems: readonly Pick<GroceryItem, "checked">[];
  hydrated: boolean;
  /** Local YYYY-MM-DD; defaults to today. */
  todayKey?: string;
}

export const SAFE_FOOD_TARGET = 3;

export function getSetupSteps(input: SetupStepsInput): SetupStep[] | null {
  if (!input.hydrated) return null;
  const todayKey = input.todayKey ?? toISODate(new Date());
  return [
    { id: "kid", done: input.kids.length > 0 },
    { id: "foods", done: input.foods.filter((f) => f.is_safe).length >= SAFE_FOOD_TARGET },
    { id: "plan", done: input.planEntries.some((e) => e.date >= todayKey) },
    { id: "grocery", done: input.groceryItems.some((i) => !i.checked) },
  ];
}

/** The first step not yet done, or null when there is none. */
export function nextStep(steps: readonly SetupStep[] | null): SetupStep | null {
  return steps?.find((s) => !s.done) ?? null;
}

/** True only for a hydrated account with every step done. */
export function isSetupComplete(steps: readonly SetupStep[] | null): boolean {
  return steps !== null && steps.every((s) => s.done);
}
