import { describe, it, expect } from 'vitest';
import {
  normalizeProductName,
  restockHistoryFromGroceryItems,
  isFoodSeasonalOutOfWindow,
  forecastForFood,
  buildRestockIndex,
} from './depletionForecastWiring';

const REFERENCE_NOW = new Date('2026-05-13T12:00:00Z'); // mid-May, a Wednesday

function iso(daysAgo: number): string {
  const d = new Date(REFERENCE_NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

describe('normalizeProductName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeProductName('  Chicken   Breast  ')).toBe('chicken breast');
    expect(normalizeProductName('MILK')).toBe('milk');
  });
});

describe('restockHistoryFromGroceryItems', () => {
  it('matches case-insensitive on lowercased name', () => {
    const history = restockHistoryFromGroceryItems('Milk', [
      { name: 'milk', created_at: iso(14) },
      { name: 'MILK', created_at: iso(7) },
      { name: '  Milk ', created_at: iso(2) },
    ]);
    expect(history).toHaveLength(3);
    // Ascending
    expect(history[0].getTime()).toBeLessThan(history[1].getTime());
    expect(history[1].getTime()).toBeLessThan(history[2].getTime());
  });

  it('drops rows with missing or invalid created_at', () => {
    const history = restockHistoryFromGroceryItems('eggs', [
      { name: 'eggs', created_at: undefined },
      { name: 'eggs', created_at: 'not-a-date' },
      { name: 'eggs', created_at: iso(7) },
    ]);
    expect(history).toHaveLength(1);
  });

  it('ignores rows for other foods', () => {
    const history = restockHistoryFromGroceryItems('milk', [
      { name: 'eggs', created_at: iso(14) },
      { name: 'milk', created_at: iso(7) },
      { name: 'cheese', created_at: iso(2) },
    ]);
    expect(history).toHaveLength(1);
  });
});

describe('isFoodSeasonalOutOfWindow', () => {
  it('flags watermelon as out-of-window in January', () => {
    const jan = new Date('2026-01-15T12:00:00Z');
    expect(isFoodSeasonalOutOfWindow({ name: 'watermelon' }, jan)).toBe(true);
  });

  it('keeps watermelon in-window in July', () => {
    const july = new Date('2026-07-15T12:00:00Z');
    expect(isFoodSeasonalOutOfWindow({ name: 'watermelon' }, july)).toBe(false);
  });

  it('returns false (in-window, no suppression) for un-listed foods', () => {
    expect(isFoodSeasonalOutOfWindow({ name: 'milk' }, REFERENCE_NOW)).toBe(false);
  });
});

describe('forecastForFood', () => {
  it('returns null when food has no quantity', () => {
    const f = forecastForFood(
      { id: 'a', name: 'milk', quantity: undefined },
      [],
      { asOf: REFERENCE_NOW }
    );
    expect(f).toBeNull();
  });

  it('returns high confidence when grocery history is steady', () => {
    const items = [42, 35, 28, 21, 14, 7].map((n) => ({
      name: 'Milk',
      created_at: iso(n),
    }));
    const f = forecastForFood(
      { id: 'a', name: 'Milk', quantity: 2 },
      items,
      { asOf: REFERENCE_NOW }
    );
    expect(f).not.toBeNull();
    expect(f!.confidence).toBe('high');
    expect(f!.cycleCount).toBe(5);
    expect(f!.dailyConsumption).toBeCloseTo(1 / 7, 5);
    expect(f!.daysToDepletion).toBe(14); // 2 / (1/7) = 14
  });

  it('downgrades confidence to low for seasonal out-of-window foods', () => {
    const jan = new Date('2026-01-15T12:00:00Z');
    const items = [42, 35, 28, 21, 14, 7].map((n) => ({
      name: 'watermelon',
      // shift "now" to January for both history + asOf
      created_at: (() => {
        const d = new Date(jan);
        d.setUTCDate(d.getUTCDate() - n);
        return d.toISOString();
      })(),
    }));
    const f = forecastForFood(
      { id: 'a', name: 'watermelon', quantity: 2 },
      items,
      { asOf: jan }
    );
    expect(f).not.toBeNull();
    expect(f!.confidence).toBe('low');
  });

  it('falls back to cold-start when no matching grocery history exists', () => {
    const f = forecastForFood(
      { id: 'a', name: 'sriracha', quantity: 1 },
      [{ name: 'milk', created_at: iso(7) }],
      { asOf: REFERENCE_NOW }
    );
    expect(f).not.toBeNull();
    expect(f!.confidence).toBe('cold-start');
  });
});

describe('buildRestockIndex + forecastForFood(food, index)', () => {
  const items = [
    ...[42, 35, 28, 21, 14, 7].map((n) => ({ name: 'Milk', created_at: iso(n) })),
    { name: '  milk ', created_at: iso(3) },
    { name: 'Eggs', created_at: iso(20) },
    { name: 'Eggs', created_at: iso(5) },
    { name: 'Eggs', created_at: 'not-a-date' },
    { name: 'Bread', created_at: undefined },
  ];
  const foods = [
    { id: 'm', name: 'Milk', quantity: 2 },
    { id: 'e', name: 'EGGS', quantity: 6 },
    { id: 'b', name: 'Bread', quantity: 1 },
    { id: 'x', name: 'Saffron', quantity: 1 },
    { id: 'n', name: 'Milk', quantity: undefined },
  ];

  it('holds the same histories restockHistoryFromGroceryItems returns', () => {
    const index = buildRestockIndex(items);
    for (const name of ['Milk', 'Eggs']) {
      expect(index.get(normalizeProductName(name))).toEqual(restockHistoryFromGroceryItems(name, items));
    }
    expect(index.has('bread')).toBe(false);
  });

  it('gives identical output from both call forms', () => {
    const index = buildRestockIndex(items);
    for (const food of foods) {
      expect(forecastForFood(food, index, { asOf: REFERENCE_NOW })).toEqual(
        forecastForFood(food, items, { asOf: REFERENCE_NOW })
      );
    }
  });

  it('reads the index once per food and never walks the grocery rows', () => {
    const index = buildRestockIndex(items);
    const lookups: string[] = [];
    const spied = new Map(index);
    const get = spied.get.bind(spied);
    spied.get = (key: string) => {
      lookups.push(key);
      return get(key);
    };
    // Mutating the rows after indexing would change a per-food walk; it must
    // not change the indexed forecast.
    const before = forecastForFood(foods[0], spied, { asOf: REFERENCE_NOW });
    items.push({ name: 'Milk', created_at: iso(1) });
    const after = forecastForFood(foods[0], spied, { asOf: REFERENCE_NOW });
    items.pop();
    expect(after).toEqual(before);
    expect(lookups).toEqual(['milk', 'milk']);
  });
});
