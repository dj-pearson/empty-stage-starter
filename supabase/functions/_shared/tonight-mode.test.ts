// Deno tests for the tonight-mode helpers (household scope + allergen match).
// Run with: deno test supabase/functions/_shared/tonight-mode.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isOnHand,
  kidFitFor,
  tonightScope,
  tonightScopeFilter,
  varietyScore,
  type FoodRow,
  type KidRow,
} from './tonight-mode.ts';

const kid = (allergens: string[], disliked: string[] = []): KidRow => ({
  id: 'kid-1',
  name: 'Ava',
  allergens,
  disliked_foods: disliked,
});

const foods = (rows: Array<[string, string[]]>): Map<string, FoodRow> =>
  new Map(rows.map(([id, allergens]) => [id, { id, name: id, allergens }]));

// --- allergens --------------------------------------------------------------

// Each of these pairs read as safe under the old exact lowercase compare.
const VARIANTS: Array<[string, string]> = [
  ['peanuts', 'Peanut'],
  ['tree nuts', 'en:tree-nuts'],
  ['tree nuts', 'tree_nuts'],
  ['milk', 'dairy'],
  ['soy', 'en:soybeans'],
  ['sesame', 'en:sesame-seeds'],
  ['wheat', 'gluten'],
  ['eggs', 'EGG'],
];

for (const [kidSide, foodSide] of VARIANTS) {
  Deno.test(`kidFitFor: kid "${kidSide}" hits food "${foodSide}"`, () => {
    const fit = kidFitFor(kid([kidSide]), ['f'], foods([['f', [foodSide]]]));
    assertEquals(fit.allergenHits, ['f']);
    assertEquals(fit.score, 0);
  });
}

Deno.test('kidFitFor: peanut is not a tree nut', () => {
  const fit = kidFitFor(kid(['tree nuts']), ['f'], foods([['f', ['peanuts']]]));
  assertEquals(fit.allergenHits, []);
  assertEquals(fit.score, 1);
});

Deno.test('kidFitFor: an allergen hit is not also counted as an aversion', () => {
  const fit = kidFitFor(kid(['milk'], ['f']), ['f'], foods([['f', ['dairy']]]));
  assertEquals(fit.allergenHits, ['f']);
  assertEquals(fit.blockingAversions, []);
});

Deno.test('kidFitFor: dislikes by id and by name cost 0.25 each', () => {
  const fit = kidFitFor(
    kid([], ['a', 'B']),
    ['a', 'b', 'c'],
    foods([['a', []], ['b', []], ['c', []]]),
  );
  assertEquals(fit.blockingAversions, ['a', 'b']);
  assertEquals(fit.score, 0.5);
});

Deno.test('kidFitFor: unknown food ids are skipped, null allergens are safe', () => {
  const fit = kidFitFor(
    { id: 'k', name: 'K', allergens: null, disliked_foods: null },
    ['missing', 'f'],
    foods([['f', ['peanut']]]),
  );
  assertEquals(fit.allergenHits, []);
  assertEquals(fit.score, 1);
});

// --- scope ------------------------------------------------------------------

Deno.test('scope: a household member reads the whole household and only it', () => {
  // No user_id arm: a row the caller wrote into some other household stays out.
  assertEquals(
    tonightScopeFilter(tonightScope('user-1', 'hh-1')),
    'household_id.eq.hh-1',
  );
});

Deno.test('scope: no household reads only own rows not filed under a household', () => {
  assertEquals(
    tonightScopeFilter(tonightScope('user-1', null)),
    'and(user_id.eq.user-1,household_id.is.null)',
  );
});

Deno.test('scope: an empty household id falls back to the user scope', () => {
  assertEquals(tonightScope('user-1', ''), { kind: 'user', userId: 'user-1' });
});

// --- variety ----------------------------------------------------------------

Deno.test('varietyScore weights recent plans and ignores other recipes', () => {
  const now = Date.parse('2026-09-24T00:00:00Z');
  const score = varietyScore(
    'r1',
    [
      { recipe_id: 'r1', date: '2026-09-22' }, // 2 days -> 2
      { recipe_id: 'r1', date: '2026-09-12' }, // 12 days -> 1
      { recipe_id: 'r2', date: '2026-09-23' },
      { recipe_id: 'r1', date: 'not a date' },
    ],
    21,
    now,
  );
  assertEquals(score, (3 / 21) * 3);
});

// --- on hand ----------------------------------------------------------------

Deno.test('isOnHand treats expired and used-up food as missing', () => {
  const food = (quantity: number | null, expiry_date: string | null): FoodRow => ({
    id: 'f',
    name: 'Chicken',
    allergens: null,
    quantity,
    expiry_date,
  });
  const today = '2026-09-26';
  assertEquals(isOnHand(food(2, null), today), true);
  assertEquals(isOnHand(food(null, null), today), true);
  assertEquals(isOnHand(food(2, '2026-09-26'), today), true); // expires today: still usable
  assertEquals(isOnHand(food(2, '2026-09-25'), today), false);
  assertEquals(isOnHand(food(0, null), today), false);
});
