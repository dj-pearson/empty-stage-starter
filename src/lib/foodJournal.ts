import type { AmountEaten, Food, Kid, MealResult, MealSlot, PlanEntry, Recipe } from '@/types';
import { entryKey, groupSlot } from '@/lib/familySlot';
import { matchingAllergen } from '@/lib/allergens';

/**
 * The food journal: every logged meal for a child, a day at a time, with the
 * notes and amounts written about it.
 *
 * Notes live in two places. The web log modal writes `plan_entries.notes`; the
 * iOS "How was it?" sheet writes a `plan_entry_feedback` row. A caregiver who
 * logs on the phone and a parent who reads on the laptop need both, so the
 * journal folds them together here rather than each screen doing it.
 *
 * A recipe lands as one row per food, so the journal groups a (date, slot)
 * with familySlot.groupSlot and shows one item per kid per dish: the recipe,
 * named after the recipe, with any side row that was logged on its own nested
 * under it as a component. Each item also carries how many times the dish has
 * been offered to that kid (exposureNumber), whether this was the first time
 * they ate or tasted it, the first of the kid's allergens it carries, and the
 * reaction and parent notes from a linked food_attempts row.
 *
 * The iOS copy is FoodJournalView.swift. Swift cannot import this file, so a
 * change to the amounts or the grouping belongs in both. The Swift mirror now
 * lags this file on recipe grouping, note dedupe (normalizeNoteKey) and
 * exposure counting; bringing it level is deferred.
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

/**
 * The amount to save with an edit. An entry with no result (a plan nobody has
 * logged) or a refusal has no amount, so an amount can never be stored on
 * an unlogged meal whatever the picker still shows.
 */
export function amountForSave(result: MealResult, picked: AmountEaten | null): AmountEaten | null {
  if (result === null) return null;
  return amountForResult(result, picked ?? undefined, null);
}

/** Longest note the journal lets a caregiver type. */
export const NOTE_MAX_LENGTH = 500;

/**
 * The comparison key for "these are the same words". Case, runs of
 * whitespace and trailing sentence punctuation don't make a second note.
 */
export function normalizeNoteKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '').trim();
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

/** The subset of a food_attempts row the journal reads. */
export interface JournalAttempt {
  id: string;
  plan_entry_id: string | null;
  reaction_notes: string | null;
  parent_notes: string | null;
  attempted_at: string | null;
}

export interface JournalNote {
  /** Stable React key. */
  key: string;
  text: string;
  source: 'entry' | 'feedback' | 'reaction' | 'attempt';
  /** Present for feedback notes. */
  userId?: string;
  /** Present for feedback notes, and for attempt notes that carry attempted_at. */
  createdAt?: string;
}

/** A row of a dish (a recipe's side, say) that was logged on its own. */
export interface JournalComponent {
  entryId: string;
  foodId: string;
  /** Null when the food is not in the household list. */
  name: string | null;
  result: MealResult;
  amountEaten: AmountEaten | null;
  notes: JournalNote[];
}

export interface JournalItem {
  /** The dish's primary row: the one results are logged on. */
  entryId: string;
  kidId: string;
  date: string;
  mealSlot: MealSlot;
  foodId: string;
  recipeId: string | null;
  /** Recipe name for a recipe, else the food name; null when neither is known. */
  name: string | null;
  result: MealResult;
  amountEaten: AmountEaten | null;
  notes: JournalNote[];
  /**
   * Times this dish was offered to this kid up to and including this one,
   * counted over every entry passed in (before the date filter).
   */
  exposureNumber: number;
  /** The first time the kid ate or tasted this dish. */
  firstTry: boolean;
  /** The first of the kid's allergens the dish carries, or null. */
  allergen: string | null;
  components: JournalComponent[];
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

const slotRank = (slot: MealSlot): number => SLOT_ORDER[slot] ?? 99;

export type JournalFood = Pick<Food, 'id' | 'name'> & { allergens?: ReadonlyArray<string> | null };

export interface BuildJournalOptions {
  entries: ReadonlyArray<PlanEntry>;
  foods: ReadonlyArray<JournalFood>;
  recipes?: ReadonlyArray<Pick<Recipe, 'id' | 'name'>>;
  feedback?: ReadonlyArray<JournalFeedback>;
  /** food_attempts rows; their reaction and parent notes join the meal's notes. */
  attempts?: ReadonlyArray<JournalAttempt>;
  /** Kids' allergen lists. Without them no item carries an allergen. */
  kids?: ReadonlyArray<Pick<Kid, 'id' | 'allergens'>>;
  /** Kid ids in display order, for sorting siblings within a slot. */
  kidOrder?: ReadonlyArray<string>;
  /** Undefined means every child. */
  kidId?: string | null;
  /** Inclusive 'YYYY-MM-DD' bounds. */
  from?: string;
  to?: string;
  onlyWithNotes?: boolean;
}

/** One kid's dish in one (date, slot), before notes are read. */
interface Dish {
  kidId: string;
  date: string;
  mealSlot: MealSlot;
  key: string;
  primary: PlanEntry;
  /** Every row of the dish, the primary included. */
  rows: PlanEntry[];
  exposureNumber: number;
  firstTry: boolean;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Every kid's dishes in one (date, slot). groupSlot picks each kid's dish and
 * primary row; rows under another key (a stray side the kid was given instead)
 * become dishes of their own, with their primary picked the same way.
 */
function dishesInSlot(date: string, mealSlot: MealSlot, rows: PlanEntry[]): Dish[] {
  const out: Dish[] = [];
  for (const [kidId, slot] of groupSlot(rows).perKid) {
    out.push({ kidId, date, mealSlot, key: slot.key, primary: slot.primary, rows: slot.rows, exposureNumber: 0, firstTry: false });
    const strays = new Map<string, PlanEntry[]>();
    for (const row of slot.allRows) {
      const key = entryKey(row);
      if (key === slot.key) continue;
      const list = strays.get(key);
      if (list) list.push(row);
      else strays.set(key, [row]);
    }
    for (const [key, strayRows] of strays) {
      const stray = groupSlot(strayRows).perKid.get(kidId);
      if (!stray) continue;
      out.push({ kidId, date, mealSlot, key, primary: stray.primary, rows: strayRows, exposureNumber: 0, firstTry: false });
    }
  }
  return out;
}

/**
 * Stamp exposureNumber and firstTry on every dish, in eating order: date,
 * then slot, then primary row id so the count is the same however the rows
 * arrived.
 */
function stampExposure(dishes: Dish[]): void {
  const sorted = [...dishes].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      slotRank(a.mealSlot) - slotRank(b.mealSlot) ||
      compareIds(a.primary.id, b.primary.id)
  );
  const seen = new Map<string, { offered: number; tried: number }>();
  for (const dish of sorted) {
    const id = `${dish.kidId}|${dish.key}`;
    const stats = seen.get(id) ?? { offered: 0, tried: 0 };
    stats.offered += 1;
    dish.exposureNumber = stats.offered;
    const tried = dish.primary.result === 'ate' || dish.primary.result === 'tasted';
    dish.firstTry = tried && stats.tried === 0;
    if (tried) stats.tried += 1;
    seen.set(id, stats);
  }
}

/**
 * Logged meals grouped by day, newest day first and meals in the order they
 * are eaten within a day. A dish with no result and no note anywhere on it is
 * a plan, not a log, and is left out.
 */
export function buildFoodJournal({
  entries,
  foods,
  recipes = [],
  feedback = [],
  attempts = [],
  kids = [],
  kidOrder = [],
  kidId,
  from,
  to,
  onlyWithNotes = false,
}: BuildJournalOptions): JournalDay[] {
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const recipeNames = new Map(recipes.map((r) => [r.id, r.name]));
  const kidAllergens = new Map(kids.map((k) => [k.id, k.allergens]));
  const kidRank = new Map(kidOrder.map((id, i) => [id, i]));

  const feedbackByEntry = new Map<string, JournalFeedback[]>();
  for (const fb of feedback) {
    if (!fb.note || !fb.note.trim()) continue;
    const list = feedbackByEntry.get(fb.plan_entry_id) ?? [];
    list.push(fb);
    feedbackByEntry.set(fb.plan_entry_id, list);
  }
  const attemptById = new Map<string, JournalAttempt>();
  const attemptsByEntry = new Map<string, JournalAttempt[]>();
  for (const attempt of attempts) {
    attemptById.set(attempt.id, attempt);
    if (attempt.plan_entry_id) {
      const list = attemptsByEntry.get(attempt.plan_entry_id) ?? [];
      list.push(attempt);
      attemptsByEntry.set(attempt.plan_entry_id, list);
    }
  }

  // Exposure is counted over every date, so bucket everything for the kid(s)
  // in view, not just the range.
  const buckets = new Map<string, { date: string; mealSlot: MealSlot; rows: PlanEntry[] }>();
  for (const entry of entries) {
    if (kidId && entry.kid_id !== kidId) continue;
    const date = entry.date.slice(0, 10);
    const id = `${date}|${entry.meal_slot}`;
    const bucket = buckets.get(id);
    if (bucket) bucket.rows.push(entry);
    else buckets.set(id, { date, mealSlot: entry.meal_slot, rows: [entry] });
  }
  const dishes: Dish[] = [];
  for (const { date, mealSlot, rows } of buckets.values()) dishes.push(...dishesInSlot(date, mealSlot, rows));
  stampExposure(dishes);

  const notesFor = (entry: PlanEntry): JournalNote[] => {
    const notes: JournalNote[] = [];
    const seen = new Set<string>();
    const add = (note: JournalNote) => {
      // The same words saved two ways (or with a different full stop) read once.
      const k = normalizeNoteKey(note.text);
      if (!k || seen.has(k)) return;
      seen.add(k);
      notes.push(note);
    };
    if (entry.notes && entry.notes.trim()) {
      add({ key: `${entry.id}:entry`, text: entry.notes.trim(), source: 'entry' });
    }
    const fbs = [...(feedbackByEntry.get(entry.id) ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const fb of fbs) {
      add({ key: fb.id, text: (fb.note ?? '').trim(), source: 'feedback', userId: fb.user_id, createdAt: fb.created_at });
    }
    const linked = new Map<string, JournalAttempt>();
    const direct = entry.food_attempt_id ? attemptById.get(entry.food_attempt_id) : undefined;
    if (direct) linked.set(direct.id, direct);
    for (const a of attemptsByEntry.get(entry.id) ?? []) linked.set(a.id, a);
    const ordered = [...linked.values()].sort(
      (a, b) => (a.attempted_at ?? '').localeCompare(b.attempted_at ?? '') || compareIds(a.id, b.id)
    );
    for (const a of ordered) {
      const createdAt = a.attempted_at ?? undefined;
      const reaction = a.reaction_notes?.trim();
      if (reaction) add({ key: `${a.id}:reaction`, text: reaction, source: 'reaction', createdAt });
      const parent = a.parent_notes?.trim();
      if (parent) add({ key: `${a.id}:attempt`, text: parent, source: 'attempt', createdAt });
    }
    return notes;
  };

  const amountOf = (entry: PlanEntry): AmountEaten | null =>
    isAmountEaten(entry.amount_eaten) ? entry.amount_eaten : null;
  const foodName = (id: string): string | null => foodById.get(id)?.name ?? null;

  const days = new Map<string, JournalItem[]>();
  for (const dish of dishes) {
    if (from && dish.date < from) continue;
    if (to && dish.date > to) continue;
    const { primary } = dish;

    const notes = notesFor(primary);
    const components: JournalComponent[] = [];
    for (const row of dish.rows) {
      if (row.id === primary.id) continue;
      const rowNotes = notesFor(row);
      if (row.result === null && rowNotes.length === 0) continue;
      components.push({
        entryId: row.id,
        foodId: row.food_id,
        name: foodName(row.food_id),
        result: row.result,
        amountEaten: amountOf(row),
        notes: rowNotes,
      });
    }
    components.sort((a, b) => compareIds(a.entryId, b.entryId));

    const hasNotes = notes.length > 0 || components.some((c) => c.notes.length > 0);
    if (primary.result === null && !hasNotes && components.length === 0) continue;
    if (onlyWithNotes && !hasNotes) continue;

    const recipeId = primary.recipe_id || null;
    const name = (recipeId && dish.key === recipeId && recipeNames.get(recipeId)) || foodName(primary.food_id);

    let allergen: string | null = null;
    const allergens = kidAllergens.get(dish.kidId);
    if (allergens && allergens.length > 0) {
      const foodIds = [primary.food_id, ...dish.rows.filter((r) => r.id !== primary.id).map((r) => r.food_id)];
      for (const id of foodIds) {
        allergen = matchingAllergen(allergens, foodById.get(id)?.allergens);
        if (allergen) break;
      }
    }

    const item: JournalItem = {
      entryId: primary.id,
      kidId: dish.kidId,
      date: dish.date,
      mealSlot: dish.mealSlot,
      foodId: primary.food_id,
      recipeId,
      name,
      result: primary.result,
      amountEaten: amountOf(primary),
      notes,
      exposureNumber: dish.exposureNumber,
      firstTry: dish.firstTry,
      allergen,
      components,
    };
    const list = days.get(dish.date) ?? [];
    list.push(item);
    days.set(dish.date, list);
  }

  const rankOf = (id: string) => kidRank.get(id) ?? Number.MAX_SAFE_INTEGER;
  const compareNames = (a: string | null, b: string | null): number => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  };

  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      items.sort(
        (a, b) =>
          slotRank(a.mealSlot) - slotRank(b.mealSlot) ||
          rankOf(a.kidId) - rankOf(b.kidId) ||
          compareIds(a.kidId, b.kidId) ||
          compareNames(a.name, b.name) ||
          compareIds(a.entryId, b.entryId)
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

export interface JournalTotals {
  /** Items with a result, so logged === ate + tasted + refused. */
  logged: number;
  counts: { ate: number; tasted: number; refused: number };
  amounts: Record<AmountEaten, number>;
}

export interface JournalSummary extends JournalTotals {
  /** Items kept only for a note: no result on the dish. */
  noteOnly: number;
  byKid: Map<string, JournalTotals>;
}

const emptyTotals = (): JournalTotals => ({
  logged: 0,
  counts: { ate: 0, tasted: 0, refused: 0 },
  amounts: { a_lot: 0, some: 0, nibbles: 0 },
});

/**
 * Totals for the summary card, overall and per kid. Build `days` without
 * onlyWithNotes for this, or the notes filter changes the totals.
 */
export function summarizeJournal(days: ReadonlyArray<JournalDay>): JournalSummary {
  const total = emptyTotals();
  const byKid = new Map<string, JournalTotals>();
  let noteOnly = 0;
  for (const day of days) {
    for (const item of day.items) {
      if (!item.result) {
        noteOnly += 1;
        continue;
      }
      let kid = byKid.get(item.kidId);
      if (!kid) {
        kid = emptyTotals();
        byKid.set(item.kidId, kid);
      }
      for (const t of [total, kid]) {
        t.logged += 1;
        t.counts[item.result] += 1;
        if (item.amountEaten) t.amounts[item.amountEaten] += 1;
      }
    }
  }
  return { ...total, noteOnly, byKid };
}
