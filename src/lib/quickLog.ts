/** One of today's planned meals, for the picker. */
export interface QuickLogMeal {
  id: string;
  label: string;
}

/**
 * Whether the user has to say which meal before a result means anything.
 *
 * Zero meals is the caller's problem, not a question worth asking; one meal is
 * a question with a single answer. Kept out of the component so the rule can be
 * tested without rendering React.
 */
export function quickLogNeedsMealChoice(meals?: ReadonlyArray<QuickLogMeal>): boolean {
  return (meals?.length ?? 0) > 1;
}

/**
 * The meal a result will be logged against, or undefined when the answer is
 * still the user's to give.
 */
export function resolveQuickLogMealId(
  meals: ReadonlyArray<QuickLogMeal> | undefined,
  selectedMealId: string | null
): string | undefined {
  if (quickLogNeedsMealChoice(meals)) return selectedMealId ?? undefined;
  return selectedMealId ?? meals?.[0]?.id;
}

