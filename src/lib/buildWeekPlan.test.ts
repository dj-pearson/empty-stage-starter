import { describe, it, expect } from 'vitest';
import { buildWeekPlan } from './mealPlanner';
import type { Food, PlanEntry } from '@/types';

/**
 * US-715: Quick Build has to build the week ON SCREEN and hand back entries the
 * server can assign ids to.
 *
 * It used to start from its own new Date() and invent ids, and the caller
 * dropped the result into setPlanEntries -- local state only. Paging to next
 * week and building produced this week's dates, nothing was inserted, and the
 * wholesale replace wiped every other kid and every other week.
 */

const food = (id: string, over: Partial<Food> = {}): Food =>
  ({
    id,
    name: id,
    category: 'protein',
    unit: 'servings',
    is_safe: true,
    is_try_bite: false,
    ...over,
  }) as Food;

const FOODS: Food[] = [
  food('safe1'),
  food('safe2'),
  food('safe3'),
  food('try1', { is_safe: false, is_try_bite: true }),
  food('try2', { is_safe: false, is_try_bite: true }),
];

const dateKeys = (entries: Omit<PlanEntry, 'id'>[]) =>
  [...new Set(entries.map((e) => e.date))].sort();

describe('buildWeekPlan (US-715)', () => {
  it('builds the seven days starting at the requested date', () => {
    const plan = buildWeekPlan('kid-1', FOODS, [], new Date('2026-09-06T00:00:00'));
    expect(dateKeys(plan)).toEqual([
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
  });

  it('builds a different week when a different week is asked for', () => {
    const plan = buildWeekPlan('kid-1', FOODS, [], new Date('2026-10-04T00:00:00'));
    expect(dateKeys(plan)[0]).toBe('2026-10-04');
    expect(dateKeys(plan)).toHaveLength(7);
  });

  it('returns no ids: the server assigns them', () => {
    const plan = buildWeekPlan('kid-1', FOODS, [], new Date('2026-09-06T00:00:00'));
    expect(plan.length).toBeGreaterThan(0);
    for (const entry of plan) {
      expect(entry).not.toHaveProperty('id');
    }
  });

  it('only ever builds for the kid it was asked about', () => {
    const plan = buildWeekPlan('kid-1', FOODS, [], new Date('2026-09-06T00:00:00'));
    expect([...new Set(plan.map((e) => e.kid_id))]).toEqual(['kid-1']);
  });

  it('does not return anything belonging to another kid or another week', () => {
    // History carries another kid and another week. The builder reads history
    // for variety only; nothing from it may come back out as an entry.
    const history: PlanEntry[] = [
      { id: 'x', kid_id: 'kid-2', date: '2026-09-06', meal_slot: 'lunch', food_id: 'safe1', result: null },
      { id: 'y', kid_id: 'kid-1', date: '2026-08-01', meal_slot: 'lunch', food_id: 'safe2', result: null },
    ];
    const plan = buildWeekPlan('kid-1', FOODS, history, new Date('2026-09-06T00:00:00'));
    expect(plan.some((e) => e.kid_id === 'kid-2')).toBe(false);
    expect(plan.some((e) => e.date === '2026-08-01')).toBe(false);
  });

  it('still defaults to today when no week is given', () => {
    const todayKey = new Date().toISOString().split('T')[0];
    const plan = buildWeekPlan('kid-1', FOODS, []);
    expect(dateKeys(plan)[0]).toBe(todayKey);
  });

  it('refuses to build without safe foods', () => {
    expect(() =>
      buildWeekPlan('kid-1', [food('try1', { is_safe: false, is_try_bite: true })], []),
    ).toThrow(/safe foods/i);
  });

  it('refuses to build without try bites', () => {
    expect(() => buildWeekPlan('kid-1', [food('safe1')], [])).toThrow(/try bite/i);
  });
});
