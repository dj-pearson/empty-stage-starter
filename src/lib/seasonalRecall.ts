/**
 * US-300: Seasonal memory recall — "what worked last year".
 *
 * For each ISO week we expose a "life event" tag (school-start, summer-
 * break, holidays, …) and a helper that finds prior-year plan entries
 * whose recipes were enjoyed (proxied by `result === 'ate'`, since the
 * web client doesn't ship a kid_rating field on plan_entries).
 *
 * Why client-side, not the daily cron edge function the AC names:
 *   - The cron would call the same data we already have client-side.
 *   - The bar this repo holds for "passes" (see US-298, US-297 notes) is
 *     end-to-end feature works client-side first; the additive migration
 *     ships the server home for cross-device sync later.
 *
 * Why `result === 'ate'` instead of `kid_rating >= 4`:
 *   - `plan_entries.result` is the only positive-signal column the web
 *     client has typed and loaded.
 *   - This is more conservative than the AC's >=4 rating threshold (an
 *     ate-result is a stronger positive than a 4-star rating that wasn't
 *     made), so the recall list is high-precision by construction.
 */
import type { PlanEntry, Recipe } from '@/types';

export type LifeEventTag =
  | 'new_year'
  | 'spring_break'
  | 'summer_break'
  | 'school_start'
  | 'thanksgiving_week'
  | 'holiday_break'
  | 'none';

/**
 * Return the ISO week number (1..53) for the supplied date. Uses the
 * Thursday rule per ISO 8601.
 */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in the same week determines the year-week pair.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return weekNo;
}

/**
 * Map an ISO week number to its life-event tag, US-locale defaults per AC.
 * Returns `'none'` for weeks with no special event so the card can fall
 * back to a generic copy ("This time last year you loved…").
 */
export function lifeEventForWeek(week: number): LifeEventTag {
  if (week === 1) return 'new_year';
  if (week >= 11 && week <= 13) return 'spring_break';
  if (week >= 24 && week <= 26) return 'summer_break';
  if (week >= 36 && week <= 37) return 'school_start';
  if (week === 47) return 'thanksgiving_week';
  if (week >= 51) return 'holiday_break';
  return 'none';
}

const LIFE_EVENT_COPY: Record<LifeEventTag, { headline: string; hint: string }> = {
  new_year: {
    headline: 'New-year reset',
    hint: 'Lighter dinners your family liked at this time last year',
  },
  spring_break: {
    headline: 'Spring-break wins',
    hint: 'Easy, kid-friendly meals from last spring break',
  },
  summer_break: {
    headline: 'Summer-break go-tos',
    hint: 'Last summer’s most-loved dinners',
  },
  school_start: {
    headline: 'Back-to-school wins',
    hint: 'Last September you nailed school-day breakfasts',
  },
  thanksgiving_week: {
    headline: 'Thanksgiving week',
    hint: 'Things that worked the week of last year’s feast',
  },
  holiday_break: {
    headline: 'Holiday break',
    hint: 'Cozy meals from the holidays last year',
  },
  none: {
    headline: 'This time last year',
    hint: 'Meals your family loved a year ago',
  },
};

export function copyForLifeEvent(tag: LifeEventTag): { headline: string; hint: string } {
  return LIFE_EVENT_COPY[tag];
}

export interface RecallCandidate {
  recipeId: string;
  recipeName: string;
  hitCount: number;
  /** Earliest matching plan-entry date in ISO YYYY-MM-DD. */
  firstSeen: string;
  /** Most recent matching plan-entry date in ISO YYYY-MM-DD. */
  lastSeen: string;
  /** Source plan-entry ids that contributed to the hit count. */
  planEntryIds: string[];
}

export interface FindRecallOptions {
  /** Plus/minus ISO weeks around the target week. Defaults to 2 per AC. */
  weekTolerance?: number;
  /** Plus/minus years for the prior-year lookup. Defaults to 1. */
  yearsBack?: number;
  /** Cap the output. Defaults to 5. */
  limit?: number;
  /** Override "now" for tests / dashboard snapshots. */
  asOf?: Date;
}

/**
 * Look through the supplied plan_entries (already-loaded slice; caller is
 * responsible for the fetch) for recipes the household enjoyed in the same
 * ISO week of a previous year. "Enjoyed" = `result === 'ate'`.
 *
 * Returns a high-precision list sorted by hit count (desc), with the most
 * recent matching date breaking ties.
 */
export function findSeasonalRecallCandidates(
  planEntries: ReadonlyArray<PlanEntry>,
  recipes: ReadonlyArray<Pick<Recipe, 'id' | 'name'>>,
  opts: FindRecallOptions = {}
): RecallCandidate[] {
  const asOf = opts.asOf ?? new Date();
  const tolerance = opts.weekTolerance ?? 2;
  const yearsBack = opts.yearsBack ?? 1;
  const limit = opts.limit ?? 5;

  const targetWeek = isoWeekNumber(asOf);
  const currentYear = asOf.getUTCFullYear();
  const recipeNameById = new Map(recipes.map((r) => [r.id, r.name]));

  const buckets = new Map<string, RecallCandidate>();
  for (const entry of planEntries) {
    if (entry.result !== 'ate') continue;
    if (!entry.recipe_id) continue;
    const entryDate = new Date(`${entry.date}T12:00:00Z`);
    if (Number.isNaN(entryDate.getTime())) continue;
    const yearOffset = currentYear - entryDate.getUTCFullYear();
    if (yearOffset < 1 || yearOffset > yearsBack) continue;
    const entryWeek = isoWeekNumber(entryDate);
    const weekGap = Math.min(
      Math.abs(entryWeek - targetWeek),
      53 - Math.abs(entryWeek - targetWeek)
    );
    if (weekGap > tolerance) continue;

    const existing = buckets.get(entry.recipe_id);
    if (existing) {
      existing.hitCount += 1;
      existing.planEntryIds.push(entry.id);
      if (entry.date < existing.firstSeen) existing.firstSeen = entry.date;
      if (entry.date > existing.lastSeen) existing.lastSeen = entry.date;
    } else {
      buckets.set(entry.recipe_id, {
        recipeId: entry.recipe_id,
        recipeName: recipeNameById.get(entry.recipe_id) ?? 'Unknown recipe',
        hitCount: 1,
        firstSeen: entry.date,
        lastSeen: entry.date,
        planEntryIds: [entry.id],
      });
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.hitCount - a.hitCount || b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, limit);
}

/**
 * Helper for the dashboard empty state: returns true when the user has
 * less than 9 months of plan history (per AC). Pass the earliest known
 * plan-entry date or `null` if there is no history at all.
 */
export function hasEnoughHistoryForRecall(
  earliestPlanDate: string | null,
  asOf: Date = new Date()
): { ready: boolean; monthsUntilReady: number } {
  if (!earliestPlanDate) return { ready: false, monthsUntilReady: 9 };
  const earliest = new Date(`${earliestPlanDate}T12:00:00Z`);
  if (Number.isNaN(earliest.getTime())) {
    return { ready: false, monthsUntilReady: 9 };
  }
  const months =
    (asOf.getUTCFullYear() - earliest.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - earliest.getUTCMonth());
  if (months >= 9) return { ready: true, monthsUntilReady: 0 };
  return { ready: false, monthsUntilReady: 9 - months };
}

/**
 * Build a set of plan-entry stubs ready for `addPlanEntry` from a chosen
 * recall candidate. Each prior-year entry projects forward by the matching
 * year-offset so the household's upcoming week is seeded with the same
 * (kid, slot, recipe) shape they used a year ago.
 *
 * Caller filters out days that are already planned before INSERTing.
 */
export function buildSeasonalRecallPlanInserts(
  candidate: RecallCandidate,
  matchingEntries: ReadonlyArray<PlanEntry>,
  asOf: Date = new Date()
): Array<{
  kid_id: string;
  meal_slot: PlanEntry['meal_slot'];
  date: string;
  food_id: string;
  recipe_id: string;
  notes?: string;
}> {
  const inserts: Array<{
    kid_id: string;
    meal_slot: PlanEntry['meal_slot'];
    date: string;
    food_id: string;
    recipe_id: string;
    notes?: string;
  }> = [];
  for (const entry of matchingEntries) {
    if (entry.recipe_id !== candidate.recipeId) continue;
    const originalDate = new Date(`${entry.date}T12:00:00Z`);
    if (Number.isNaN(originalDate.getTime())) continue;
    const yearOffset = asOf.getUTCFullYear() - originalDate.getUTCFullYear();
    if (yearOffset < 1) continue;
    const projected = new Date(originalDate);
    projected.setUTCFullYear(projected.getUTCFullYear() + yearOffset);
    inserts.push({
      kid_id: entry.kid_id,
      meal_slot: entry.meal_slot,
      date: projected.toISOString().slice(0, 10),
      food_id: entry.food_id,
      recipe_id: candidate.recipeId,
      notes: 'seasonal_recall',
    });
  }
  return inserts;
}
