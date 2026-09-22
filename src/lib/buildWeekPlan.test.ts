import { describe, it, expect } from 'vitest';
import { buildWeekPlan } from './mealPlanner';
import { toISODate } from './date-utils';
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

const KID = { id: 'kid-1' };

const dateKeys = (entries: Omit<PlanEntry, 'id'>[]) =>
  [...new Set(entries.map((e) => e.date))].sort();

describe('buildWeekPlan (US-715)', () => {
  it('builds the seven days starting at the requested date', () => {
    const plan = buildWeekPlan(KID, FOODS, [], new Date('2026-09-06T00:00:00'));
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
    const plan = buildWeekPlan(KID, FOODS, [], new Date('2026-10-04T00:00:00'));
    expect(dateKeys(plan)[0]).toBe('2026-10-04');
    expect(dateKeys(plan)).toHaveLength(7);
  });

  it('returns no ids: the server assigns them', () => {
    const plan = buildWeekPlan(KID, FOODS, [], new Date('2026-09-06T00:00:00'));
    expect(plan.length).toBeGreaterThan(0);
    for (const entry of plan) {
      expect(entry).not.toHaveProperty('id');
    }
  });

  it('only ever builds for the kid it was asked about', () => {
    const plan = buildWeekPlan(KID, FOODS, [], new Date('2026-09-06T00:00:00'));
    expect([...new Set(plan.map((e) => e.kid_id))]).toEqual(['kid-1']);
  });

  it('does not return anything belonging to another kid or another week', () => {
    // History carries another kid and another week. The builder reads history
    // for variety only; nothing from it may come back out as an entry.
    const history: PlanEntry[] = [
      { id: 'x', kid_id: 'kid-2', date: '2026-09-06', meal_slot: 'lunch', food_id: 'safe1', result: null },
      { id: 'y', kid_id: 'kid-1', date: '2026-08-01', meal_slot: 'lunch', food_id: 'safe2', result: null },
    ];
    const plan = buildWeekPlan(KID, FOODS, history, new Date('2026-09-06T00:00:00'));
    expect(plan.some((e) => e.kid_id === 'kid-2')).toBe(false);
    expect(plan.some((e) => e.date === '2026-08-01')).toBe(false);
  });

  it('still defaults to today when no week is given', () => {
    // toISODate, not toISOString().split('T')[0]. The suite runs in
    // America/Los_Angeles on purpose (US-828, vitest.config.ts) and buildWeekPlan
    // keys the LOCAL calendar day (US-818), so the UTC key this used to compare
    // against is a different day for the seven hours between 5pm Pacific and
    // midnight UTC. It passed for seventeen hours out of twenty-four and failed
    // in CI at 00:02 UTC, which reads as a flake and is not one: it is the exact
    // off-by-one that TZ setting exists to expose, asserted from the wrong side.
    const todayKey = toISODate(new Date());
    const plan = buildWeekPlan(KID, FOODS, []);
    expect(dateKeys(plan)[0]).toBe(todayKey);
  });

  it('refuses to build without safe foods', () => {
    expect(() =>
      buildWeekPlan(KID, [food('try1', { is_safe: false, is_try_bite: true })], []),
    ).toThrow(/safe foods/i);
  });

  it('refuses to build without try bites', () => {
    expect(() => buildWeekPlan(KID, [food('safe1')], [])).toThrow(/try bite/i);
  });
});

describe('buildWeekPlan allergen guard', () => {
  // Two siblings share one pantry. Peanut butter is a safe food for the
  // brother, so it is marked safe household-wide; Maya is allergic.
  const MAYA = { id: 'maya', allergens: ['peanuts'] };
  const PANTRY: Food[] = [
    food('pb', { allergens: ['Peanuts'] }),
    food('pb-crackers', { allergens: ['en:peanuts', 'wheat'] }),
    food('rice'),
    food('chicken'),
    food('peanut-try', { is_safe: false, is_try_bite: true, allergens: ['peanut'] }),
    food('pear', { is_safe: false, is_try_bite: true }),
  ];

  it('never schedules a food carrying the child\'s allergen, whatever its spelling', () => {
    for (let run = 0; run < 25; run++) {
      const plan = buildWeekPlan(MAYA, PANTRY, [], new Date('2026-09-06T00:00:00'));
      const ids = new Set(plan.map((e) => e.food_id));
      expect(ids.has('pb')).toBe(false);
      expect(ids.has('pb-crackers')).toBe(false);
      expect(ids.has('peanut-try')).toBe(false);
    }
  });

  it('still uses those foods for a sibling without the allergen', () => {
    const seen = new Set<string>();
    for (let run = 0; run < 25; run++) {
      for (const e of buildWeekPlan({ id: 'leo' }, PANTRY, [], new Date('2026-09-06T00:00:00'))) {
        seen.add(e.food_id);
      }
    }
    expect(seen.has('pb')).toBe(true);
  });

  it('says why when the allergen removes every safe food', () => {
    const onlyPeanut = [food('pb', { allergens: ['peanuts'] }), food('pear', { is_safe: false, is_try_bite: true })];
    expect(() => buildWeekPlan(MAYA, onlyPeanut, [])).toThrow(/allergens/i);
  });
});
