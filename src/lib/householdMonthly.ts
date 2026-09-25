/**
 * Household numbers for the Progress page: per child, per month, counted per
 * dish rather than per ingredient row.
 *
 * Analytics used to count plan_entries rows, so a four-food recipe dinner
 * counted as four meals and a single "success rate" was printed against a
 * baseline nobody measured. Here every row goes through buildFoodJournal
 * first, which groups a (date, slot) into one item per kid per dish, and the
 * months are counted from those items. Nothing is compared against a number
 * the household did not produce.
 *
 * Pure: entries come from useHouseholdHistory, ladder rows from
 * useKidsProgressSummary, and "today" is passed in as a local calendar day.
 */
import { buildFoodJournal, type JournalFood, type JournalItem } from '@/lib/foodJournal';
import { masteredOnIso, type KidLadderRow } from '@/lib/kidProgress';
import type { Kid, PlanEntry, Recipe } from '@/types';

export interface HouseholdMonthRow {
  kidId: string;
  /** 'YYYY-MM', local calendar month. */
  month: string;
  /** Dishes with a result, one per kid per dish however many rows it had. */
  dishesLogged: number;
  ate: number;
  tasted: number;
  refused: number;
  /** Distinct dishes logged (a recipe counts as its recipe, else the food). */
  distinctFoods: number;
  /**
   * Dishes first eaten or tasted this month, as far as the log reaches back.
   * Labelled "first logged" on screen: an earlier try outside the read window
   * is invisible here.
   */
  firstTries: number;
  /** Ladder foods that reached mastered, bucketed by masteredOnIso. */
  graduations: number;
}

export interface BuildHouseholdMonthlyOptions {
  entries: ReadonlyArray<PlanEntry>;
  foods: ReadonlyArray<JournalFood>;
  recipes?: ReadonlyArray<Pick<Recipe, 'id' | 'name'>>;
  /** Kids in display order. Rows for any other kid id are dropped. */
  kids: ReadonlyArray<Pick<Kid, 'id'> & Partial<Pick<Kid, 'allergens'>>>;
  ladderRows?: ReadonlyArray<KidLadderRow>;
  /** Local 'YYYY-MM-DD'. Anything dated later is not counted. */
  todayIso: string;
  /** Local 'YYYY-MM-DD'. Graduations in months before this one are dropped. */
  fromIso?: string;
}

/** 'YYYY-MM' of a 'YYYY-MM-DD' day. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** 'YYYY-MM' shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = index - year * 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}`;
}

/** Every 'YYYY-MM' from `fromIso`'s month to `toIso`'s month, inclusive. */
export function monthsBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const last = monthOf(toIso);
  for (let m = monthOf(fromIso); m <= last && out.length < 240; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

interface Bucket {
  row: HouseholdMonthRow;
  dishes: Set<string>;
}

/** The dish identity used for "distinct foods". */
export function dishIdOf(item: Pick<JournalItem, 'recipeId' | 'foodId'>): string {
  return item.recipeId ?? item.foodId;
}

/**
 * Every logged dish for the listed kids, oldest first, one item per kid per
 * dish. Future-dated rows and kids not in `kids` are left out. This is the
 * row set behind both the monthly counts and the per-meal export.
 */
export function householdLoggedDishes({
  entries,
  foods,
  recipes = [],
  kids,
  todayIso,
}: Pick<BuildHouseholdMonthlyOptions, 'entries' | 'foods' | 'recipes' | 'kids' | 'todayIso'>): JournalItem[] {
  const known = new Set(kids.map((k) => k.id));
  const days = buildFoodJournal({
    entries,
    foods,
    recipes,
    kids: kids.map((k) => ({ id: k.id, allergens: k.allergens ?? [] })),
    kidOrder: kids.map((k) => k.id),
    to: todayIso,
  });
  const out: JournalItem[] = [];
  // Journal days are newest first; items within a day are in eating order.
  for (let i = days.length - 1; i >= 0; i -= 1) {
    for (const item of days[i].items) {
      if (item.result && known.has(item.kidId)) out.push(item);
    }
  }
  return out;
}

export function buildHouseholdMonthly({
  entries,
  foods,
  recipes = [],
  kids,
  ladderRows = [],
  todayIso,
  fromIso,
}: BuildHouseholdMonthlyOptions): HouseholdMonthRow[] {
  const kidRank = new Map(kids.map((k, i) => [k.id, i]));
  const buckets = new Map<string, Bucket>();
  const bucketFor = (kidId: string, month: string): Bucket => {
    const id = `${kidId}|${month}`;
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = {
        row: {
          kidId,
          month,
          dishesLogged: 0,
          ate: 0,
          tasted: 0,
          refused: 0,
          distinctFoods: 0,
          firstTries: 0,
          graduations: 0,
        },
        dishes: new Set(),
      };
      buckets.set(id, bucket);
    }
    return bucket;
  };

  for (const item of householdLoggedDishes({ entries, foods, recipes, kids, todayIso })) {
    if (!item.result) continue;
    const bucket = bucketFor(item.kidId, monthOf(item.date));
    bucket.row.dishesLogged += 1;
    bucket.row[item.result] += 1;
    bucket.dishes.add(dishIdOf(item));
    if (item.firstTry) bucket.row.firstTries += 1;
  }

  const todayMonth = monthOf(todayIso);
  const fromMonth = fromIso ? monthOf(fromIso) : null;
  for (const row of ladderRows) {
    if (row.status !== 'mastered' || !kidRank.has(row.kid_id)) continue;
    const day = masteredOnIso(row);
    if (!day) continue;
    const month = monthOf(day);
    if (month > todayMonth || (fromMonth && month < fromMonth)) continue;
    bucketFor(row.kid_id, month).row.graduations += 1;
  }

  return [...buckets.values()]
    .map(({ row, dishes }) => ({ ...row, distinctFoods: dishes.size }))
    .sort(
      (a, b) =>
        (kidRank.get(a.kidId) ?? 0) - (kidRank.get(b.kidId) ?? 0) || a.month.localeCompare(b.month)
    );
}

/** Previous month must have at least this many dishes logged to compare. */
export const MIN_DISHES_TO_COMPARE = 5;

export type MonthOverMonth =
  | { kind: 'thin'; thisMonth: string; previousMonth: string }
  | {
      kind: 'compare';
      thisMonth: string;
      previousMonth: string;
      current: number;
      previous: number;
      delta: number;
    };

/**
 * Distinct foods this month against last month, from logged dishes only.
 * 'thin' when last month had fewer than MIN_DISHES_TO_COMPARE dishes logged:
 * a comparison against two logged meals says nothing, so none is made.
 * `thisMonth` defaults to the latest month in the kid's rows.
 */
export function monthOverMonth(
  rows: ReadonlyArray<HouseholdMonthRow>,
  kidId: string,
  thisMonth?: string
): MonthOverMonth {
  const mine = rows.filter((r) => r.kidId === kidId);
  const month = thisMonth ?? mine.reduce<string>((max, r) => (r.month > max ? r.month : max), '');
  const previousMonth = month ? shiftMonth(month, -1) : '';
  const current = mine.find((r) => r.month === month);
  const previous = mine.find((r) => r.month === previousMonth);
  if (!month || !previous || previous.dishesLogged < MIN_DISHES_TO_COMPARE) {
    return { kind: 'thin', thisMonth: month, previousMonth };
  }
  const now = current?.distinctFoods ?? 0;
  return {
    kind: 'compare',
    thisMonth: month,
    previousMonth,
    current: now,
    previous: previous.distinctFoods,
    delta: now - previous.distinctFoods,
  };
}
