import { describe, it, expect } from 'vitest';
import {
  isoWeekNumber,
  lifeEventForWeek,
  findSeasonalRecallCandidates,
  hasEnoughHistoryForRecall,
  buildSeasonalRecallPlanInserts,
} from './seasonalRecall';
import type { PlanEntry } from '@/types';

const REFERENCE_NOW = new Date('2026-09-09T12:00:00Z'); // ISO week 37 — back-to-school
const SAME_WEEK_LAST_YEAR_START = '2025-09-07'; // Mon of ISO week 37 in 2025

function entry(overrides: Partial<PlanEntry> & { id: string; date: string }): PlanEntry {
  const hasResult = Object.prototype.hasOwnProperty.call(overrides, 'result');
  return {
    id: overrides.id,
    kid_id: overrides.kid_id ?? 'kid-1',
    date: overrides.date,
    meal_slot: overrides.meal_slot ?? 'dinner',
    food_id: overrides.food_id ?? 'food-x',
    // Explicit null/'refused'/'tasted' should round-trip; the `??` operator
    // would overwrite null with 'ate' and silently break negative-result tests.
    result: hasResult ? (overrides.result as PlanEntry['result']) : 'ate',
    recipe_id: overrides.recipe_id ?? 'recipe-a',
    notes: overrides.notes,
    food_attempt_id: overrides.food_attempt_id,
    is_primary_dish: overrides.is_primary_dish,
  };
}

describe('isoWeekNumber', () => {
  it('returns week 37 for 2026-09-09', () => {
    expect(isoWeekNumber(REFERENCE_NOW)).toBe(37);
  });

  it('returns week 1 for 2026-01-01 (Thursday — week 1 by ISO rule)', () => {
    expect(isoWeekNumber(new Date('2026-01-01T12:00:00Z'))).toBe(1);
  });
});

describe('lifeEventForWeek', () => {
  it('tags back-to-school in weeks 36-37', () => {
    expect(lifeEventForWeek(36)).toBe('school_start');
    expect(lifeEventForWeek(37)).toBe('school_start');
  });

  it('tags Thanksgiving week 47', () => {
    expect(lifeEventForWeek(47)).toBe('thanksgiving_week');
  });

  it('tags holiday break in weeks 51+', () => {
    expect(lifeEventForWeek(51)).toBe('holiday_break');
    expect(lifeEventForWeek(52)).toBe('holiday_break');
  });

  it('falls back to none for ordinary weeks', () => {
    expect(lifeEventForWeek(20)).toBe('none');
  });
});

describe('findSeasonalRecallCandidates', () => {
  const recipes = [
    { id: 'recipe-a', name: 'Sheet-pan chicken' },
    { id: 'recipe-b', name: 'One-pot pasta' },
    { id: 'recipe-c', name: 'Tacos' },
  ];

  it('includes recipes that landed in the prior-year ±2 week window with ate result', () => {
    const entries: PlanEntry[] = [
      entry({ id: 'e1', date: SAME_WEEK_LAST_YEAR_START, recipe_id: 'recipe-a' }),
      entry({ id: 'e2', date: '2025-09-08', recipe_id: 'recipe-a' }),
      entry({ id: 'e3', date: '2025-09-09', recipe_id: 'recipe-b' }),
    ];
    const out = findSeasonalRecallCandidates(entries, recipes, { asOf: REFERENCE_NOW });
    expect(out.map((r) => r.recipeId)).toEqual(['recipe-a', 'recipe-b']);
    expect(out[0].hitCount).toBe(2);
  });

  it('excludes entries with result !== ate', () => {
    const entries: PlanEntry[] = [
      entry({ id: 'e1', date: SAME_WEEK_LAST_YEAR_START, recipe_id: 'recipe-a', result: 'refused' }),
      entry({ id: 'e2', date: '2025-09-08', recipe_id: 'recipe-b', result: null }),
    ];
    const out = findSeasonalRecallCandidates(entries, recipes, { asOf: REFERENCE_NOW });
    expect(out).toHaveLength(0);
  });

  it('respects the week tolerance window', () => {
    const entries: PlanEntry[] = [
      // 6 weeks before target — should be excluded
      entry({ id: 'e1', date: '2025-07-30', recipe_id: 'recipe-a' }),
      // 1 week before — included
      entry({ id: 'e2', date: '2025-09-02', recipe_id: 'recipe-b' }),
    ];
    const out = findSeasonalRecallCandidates(entries, recipes, { asOf: REFERENCE_NOW });
    expect(out.map((r) => r.recipeId)).toEqual(['recipe-b']);
  });

  it('skips entries from the current year (not historical)', () => {
    const entries: PlanEntry[] = [
      entry({ id: 'e1', date: '2026-09-07', recipe_id: 'recipe-a' }),
      entry({ id: 'e2', date: '2025-09-08', recipe_id: 'recipe-b' }),
    ];
    const out = findSeasonalRecallCandidates(entries, recipes, { asOf: REFERENCE_NOW });
    expect(out.map((r) => r.recipeId)).toEqual(['recipe-b']);
  });

  it('returns recipe name from the lookup map', () => {
    const entries: PlanEntry[] = [
      entry({ id: 'e1', date: SAME_WEEK_LAST_YEAR_START, recipe_id: 'recipe-a' }),
    ];
    const out = findSeasonalRecallCandidates(entries, recipes, { asOf: REFERENCE_NOW });
    expect(out[0].recipeName).toBe('Sheet-pan chicken');
  });

  it('honours the limit option', () => {
    const entries: PlanEntry[] = [
      entry({ id: 'e1', date: SAME_WEEK_LAST_YEAR_START, recipe_id: 'recipe-a' }),
      entry({ id: 'e2', date: '2025-09-08', recipe_id: 'recipe-b' }),
      entry({ id: 'e3', date: '2025-09-09', recipe_id: 'recipe-c' }),
    ];
    const out = findSeasonalRecallCandidates(entries, recipes, { asOf: REFERENCE_NOW, limit: 2 });
    expect(out).toHaveLength(2);
  });
});

describe('hasEnoughHistoryForRecall', () => {
  it('returns ready=true when >=9 months of history', () => {
    const r = hasEnoughHistoryForRecall('2025-01-01', new Date('2026-05-20T12:00:00Z'));
    expect(r.ready).toBe(true);
    expect(r.monthsUntilReady).toBe(0);
  });

  it('returns the months remaining when short', () => {
    const r = hasEnoughHistoryForRecall('2026-01-01', new Date('2026-04-01T12:00:00Z'));
    expect(r.ready).toBe(false);
    expect(r.monthsUntilReady).toBe(6);
  });

  it('treats no history as ready=false, 9 months out', () => {
    const r = hasEnoughHistoryForRecall(null);
    expect(r.ready).toBe(false);
    expect(r.monthsUntilReady).toBe(9);
  });
});

describe('buildSeasonalRecallPlanInserts', () => {
  it('projects each prior-year entry forward by the right number of years', () => {
    const candidate = {
      recipeId: 'recipe-a',
      recipeName: 'Sheet-pan chicken',
      hitCount: 2,
      firstSeen: '2025-09-07',
      lastSeen: '2025-09-08',
      planEntryIds: ['e1', 'e2'],
    };
    const matchingEntries: PlanEntry[] = [
      entry({ id: 'e1', date: '2025-09-07', recipe_id: 'recipe-a' }),
      entry({ id: 'e2', date: '2025-09-08', recipe_id: 'recipe-a' }),
      entry({ id: 'e3', date: '2025-09-09', recipe_id: 'recipe-b' }),
    ];
    const inserts = buildSeasonalRecallPlanInserts(candidate, matchingEntries, REFERENCE_NOW);
    expect(inserts).toHaveLength(2);
    expect(inserts[0].date).toBe('2026-09-07');
    expect(inserts[1].date).toBe('2026-09-08');
    expect(inserts[0].notes).toBe('seasonal_recall');
  });

  it('skips entries that do not match the candidate recipe', () => {
    const candidate = {
      recipeId: 'recipe-a',
      recipeName: 'Sheet-pan chicken',
      hitCount: 1,
      firstSeen: '2025-09-07',
      lastSeen: '2025-09-07',
      planEntryIds: ['e1'],
    };
    const inserts = buildSeasonalRecallPlanInserts(
      candidate,
      [entry({ id: 'e2', date: '2025-09-08', recipe_id: 'recipe-b' })],
      REFERENCE_NOW
    );
    expect(inserts).toHaveLength(0);
  });
});
