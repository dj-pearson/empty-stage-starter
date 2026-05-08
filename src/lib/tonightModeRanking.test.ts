import { describe, it, expect } from 'vitest';
import {
  scoreRecipes,
  topSuggestions,
  evaluateKidFit,
  computeVarietyScore,
  type KidContext,
  type PantryFood,
  type RecipeContext,
  type RecentPlanEntry,
} from './tonightModeRanking';

const food = (id: string, name: string, allergens: string[] = []) => ({
  id,
  name,
  allergens,
});

const recipe = (
  id: string,
  name: string,
  foods: ReturnType<typeof food>[],
  prepMinutes = 20,
): RecipeContext => ({
  id,
  name,
  prepMinutes,
  foodIds: foods.map((f) => f.id),
  foods,
  imageUrl: null,
});

const kid = (
  id: string,
  name: string,
  opts: { allergens?: string[]; disliked?: string[] } = {},
): KidContext => ({
  id,
  name,
  allergens: opts.allergens ?? [],
  dislikedFoods: opts.disliked ?? [],
});

describe('computeVarietyScore', () => {
  it('returns 0 for an unmade recipe', () => {
    expect(computeVarietyScore('r1', [])).toBe(0);
  });

  it('weights last 7 days twice as heavy as 8-14', () => {
    const recent: RecentPlanEntry[] = [
      { recipeId: 'r1', daysAgo: 3 },
      { recipeId: 'r1', daysAgo: 10 },
    ];
    const score = computeVarietyScore('r1', recent);
    // weight 2 + 1 = 3; (3/21)*3 = 0.428...
    expect(score).toBeCloseTo(3 / 21 * 3, 4);
  });

  it('caps at 1.0 even with extreme repetition', () => {
    const recent: RecentPlanEntry[] = Array.from({ length: 30 }, (_, i) => ({
      recipeId: 'r1',
      daysAgo: 1,
    }));
    expect(computeVarietyScore('r1', recent)).toBe(1);
  });

  it('ignores entries past lookback window', () => {
    const recent: RecentPlanEntry[] = [
      { recipeId: 'r1', daysAgo: 30 },
      { recipeId: 'r1', daysAgo: 60 },
    ];
    expect(computeVarietyScore('r1', recent, 21)).toBe(0);
  });
});

describe('evaluateKidFit', () => {
  const dairy = food('milk', 'Milk', ['dairy']);
  const peanut = food('pb', 'Peanut Butter', ['peanut']);
  const onion = food('on', 'Onion');
  const chicken = food('ch', 'Chicken');

  it('flags allergens and forces score to 0', () => {
    const r = recipe('r', 'PB Sandwich', [peanut, food('br', 'Bread')]);
    const k = kid('k1', 'Mia', { allergens: ['peanut'] });
    const fit = evaluateKidFit(r, k);
    expect(fit.allergenHits).toContain('Peanut Butter');
    expect(fit.score).toBe(0);
  });

  it('penalizes blocking aversions', () => {
    const r = recipe('r', 'Onion Soup', [onion, chicken]);
    const k = kid('k1', 'Jake', { disliked: ['Onion'] });
    const fit = evaluateKidFit(r, k);
    expect(fit.blockingAversions).toContain('Onion');
    expect(fit.allergenHits).toHaveLength(0);
    expect(fit.score).toBeCloseTo(0.75, 3);
  });

  it('matches disliked foods by id OR by name (case insensitive)', () => {
    const r = recipe('r', 'Stew', [onion, chicken]);
    const byId = evaluateKidFit(r, kid('k', 'A', { disliked: ['on'] }));
    const byName = evaluateKidFit(r, kid('k', 'B', { disliked: ['ONION'] }));
    expect(byId.blockingAversions).toContain('Onion');
    expect(byName.blockingAversions).toContain('Onion');
  });

  it('returns score 1.0 with no aversions or allergens', () => {
    const r = recipe('r', 'Plain Chicken', [chicken]);
    const fit = evaluateKidFit(r, kid('k', 'Z'));
    expect(fit.score).toBe(1);
    expect(fit.blockingAversions).toHaveLength(0);
    expect(fit.allergenHits).toHaveLength(0);
  });

  it('counts allergen hits across multiple ingredients', () => {
    const r = recipe('r', 'Mac & Cheese', [
      food('m', 'Milk', ['dairy']),
      food('c', 'Cheese', ['dairy']),
    ]);
    const fit = evaluateKidFit(r, kid('k', 'A', { allergens: ['dairy'] }));
    expect(fit.allergenHits).toHaveLength(2);
    expect(fit.score).toBe(0);
  });
});

describe('scoreRecipes', () => {
  const chicken = food('ch', 'Chicken');
  const rice = food('ri', 'Rice');
  const onion = food('on', 'Onion');
  const broccoli = food('br', 'Broccoli');

  const baseInputs = (overrides: Partial<Parameters<typeof scoreRecipes>[0]> = {}) => ({
    recipes: [recipe('r1', 'Chicken & Rice', [chicken, rice], 20)],
    pantry: [chicken, rice] as PantryFood[],
    kids: [kid('k1', 'Mia')],
    recentEntries: [] as RecentPlanEntry[],
    ...overrides,
  });

  it('full-pantry recipe with no aversions scores ~40', () => {
    const out = scoreRecipes(baseInputs(), { maxMinutes: 30 });
    expect(out[0].pantryCoveragePct).toBe(1);
    expect(out[0].rankScore).toBeCloseTo(40, 2);
    expect(out[0].excluded).toBe(false);
  });

  it('penalizes missing pantry items', () => {
    const out = scoreRecipes(
      baseInputs({ pantry: [chicken] as PantryFood[] }),
      { maxMinutes: 30 },
    );
    expect(out[0].pantryCoveragePct).toBe(0.5);
    expect(out[0].rankScore).toBeCloseTo(20, 2);
    expect(out[0].missingFoodIds).toEqual(['ri']);
  });

  it('penalizes per-kid blocking aversions', () => {
    const out = scoreRecipes(
      baseInputs({
        recipes: [recipe('r1', 'Chicken & Onion', [chicken, onion], 20)],
        pantry: [chicken, onion],
        kids: [kid('k1', 'Mia', { disliked: ['Onion'] })],
      }),
      { maxMinutes: 30 },
    );
    expect(out[0].rankScore).toBeCloseTo(40 - 15, 2);
  });

  it('excludes recipes with allergen hits', () => {
    const dairy = food('m', 'Milk', ['dairy']);
    const out = scoreRecipes(
      {
        recipes: [recipe('r1', 'Milk Soup', [chicken, dairy], 20)],
        pantry: [chicken, dairy],
        kids: [kid('k1', 'Mia', { allergens: ['dairy'] })],
        recentEntries: [],
      },
      { maxMinutes: 30 },
    );
    expect(out[0].excluded).toBe(true);
    expect(out[0].rankScore).toBe(Number.NEGATIVE_INFINITY);
  });

  it('penalizes prep time over budget', () => {
    const out = scoreRecipes(
      baseInputs({
        recipes: [recipe('r1', 'Slow Roast', [chicken, rice], 90)],
      }),
      { maxMinutes: 30 },
    );
    // pantry 40 - prepOver 60 * 0.5 = 40 - 30 = 10
    expect(out[0].rankScore).toBeCloseTo(10, 2);
  });

  it('penalizes recently-made recipes via variety score', () => {
    const recent: RecentPlanEntry[] = [
      { recipeId: 'r1', daysAgo: 1 },
      { recipeId: 'r1', daysAgo: 2 },
      { recipeId: 'r1', daysAgo: 3 },
      { recipeId: 'r1', daysAgo: 4 },
    ];
    const out = scoreRecipes(baseInputs({ recentEntries: recent }), {
      maxMinutes: 30,
    });
    // 4 entries × weight 2 = 8 weighted; score = clamp01((8/21)*3) ≈ 1.0 (capped)
    expect(out[0].varietyScore).toBeCloseTo(1, 1);
    // 40 (pantry) - 25 (variety*25) = 15
    expect(out[0].rankScore).toBeCloseTo(15, 1);
  });

  it('sorts higher-ranked recipes first', () => {
    const out = scoreRecipes(
      {
        recipes: [
          recipe('r-onion', 'Onion Heavy', [chicken, onion], 20),
          recipe('r-clean', 'Clean Chicken', [chicken, rice], 20),
        ],
        pantry: [chicken, rice, onion],
        kids: [kid('k1', 'Mia', { disliked: ['Onion'] })],
        recentEntries: [],
      },
      { maxMinutes: 30 },
    );
    expect(out[0].recipeId).toBe('r-clean');
    expect(out[1].recipeId).toBe('r-onion');
  });

  it('breaks ties by sum of kid scores', () => {
    const out = scoreRecipes(
      {
        recipes: [
          recipe('r-a', 'A', [chicken, rice], 20),
          recipe('r-b', 'B', [chicken, rice], 20),
        ],
        pantry: [chicken, rice],
        kids: [
          kid('k1', 'Mia'),
          kid('k2', 'Jake', { disliked: ['Rice'] }),
        ],
        recentEntries: [{ recipeId: 'r-a', daysAgo: 20 }],
      },
      { maxMinutes: 30 },
    );
    // both have a blocking aversion (Rice for Jake) so the per-kid score is
    // identical between A and B. Variety penalty applies only to A so B wins.
    expect(out[0].recipeId).toBe('r-b');
  });

  it('handles a 4-kid household with mixed constraints', () => {
    const peanut = food('pb', 'Peanut Butter', ['peanut']);
    const tomato = food('to', 'Tomato');
    const broccoliFood = broccoli;
    const out = scoreRecipes(
      {
        recipes: [
          recipe('safe', 'Chicken Rice', [chicken, rice], 25),
          recipe('peanut', 'PB Noodles', [chicken, peanut], 15),
          recipe('hated', 'Tomato Stew', [chicken, tomato], 20),
          recipe('boring', 'Broccoli Bowl', [chicken, broccoliFood], 20),
        ],
        pantry: [chicken, rice, peanut, tomato, broccoliFood],
        kids: [
          kid('a', 'Ava', { allergens: ['peanut'] }),
          kid('b', 'Ben', { disliked: ['Tomato'] }),
          kid('c', 'Cleo', { disliked: ['Broccoli'] }),
          kid('d', 'Dax'),
        ],
        recentEntries: [],
      },
      { maxMinutes: 30 },
    );
    expect(out[0].recipeId).toBe('safe');
    const peanutResult = out.find((r) => r.recipeId === 'peanut');
    expect(peanutResult?.excluded).toBe(true);
  });
});

describe('topSuggestions', () => {
  it('returns at most `limit` non-excluded recipes', () => {
    const f = food('f', 'F');
    const recipes = Array.from({ length: 10 }, (_, i) =>
      recipe(`r${i}`, `R${i}`, [f], 20),
    );
    const out = topSuggestions(
      {
        recipes,
        pantry: [f],
        kids: [kid('k', 'K')],
        recentEntries: [],
      },
      { maxMinutes: 30 },
      3,
    );
    expect(out).toHaveLength(3);
  });

  it('skips allergen-excluded recipes when filling the limit', () => {
    const dairy = food('m', 'Milk', ['dairy']);
    const safeFood = food('f', 'F');
    const out = topSuggestions(
      {
        recipes: [
          recipe('bad', 'Bad', [dairy], 20),
          recipe('ok1', 'Ok1', [safeFood], 20),
          recipe('ok2', 'Ok2', [safeFood], 20),
        ],
        pantry: [dairy, safeFood],
        kids: [kid('k', 'K', { allergens: ['dairy'] })],
        recentEntries: [],
      },
      { maxMinutes: 30 },
      3,
    );
    expect(out.find((r) => r.recipeId === 'bad')).toBeUndefined();
    expect(out).toHaveLength(2);
  });
});
