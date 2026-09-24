import type { AmountEaten, Food, Kid, MealResult, MealSlot, PlanEntry, Recipe } from '@/types';
import { amountForResult, normalizeNoteKey } from '@/lib/foodJournal';
import { entryKey, groupSlot } from '@/lib/familySlot';

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
  amount_eaten?: AmountEaten | null;
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
  | { status: 'saved'; entry: QuickLogEntry; patch: QuickLogPatch }
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

/** The exact object performQuickLog hands to `save`. */
export interface QuickLogPatch {
  result: QuickLogResult;
  notes?: string;
  amount_eaten?: AmountEaten | null;
}

/**
 * How a typed note meets the one already on the entry.
 *
 * `append` is the quick log: plan_entries.notes is shared with the household,
 * so a nanny's "Too tired" must not erase the "Allergic rash on cheek?" a
 * parent wrote at lunch. `replace` is the journal editor, where the parent is
 * looking at the whole note and editing it as text.
 */
export type QuickLogNoteMode = 'append' | 'replace';

/**
 * The note to write when `incoming` is added to `existing`.
 *
 * Nothing typed keeps what was there. A note the entry already carries (as the
 * whole note or as one of its lines, ignoring case and spacing) is not written
 * twice, so tapping "Loved it!" on a re-log does not stack copies of it.
 */
export function mergeNote(
  existing: string | null | undefined,
  incoming: string | undefined
): string | undefined {
  const kept = existing ?? undefined;
  const added = incoming?.trim();
  if (!added) return kept;
  const current = kept?.trim();
  if (!current) return added;
  const key = normalizeNoteKey(added);
  const already =
    normalizeNoteKey(current) === key ||
    current.split('\n').some((line) => normalizeNoteKey(line) === key);
  return already ? kept : `${current}\n${added}`;
}

/** What an entry held before a write, enough to put it back. */
export interface QuickLogUndoSnapshot {
  result: MealResult;
  notes?: string | null;
  amount_eaten?: AmountEaten | null;
}

export interface QuickLogUndoPatch {
  result?: MealResult;
  notes?: string | null;
  amount_eaten?: AmountEaten | null;
}

/**
 * The write that undoes `patch`: only the keys it touched, each restored from
 * `before`. A key the log never sent is left alone, so undoing a result does
 * not also clobber a note another caregiver added in the meantime. An entry
 * that had no note gets null back, never '' (an empty string reads as "a note
 * was written" to anything that checks for one).
 */
export function buildUndoPatch(
  before: QuickLogUndoSnapshot,
  patch: Record<string, unknown>
): QuickLogUndoPatch {
  const undo: QuickLogUndoPatch = {};
  if ('result' in patch) undo.result = before.result ?? null;
  if ('notes' in patch) undo.notes = before.notes ? before.notes : null;
  if ('amount_eaten' in patch) undo.amount_eaten = before.amount_eaten ?? null;
  return undo;
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
  /**
   * "A lot", "some" or "nibbles", when the user picked one. Undefined keeps
   * what the entry had; null clears it (the journal editor's deselect).
   */
  amount?: AmountEaten | null;
  /** Defaults to 'append'; see QuickLogNoteMode. */
  noteMode?: QuickLogNoteMode;
  save: (entryId: string, patch: QuickLogPatch) => PromiseLike<{ error: unknown }> | { error: unknown };
}): Promise<QuickLogOutcome> {
  const { meals, result, notes, mealId, amount, noteMode = 'append', save } = options;
  const entry = selectQuickLogEntry(meals, mealId);

  if (!entry) {
    return mealId ? { status: 'unknown-meal', mealId } : { status: 'nothing-planned' };
  }

  try {
    // No note typed is the user not writing one, so keep whatever the entry
    // already carried rather than blanking it. A typed note is added to the
    // shared one, unless the caller is editing the whole note.
    const patch: QuickLogPatch = {
      result,
      notes:
        noteMode === 'replace' ? notes ?? entry.notes : mergeNote(entry.notes, notes),
    };
    // Only touch the amount when there is something to say about it: a new
    // pick, a cleared one, or a refusal clearing one recorded earlier.
    const amountEaten =
      amount === null ? null : amountForResult(result, amount, entry.amount_eaten);
    if (amountEaten !== (entry.amount_eaten ?? null)) patch.amount_eaten = amountEaten;
    const { error } = await save(entry.id, patch);
    return error ? { status: 'failed', entry, error } : { status: 'saved', entry, patch };
  } catch (error) {
    return { status: 'failed', entry, error };
  }
}

/** The order a day reads in, so the picker lists breakfast before dinner. */
export const QUICK_LOG_SLOT_ORDER: readonly MealSlot[] = [
  'breakfast',
  'snack1',
  'lunch',
  'snack2',
  'dinner',
  'try_bite',
];

/** A picker row with enough context for the dashboard to act on it. */
export interface QuickLogPlanMeal extends QuickLogEntry {
  kidId: string;
  slot: MealSlot;
  /** What was already recorded, so a log can be undone. */
  result: MealResult;
  /** Exactly one row carries this: the one the modal opens on. */
  preselected: boolean;
}

/**
 * The slot a parent most likely means at this time of day. Dinner from 16:00,
 * because the FAB is mostly reached for after the evening meal.
 */
export function slotForTime(now: Date): MealSlot {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 16 * 60) return 'dinner';
  if (minutes >= 14 * 60) return 'snack2';
  if (minutes >= 11 * 60) return 'lunch';
  if (minutes >= 10 * 60) return 'snack1';
  return 'breakfast';
}

const SLOT_HOUR: Record<MealSlot, number> = {
  breakfast: 8,
  snack1: 10,
  lunch: 12,
  snack2: 15,
  dinner: 18,
  try_bite: 18.5,
};

const defaultSlotLabel = (slot: MealSlot) => slot.replace('_', ' ');

/** U+00B7, spelled as an escape so the source stays ASCII. */
const SEP = ' · ';

/**
 * Today's planned meals for the quick-log picker, render-free.
 *
 * With a kid selected, that kid's rows. In Family mode (activeKidId null) every
 * kid's rows, each labelled with the kid's name, because a parent logging
 * dinner for three children should not have to switch views three times.
 *
 * A recipe lands as one row per ingredient food; it is listed once, on the row
 * groupSlot names as that kid's primary, and labelled with the recipe's name.
 * A separate food in the same slot (a side, a try-bite) keeps its own row.
 *
 * `slotLabel` is how the slot reads to the user; the caller passes its i18n
 * lookup. The default is only there so this stays usable without one.
 */
export function buildQuickLogMeals(
  entries: ReadonlyArray<PlanEntry>,
  kids: ReadonlyArray<Pick<Kid, 'id' | 'name'>>,
  foods: ReadonlyArray<Pick<Food, 'id' | 'name'>>,
  recipes: ReadonlyArray<Pick<Recipe, 'id' | 'name'>>,
  activeKidId: string | null,
  todayKey: string,
  now: Date,
  slotLabel: (slot: MealSlot) => string = defaultSlotLabel
): QuickLogPlanMeal[] {
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const kidOrder = new Map(kids.map((k, i) => [k.id, i]));
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const familyMode = activeKidId === null;

  const today = entries.filter(
    (e) =>
      e.date === todayKey &&
      (familyMode ? kidById.has(e.kid_id) : e.kid_id === activeKidId)
  );
  if (today.length === 0) return [];

  const bySlot = new Map<MealSlot, PlanEntry[]>();
  for (const e of today) {
    const list = bySlot.get(e.meal_slot);
    if (list) list.push(e);
    else bySlot.set(e.meal_slot, [e]);
  }

  const rows: Array<Omit<QuickLogPlanMeal, 'preselected'>> = [];
  const slots = [...bySlot.keys()].sort(
    (a, b) => slotRank(a) - slotRank(b)
  );

  for (const slot of slots) {
    const slotEntries = bySlot.get(slot) ?? [];
    const grouped = groupSlot(slotEntries);
    const kidIds = [...grouped.perKid.keys()].sort(
      (a, b) => (kidOrder.get(a) ?? 0) - (kidOrder.get(b) ?? 0)
    );

    for (const kidId of kidIds) {
      const kidSlot = grouped.perKid.get(kidId);
      if (!kidSlot) continue;

      // One row per dish: the primary dish first, then any strays under
      // other keys, each represented by its own lowest-id row.
      const dishes: PlanEntry[] = [kidSlot.primary];
      const seen = new Set([entryKey(kidSlot.primary)]);
      const strays = kidSlot.allRows
        .filter((r) => !seen.has(entryKey(r)))
        .sort((a, b) => Number(!!b.is_primary_dish) - Number(!!a.is_primary_dish) || (a.id < b.id ? -1 : 1));
      for (const r of strays) {
        const key = entryKey(r);
        if (seen.has(key)) continue;
        seen.add(key);
        dishes.push(r);
      }

      for (const entry of dishes) {
        const dish = entry.recipe_id
          ? recipeById.get(entry.recipe_id)?.name ?? foodById.get(entry.food_id)?.name
          : foodById.get(entry.food_id)?.name;
        const parts = [
          ...(familyMode ? [kidById.get(kidId)?.name ?? ''] : []),
          slotLabel(slot),
          ...(dish ? [dish] : []),
        ].filter(Boolean);
        rows.push({
          id: entry.id,
          label: parts.join(SEP),
          notes: entry.notes,
          amount_eaten: entry.amount_eaten,
          kidId,
          slot,
          result: entry.result ?? null,
        });
      }
    }
  }

  const pick = preselectRow(rows, now);
  return rows.map((row) => ({ ...row, preselected: row.id === pick }));
}

function slotRank(slot: MealSlot): number {
  const i = QUICK_LOG_SLOT_ORDER.indexOf(slot);
  return i === -1 ? QUICK_LOG_SLOT_ORDER.length : i;
}

/**
 * The row the modal opens on: the slot for this time of day if anything is
 * planned in it, otherwise the planned slot nearest in time. Within the slot,
 * the first row nobody has logged yet.
 */
function preselectRow(
  rows: ReadonlyArray<{ id: string; slot: MealSlot; result: MealResult }>,
  now: Date
): string | undefined {
  if (rows.length === 0) return undefined;
  const wanted = slotForTime(now);
  const hour = now.getHours() + now.getMinutes() / 60;

  let slot: MealSlot = rows[0].slot;
  if (rows.some((r) => r.slot === wanted)) {
    slot = wanted;
  } else {
    let best = Infinity;
    for (const r of rows) {
      const d = Math.abs(SLOT_HOUR[r.slot] - hour);
      if (d < best) {
        best = d;
        slot = r.slot;
      }
    }
  }

  const inSlot = rows.filter((r) => r.slot === slot);
  return (inSlot.find((r) => !r.result) ?? inSlot[0])?.id;
}
