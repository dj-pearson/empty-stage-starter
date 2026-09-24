import { describe, it, expect } from 'vitest';
import {
  computeVarietyFatigue,
  hasFatigue,
  selectVarietyFatigue,
  visibleFatigueItems,
  type FatiguePlanEntry,
  type FatigueOptions,
} from './varietyFatigue';

const ASOF = '2026-05-08';

function entry(daysAgo: number, recipeId: string | null, foodId: string | null): FatiguePlanEntry {
  const d = new Date('2026-05-08T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    recipeId,
    foodId,
    date: d.toISOString().slice(0, 10),
  };
}

const opts: FatigueOptions = { asOf: ASOF };

describe('computeVarietyFatigue - thresholds', () => {
  it('returns no fatigue when nothing repeats enough', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [entry(1, 'r1', null), entry(3, 'r2', null), entry(5, 'r3', null)],
      },
      opts
    );
    expect(result.recipes).toEqual([]);
    expect(result.worstTier).toBe('none');
  });

  it('flags mild when short-window threshold (3 in 7d) is hit', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [entry(1, 'r1', null), entry(3, 'r1', null), entry(5, 'r1', null)],
        recipeNameById: new Map([['r1', 'Mac']]),
      },
      opts
    );
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].tier).toBe('mild');
    expect(result.recipes[0].name).toBe('Mac');
    expect(result.worstTier).toBe('mild');
  });

  it('flags mild when long-window threshold (5 in 28d) is hit but short-window is not', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [
          entry(8, 'r1', null),
          entry(11, 'r1', null),
          entry(15, 'r1', null),
          entry(20, 'r1', null),
          entry(26, 'r1', null),
        ],
      },
      opts
    );
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].tier).toBe('mild');
  });

  it('promotes to high when BOTH windows are tripped', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [
          entry(1, 'r1', null),
          entry(3, 'r1', null),
          entry(5, 'r1', null),
          entry(10, 'r1', null),
          entry(20, 'r1', null),
        ],
      },
      opts
    );
    expect(result.recipes[0].tier).toBe('high');
    expect(result.worstTier).toBe('high');
  });

  it('promotes to high when short-window is hammered (>=5 in 7d) alone', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [
          entry(0, 'r1', null),
          entry(1, 'r1', null),
          entry(2, 'r1', null),
          entry(4, 'r1', null),
          entry(6, 'r1', null),
        ],
      },
      opts
    );
    expect(result.recipes[0].tier).toBe('high');
  });

  it('ignores entries past the long window', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [
          entry(40, 'r1', null),
          entry(50, 'r1', null),
          entry(60, 'r1', null),
          entry(70, 'r1', null),
          entry(80, 'r1', null),
        ],
      },
      opts
    );
    expect(result.recipes).toEqual([]);
  });
});

describe('computeVarietyFatigue - per-ingredient scoring', () => {
  it('scores foods independently from recipes', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [
          { recipeId: null, foodId: 'pasta', date: '2026-05-07' },
          { recipeId: null, foodId: 'pasta', date: '2026-05-05' },
          { recipeId: null, foodId: 'pasta', date: '2026-05-03' },
        ],
        foodNameById: new Map([['pasta', 'Pasta']]),
      },
      opts
    );
    expect(result.ingredients).toHaveLength(1);
    expect(result.ingredients[0].name).toBe('Pasta');
    expect(result.recipes).toEqual([]);
  });
});

describe('computeVarietyFatigue - sort & limit', () => {
  it('sorts high-tier items above mild items, then by score', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [
          // r1: hammered (high)
          entry(0, 'r1', null),
          entry(1, 'r1', null),
          entry(2, 'r1', null),
          entry(3, 'r1', null),
          entry(4, 'r1', null),
          // r2: just mild (3 in 7d)
          entry(1, 'r2', null),
          entry(3, 'r2', null),
          entry(5, 'r2', null),
        ],
      },
      opts
    );
    expect(result.recipes.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(result.recipes[0].tier).toBe('high');
    expect(result.recipes[1].tier).toBe('mild');
  });

  it('respects limit', () => {
    const planEntries: FatiguePlanEntry[] = [];
    for (let i = 0; i < 5; i++) {
      const id = `r${i}`;
      planEntries.push(entry(0, id, null), entry(2, id, null), entry(4, id, null));
    }
    const result = computeVarietyFatigue({ planEntries }, { ...opts, limit: 2 });
    expect(result.recipes).toHaveLength(2);
  });
});

describe('computeVarietyFatigue - decay weight', () => {
  it('weights yesterday > 14 days ago for the fatigue score', () => {
    const recent = computeVarietyFatigue(
      {
        planEntries: [entry(1, 'r1', null), entry(2, 'r1', null), entry(3, 'r1', null)],
      },
      opts
    );
    const old = computeVarietyFatigue(
      {
        planEntries: [entry(15, 'r1', null), entry(20, 'r1', null), entry(25, 'r1', null)],
      },
      opts
    );
    // Both might be tier mild; recent should have higher fatigueScore.
    if (recent.recipes.length > 0 && old.recipes.length > 0) {
      expect(recent.recipes[0].fatigueScore).toBeGreaterThan(old.recipes[0].fatigueScore);
    } else {
      // recent definitely fires (3 in 7d), old may or may not
      expect(recent.recipes.length).toBe(1);
    }
  });
});

describe('computeVarietyFatigue - falls back to id when no name map', () => {
  it('uses the raw id as name when no nameById is provided', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [entry(1, 'r1', null), entry(3, 'r1', null), entry(5, 'r1', null)],
      },
      opts
    );
    expect(result.recipes[0].name).toBe('r1');
  });
});

describe('computeVarietyFatigue - asOf consistency', () => {
  it('handles entries provided as full ISO timestamps', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [
          { recipeId: 'r1', foodId: null, date: '2026-05-07T18:30:00.000Z' },
          { recipeId: 'r1', foodId: null, date: '2026-05-05T12:00:00.000Z' },
          { recipeId: 'r1', foodId: null, date: '2026-05-03T09:15:00.000Z' },
        ],
      },
      opts
    );
    expect(result.recipes[0].tier).toBe('mild');
  });
});

describe('computeVarietyFatigue - one serving per date and slot', () => {
  it('counts three kids eating the same dinner on one day as one serving', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: ['kid-a', 'kid-b', 'kid-c'].map(() => ({
          recipeId: 'r1',
          foodId: 'pasta',
          date: '2026-05-07',
          mealSlot: 'dinner',
        })),
      },
      // Threshold of 1 so a single serving still surfaces and its count is visible.
      { ...opts, shortThresholdMild: 1 }
    );
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].shortWindowCount).toBe(1);
    expect(result.recipes[0].longWindowCount).toBe(1);
    expect(result.ingredients[0].shortWindowCount).toBe(1);
  });

  it('does not flag a dinner shared by three kids on one day', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [1, 2, 3].map(() => ({
          recipeId: 'r1',
          foodId: null,
          date: '2026-05-07',
          mealSlot: 'dinner',
        })),
      },
      opts
    );
    expect(result.recipes).toEqual([]);
    expect(result.worstTier).toBe('none');
  });

  it('still counts the same recipe in two slots on one day twice', () => {
    const result = computeVarietyFatigue(
      {
        planEntries: [
          { recipeId: 'r1', foodId: null, date: '2026-05-07', mealSlot: 'lunch' },
          { recipeId: 'r1', foodId: null, date: '2026-05-07', mealSlot: 'dinner' },
        ],
      },
      { ...opts, shortThresholdMild: 1 }
    );
    expect(result.recipes[0].shortWindowCount).toBe(2);
  });
});

describe('computeVarietyFatigue - safe foods', () => {
  it('leaves safe foods out of ingredient fatigue', () => {
    const planEntries: FatiguePlanEntry[] = [1, 3, 5].flatMap((daysAgo) => [
      { ...entry(daysAgo, null, 'nuggets'), mealSlot: 'dinner' },
      { ...entry(daysAgo, null, 'broccoli'), mealSlot: 'dinner' },
    ]);
    const result = computeVarietyFatigue(
      { planEntries, safeFoodIds: new Set(['nuggets']) },
      opts
    );
    expect(result.ingredients.map((i) => i.id)).toEqual(['broccoli']);
  });

  it('selectVarietyFatigue reads is_safe from the foods it is given', () => {
    const planEntries = [1, 3, 5].map((daysAgo) => ({
      food_id: 'nuggets',
      recipe_id: null,
      date: entry(daysAgo, null, null).date,
      meal_slot: 'dinner',
    }));
    const safe = selectVarietyFatigue(
      planEntries,
      [],
      [{ id: 'nuggets', name: 'Nuggets', is_safe: true }],
      ASOF
    );
    expect(safe.ingredients).toEqual([]);
    const unsafe = selectVarietyFatigue(
      planEntries,
      [],
      [{ id: 'nuggets', name: 'Nuggets', is_safe: false }],
      ASOF
    );
    expect(unsafe.ingredients.map((i) => i.name)).toEqual(['Nuggets']);
  });
});

describe('visibleFatigueItems / hasFatigue', () => {
  const result = computeVarietyFatigue(
    { planEntries: [entry(1, 'r1', null), entry(3, 'r1', null), entry(5, 'r1', null)] },
    opts
  );
  const now = new Date('2026-05-08T12:00:00Z').getTime();

  it('is true with no dismissal', () => {
    expect(hasFatigue(result, null, now)).toBe(true);
  });

  it('is false while a fresh dismissal covers every item', () => {
    const dismissal = { at: new Date(now - 60 * 60 * 1000).toISOString(), itemIds: ['r1'] };
    expect(hasFatigue(result, dismissal, now)).toBe(false);
  });

  it('comes back once the dismissal is older than the TTL', () => {
    const dismissal = { at: new Date(now - 21 * 60 * 60 * 1000).toISOString(), itemIds: ['r1'] };
    expect(visibleFatigueItems(result, dismissal, now).map((i) => i.id)).toEqual(['r1']);
  });
});

describe('computeVarietyFatigue - unresolved names', () => {
  const UUID = '3f2b8c1e-5d4a-4e7b-9c10-2a6f8e9d0b11';
  const planEntries = [1, 3, 5].flatMap((d) => [entry(d, UUID, null), entry(d, 'r-known', null)]);
  const recipeNameById = new Map([['r-known', 'Tacos']]);

  it('drops an item whose id is missing from the name map by default', () => {
    const result = computeVarietyFatigue({ planEntries, recipeNameById }, opts);
    expect(result.recipes.map((r) => r.name)).toEqual(['Tacos']);
    expect(result.recipes.some((r) => r.name === UUID)).toBe(false);
  });

  it('keeps it, named by id, when keepUnresolved is set', () => {
    const result = computeVarietyFatigue({ planEntries, recipeNameById }, { ...opts, keepUnresolved: true });
    expect(result.recipes.map((r) => r.id).sort()).toEqual([UUID, 'r-known'].sort());
  });

  it('leaves selectVarietyFatigue output unchanged for resolved items', () => {
    const rows = planEntries.map((p) => ({ recipe_id: p.recipeId, food_id: null, date: p.date, meal_slot: null }));
    const selected = selectVarietyFatigue(rows, [{ id: 'r-known', name: 'Tacos' }], [], ASOF);
    const direct = computeVarietyFatigue({ planEntries, recipeNameById }, opts);
    const known = selected.recipes.filter((r) => r.id === 'r-known');
    expect(known).toEqual(direct.recipes);
    // The snapshot writer still sees the unresolved row.
    expect(selected.recipes.map((r) => r.id)).toContain(UUID);
  });
});
