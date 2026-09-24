import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildHouseholdMonthly,
  householdLoggedDishes,
  monthOverMonth,
  monthsBetween,
  type HouseholdMonthRow,
} from './householdMonthly';
import type { KidLadderRow } from './kidProgress';
import type { MealResult, MealSlot, PlanEntry } from '@/types';

const kids = [{ id: 'k1' }, { id: 'k2' }];
const foods = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((id) => ({ id, name: `Food ${id}` }));
const recipes = [{ id: 'r1', name: 'Mac and cheese' }];

let seq = 0;
function entry(
  kid: string,
  date: string,
  food: string,
  result: MealResult,
  extra: Partial<PlanEntry> = {},
  slot: MealSlot = 'dinner'
): PlanEntry {
  seq += 1;
  return { id: `e${String(seq).padStart(4, '0')}`, kid_id: kid, date, meal_slot: slot, food_id: food, result, ...extra };
}

function rowFor(rows: HouseholdMonthRow[], kidId: string, month: string) {
  return rows.find((r) => r.kidId === kidId && r.month === month);
}

describe('buildHouseholdMonthly', () => {
  it('counts a 4-row recipe dinner as 1 dish and 1 ate', () => {
    const entries = ['f1', 'f2', 'f3', 'f4'].map((f, i) =>
      entry('k1', '2026-09-10', f, 'ate', { recipe_id: 'r1', is_primary_dish: i === 0 })
    );
    const rows = buildHouseholdMonthly({ entries, foods, recipes, kids, todayIso: '2026-09-24' });
    const r = rowFor(rows, 'k1', '2026-09');
    expect(r?.dishesLogged).toBe(1);
    expect(r?.ate).toBe(1);
    expect(r?.distinctFoods).toBe(1);
  });

  it('counts two kids eating the same dish once each', () => {
    const entries = [entry('k1', '2026-09-10', 'f1', 'ate'), entry('k2', '2026-09-10', 'f1', 'tasted')];
    const rows = buildHouseholdMonthly({ entries, foods, recipes, kids, todayIso: '2026-09-24' });
    expect(rowFor(rows, 'k1', '2026-09')).toMatchObject({ dishesLogged: 1, ate: 1, tasted: 0 });
    expect(rowFor(rows, 'k2', '2026-09')).toMatchObject({ dishesLogged: 1, ate: 0, tasted: 1 });
  });

  it('excludes future-dated rows', () => {
    const entries = [entry('k1', '2026-09-24', 'f1', 'ate'), entry('k1', '2026-09-25', 'f2', 'ate')];
    const rows = buildHouseholdMonthly({ entries, foods, recipes, kids, todayIso: '2026-09-24' });
    expect(rowFor(rows, 'k1', '2026-09')?.dishesLogged).toBe(1);
    expect(householdLoggedDishes({ entries, foods, recipes, kids, todayIso: '2026-09-24' })).toHaveLength(1);
  });

  it('buckets months by the local plan day', () => {
    const entries = [entry('k1', '2026-08-31', 'f1', 'ate'), entry('k1', '2026-09-01', 'f2', 'refused')];
    const rows = buildHouseholdMonthly({ entries, foods, recipes, kids, todayIso: '2026-09-24' });
    expect(rowFor(rows, 'k1', '2026-08')).toMatchObject({ dishesLogged: 1, ate: 1 });
    expect(rowFor(rows, 'k1', '2026-09')).toMatchObject({ dishesLogged: 1, refused: 1 });
  });

  it('buckets graduations by masteredOnIso', () => {
    const ladderRows: KidLadderRow[] = [
      { kid_id: 'k1', food_id: 'f1', status: 'mastered', current_rung: 'eating', last_attempt_at: '2026-07-15' },
      { kid_id: 'k1', food_id: 'f2', status: 'mastered', current_rung: 'eating', last_attempt_at: null, updated_at: '2026-08-02' },
      { kid_id: 'k1', food_id: 'f3', status: 'active', current_rung: 'tasting', last_attempt_at: '2026-08-03' },
    ];
    const rows = buildHouseholdMonthly({ entries: [], foods, recipes, kids, ladderRows, todayIso: '2026-09-24' });
    expect(rowFor(rows, 'k1', '2026-07')?.graduations).toBe(1);
    expect(rowFor(rows, 'k1', '2026-08')?.graduations).toBe(1);
    expect(rows.reduce((n, r) => n + r.graduations, 0)).toBe(2);
  });

  it('uses recipeId ?? foodId for distinct foods', () => {
    const entries = [
      entry('k1', '2026-09-01', 'f1', 'ate', { recipe_id: 'r1', is_primary_dish: true }),
      entry('k1', '2026-09-02', 'f2', 'ate', { recipe_id: 'r1', is_primary_dish: true }),
      entry('k1', '2026-09-03', 'f1', 'tasted'),
    ];
    const rows = buildHouseholdMonthly({ entries, foods, recipes, kids, todayIso: '2026-09-24' });
    // r1 twice (one dish), then plain f1: two distinct.
    expect(rowFor(rows, 'k1', '2026-09')).toMatchObject({ dishesLogged: 3, distinctFoods: 2 });
  });

  it('counts first tries once per dish', () => {
    const entries = [
      entry('k1', '2026-08-01', 'f1', 'refused'),
      entry('k1', '2026-08-02', 'f1', 'tasted'),
      entry('k1', '2026-09-02', 'f1', 'ate'),
    ];
    const rows = buildHouseholdMonthly({ entries, foods, recipes, kids, todayIso: '2026-09-24' });
    expect(rowFor(rows, 'k1', '2026-08')?.firstTries).toBe(1);
    expect(rowFor(rows, 'k1', '2026-09')?.firstTries).toBe(0);
  });
});

describe('monthOverMonth', () => {
  const base = { ate: 0, tasted: 0, refused: 0, firstTries: 0, graduations: 0 };

  it('is suppressed when the previous month has fewer than 5 dishes', () => {
    const rows: HouseholdMonthRow[] = [
      { ...base, kidId: 'k1', month: '2026-08', dishesLogged: 4, distinctFoods: 4 },
      { ...base, kidId: 'k1', month: '2026-09', dishesLogged: 9, distinctFoods: 7 },
    ];
    expect(monthOverMonth(rows, 'k1', '2026-09').kind).toBe('thin');
    expect(monthOverMonth(rows, 'k1').kind).toBe('thin');
  });

  it('compares distinct foods when the previous month has enough logged', () => {
    const rows: HouseholdMonthRow[] = [
      { ...base, kidId: 'k1', month: '2026-08', dishesLogged: 5, distinctFoods: 3 },
      { ...base, kidId: 'k1', month: '2026-09', dishesLogged: 9, distinctFoods: 7 },
    ];
    expect(monthOverMonth(rows, 'k1', '2026-09')).toMatchObject({ kind: 'compare', current: 7, previous: 3, delta: 4 });
  });

  it('is thin for a kid with no rows', () => {
    expect(monthOverMonth([], 'k1', '2026-09').kind).toBe('thin');
  });
});

describe('monthsBetween', () => {
  it('spans the year boundary', () => {
    expect(monthsBetween('2025-11-24', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('retired modules', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(path);
    }
    return out;
  }

  it('no src file imports reportGenerator, SmartInsights or WeeklyProgressReport', () => {
    const importer = /from\s+['"][^'"]*(?:\/lib\/reportGenerator|\/SmartInsights|\/WeeklyProgressReport)['"]|import\(\s*['"][^'"]*(?:reportGenerator|SmartInsights|WeeklyProgressReport)['"]/;
    const hits = walk(join(process.cwd(), 'src')).filter((file) => importer.test(readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
  });
});
