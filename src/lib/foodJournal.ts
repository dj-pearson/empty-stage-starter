import type { AmountEaten, Food, MealResult, MealSlot, PlanEntry, Recipe } from '@/types';

/**
 * The food journal: every logged meal for a child, a day at a time, with the
 * notes and amounts written about it.
 *
 * Notes live in two places. The web log modal writes `plan_entries.notes`; the
 * iOS "How was it?" sheet writes a `plan_entry_feedback` row. A caregiver who
 * logs on the phone and a parent who reads on the laptop need both, so the
 * journal folds them together here rather than each screen doing it.
 *
 * The iOS copy is FoodJournalView.swift. Swift cannot import this file, so a
 * change to the amounts or the grouping belongs in both.
 */

/** Stored values, in the order the picker offers them. */
export const AMOUNT_EATEN_VALUES: readonly AmountEaten[] = Object.freeze(['a_lot', 'some', 'nibbles']);

export function isAmountEaten(value: unknown): value is AmountEaten {
  return typeof value === 'string' && (AMOUNT_EATEN_VALUES as readonly string[]).includes(value);
}

/**
 * The amount to store alongside a result. A refusal has no amount, whatever
 * was picked before the parent changed their mind; anything else keeps the
 * pick, or what the entry already had when nothing was picked this time.
 */
export function amountForResult(
  result: Exclude<MealResult, null>,
  picked: AmountEaten | undefined,
  existing: AmountEaten | null | undefined
): AmountEaten | null {
  if (result === 'refused') return null;
  return picked ?? existing ?? null;
}

/** The subset of a plan_entry_feedback row the journal reads. */
export interface JournalFeedback {
  id: string;
  plan_entry_id: string;
  user_id: string;
  rating: number;
  note: string | null;
  created_at: string;
}

export interface JournalNote {
  /** Stable React key. */
  key: string;
  text: string;
  source: 'entry' | 'feedback';
  /** Present for feedback notes. */
  userId?: string;
  createdAt?: string;
}

export interface JournalItem {
  entryId: string;
  kidId: string;
  date: string;
  mealSlot: MealSlot;
  name: string;
  result: MealResult;
  amountEaten: AmountEaten | null;
  notes: JournalNote[];
}

export interface JournalDay {
  date: string;
  items: JournalItem[];
  counts: { ate: number; tasted: number; refused: number };
}

const SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  snack1: 1,
  lunch: 2,
  snack2: 3,
  dinner: 4,
  try_bite: 5,
};

export interface BuildJournalOptions {
  entries: ReadonlyArray<PlanEntry>;
  foods: ReadonlyArray<Pick<Food, 'id' | 'name'>>;
  recipes?: ReadonlyArray<Pick<Recipe, 'id' | 'name'>>;
  feedback?: ReadonlyArray<JournalFeedback>;
  /** Undefined means every child. */
  kidId?: string | null;
  /** Inclusive 'YYYY-MM-DD' bounds. */
  from?: string;
  to?: string;
  onlyWithNotes?: boolean;
}

/**
 * Logged meals grouped by day, newest day first and meals in the order they
 * are eaten within a day. An entry with no result and no note is a plan, not a
 * log, and is left out.
 */
export function buildFoodJournal({
  entries,
  foods,
  recipes = [],
  feedback = [],
  kidId,
  from,
  to,
  onlyWithNotes = false,
}: BuildJournalOptions): JournalDay[] {
  const foodNames = new Map(foods.map((f) => [f.id, f.name]));
  const recipeNames = new Map(recipes.map((r) => [r.id, r.name]));

  const feedbackByEntry = new Map<string, JournalFeedback[]>();
  for (const fb of feedback) {
    if (!fb.note || !fb.note.trim()) continue;
    const list = feedbackByEntry.get(fb.plan_entry_id) ?? [];
    list.push(fb);
    feedbackByEntry.set(fb.plan_entry_id, list);
  }

  const days = new Map<string, JournalItem[]>();

  for (const entry of entries) {
    if (kidId && entry.kid_id !== kidId) continue;
    const date = entry.date.slice(0, 10);
    if (from && date < from) continue;
    if (to && date > to) continue;

    const notes: JournalNote[] = [];
    if (entry.notes && entry.notes.trim()) {
      notes.push({ key: `${entry.id}:entry`, text: entry.notes.trim(), source: 'entry' });
    }
    const fbs = [...(feedbackByEntry.get(entry.id) ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    for (const fb of fbs) {
      const text = (fb.note ?? '').trim();
      // The same words saved both ways should read once.
      if (notes.some((n) => n.text === text)) continue;
      notes.push({ key: fb.id, text, source: 'feedback', userId: fb.user_id, createdAt: fb.created_at });
    }

    if (entry.result === null && notes.length === 0) continue;
    if (onlyWithNotes && notes.length === 0) continue;

    const name =
      (entry.recipe_id && entry.is_primary_dish !== false && recipeNames.get(entry.recipe_id)) ||
      foodNames.get(entry.food_id) ||
      'Unknown food';

    const item: JournalItem = {
      entryId: entry.id,
      kidId: entry.kid_id,
      date,
      mealSlot: entry.meal_slot,
      name,
      result: entry.result,
      amountEaten: isAmountEaten(entry.amount_eaten) ? entry.amount_eaten : null,
      notes,
    };
    const list = days.get(date) ?? [];
    list.push(item);
    days.set(date, list);
  }

  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      items.sort(
        (a, b) => (SLOT_ORDER[a.mealSlot] ?? 99) - (SLOT_ORDER[b.mealSlot] ?? 99) || a.name.localeCompare(b.name)
      );
      const counts = { ate: 0, tasted: 0, refused: 0 };
      for (const item of items) {
        if (item.result) counts[item.result] += 1;
      }
      return { date, items, counts };
    });
}

/** How often each amount was recorded across the journal, for the summary. */
export function summarizeAmounts(days: ReadonlyArray<JournalDay>): Record<AmountEaten, number> {
  const totals: Record<AmountEaten, number> = { a_lot: 0, some: 0, nibbles: 0 };
  for (const day of days) {
    for (const item of day.items) {
      if (item.amountEaten) totals[item.amountEaten] += 1;
    }
  }
  return totals;
}
