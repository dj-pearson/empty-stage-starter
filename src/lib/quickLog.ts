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


/** The three results the modal offers. */
export type QuickLogResult = 'ate' | 'tasted' | 'refused';

/** A planned meal as the dashboard knows it: the picker's row plus its note. */
export interface QuickLogEntry extends QuickLogMeal {
  notes?: string;
}

/**
 * What happened, for the caller to report.
 *
 * `unknown-meal` is deliberately distinct from `nothing-planned`: the modal can
 * name an entry that has since been deleted, and answering that with "nothing
 * planned for today" would be wrong in the one case where the user did plan
 * something. Neither one falls back to the first meal of the day.
 */
export type QuickLogOutcome =
  | { status: 'nothing-planned' }
  | { status: 'unknown-meal'; mealId: string }
  | { status: 'saved'; entry: QuickLogEntry }
  | { status: 'failed'; entry: QuickLogEntry; error: unknown };

/**
 * The entry a result belongs to, or undefined when there isn't one.
 *
 * An explicit id has to match. `find(...) ?? meals[0]` would log tonight's
 * refusal against this morning's breakfast whenever the named entry had gone.
 */
export function selectQuickLogEntry<T extends QuickLogMeal>(
  meals: ReadonlyArray<T>,
  mealId?: string
): T | undefined {
  return mealId ? meals.find((meal) => meal.id === mealId) : meals[0];
}

/**
 * Record a quick-log result, and say what happened.
 *
 * Pulled out of Dashboard.tsx (US-812) so every branch -- nothing planned, a
 * meal that has gone, a write the server rejected -- can be tested without
 * mounting the dashboard. The old handler had none of them: it fired
 * toast("Meal logged!") and wrote nothing at all.
 *
 * `save` is AppContext's updatePlanEntry, which reports rather than throws: it
 * resolves to the Supabase error (US-812 made it return that instead of void).
 * A throw is treated the same way, so a save that does throw is not read as a
 * success.
 */
export async function performQuickLog<T extends QuickLogEntry>(options: {
  meals: ReadonlyArray<T>;
  result: QuickLogResult;
  notes?: string;
  mealId?: string;
  save: (
    entryId: string,
    patch: { result: QuickLogResult; notes?: string }
  ) => PromiseLike<{ error: unknown }> | { error: unknown };
}): Promise<QuickLogOutcome> {
  const { meals, result, notes, mealId, save } = options;
  const entry = selectQuickLogEntry(meals, mealId);

  if (!entry) {
    return mealId ? { status: 'unknown-meal', mealId } : { status: 'nothing-planned' };
  }

  try {
    // No note typed is the user not writing one, so keep whatever the entry
    // already carried rather than blanking it.
    const { error } = await save(entry.id, { result, notes: notes ?? entry.notes });
    return error ? { status: 'failed', entry, error } : { status: 'saved', entry };
  } catch (error) {
    return { status: 'failed', entry, error };
  }
}
