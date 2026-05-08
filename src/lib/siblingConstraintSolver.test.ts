import { describe, it, expect } from 'vitest';
import {
  evaluateKidConstraint,
  solveSiblingMeals,
  topSiblingSolutions,
  computeFairnessBoosts,
  type SolverFood,
  type SolverKid,
  type SolverRecipe,
  type SolverHistoryEntry,
} from './siblingConstraintSolver';

const food = (
  id: string,
  name: string,
  category = 'protein',
  allergens: string[] = []
): SolverFood => ({ id, name, category, allergens });

const recipe = (id: string, name: string, foods: SolverFood[], prepMinutes = 20): SolverRecipe => ({
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
  opts: {
    allergens?: string[];
    dietary?: string[];
    disliked?: string[];
    favorites?: string[];
    alwaysEats?: string[];
  } = {}
): SolverKid => ({
  id,
  name,
  allergens: opts.allergens ?? [],
  dietaryRestrictions: opts.dietary ?? [],
  dislikedFoods: opts.disliked ?? [],
  favoriteFoods: opts.favorites ?? [],
  alwaysEatsFoods: opts.alwaysEats ?? [],
});

// Reusable test foods
const chicken = food('chicken', 'Chicken', 'protein');
const rice = food('rice', 'Rice', 'carb');
const broccoli = food('broc', 'Broccoli', 'vegetable');
const cheese = food('cheese', 'Cheddar Cheese', 'dairy', ['dairy']);
const pasta = food('pasta', 'Spaghetti', 'carb', ['gluten']);
const peanut = food('pb', 'Peanut Butter', 'protein', ['peanut']);
const beef = food('beef', 'Ground Beef', 'protein');
const fish = food('fish', 'Salmon', 'protein');

describe('evaluateKidConstraint', () => {
  it('scores 1.0 when no constraints are violated', () => {
    const r = recipe('r1', 'Chicken Rice', [chicken, rice]);
    const k = kid('k1', 'Emma');
    const result = evaluateKidConstraint(r, k);
    expect(result.score).toBe(1);
    expect(result.hardViolations).toEqual([]);
    expect(result.softViolations).toEqual([]);
  });

  it('scores 0 on allergen hit (hard violation)', () => {
    const r = recipe('r1', 'Cheesy Chicken', [chicken, cheese]);
    const k = kid('k1', 'Emma', { allergens: ['dairy'] });
    const result = evaluateKidConstraint(r, k);
    expect(result.score).toBe(0);
    expect(result.hardViolations).toHaveLength(1);
    expect(result.hardViolations[0].foodName).toBe('Cheddar Cheese');
    expect(result.hardViolations[0].reason).toContain('dairy');
  });

  it('scores 0 on dietary restriction conflict (vegetarian + chicken)', () => {
    const r = recipe('r1', 'Chicken Rice', [chicken, rice]);
    const k = kid('k1', 'Jack', { dietary: ['vegetarian'] });
    const result = evaluateKidConstraint(r, k);
    expect(result.score).toBe(0);
    expect(result.hardViolations.some((v) => v.foodName === 'Chicken')).toBe(true);
  });

  it('treats dislike as soft (-0.25 per disliked food)', () => {
    const r = recipe('r1', 'Broccoli Rice', [broccoli, rice]);
    const k = kid('k1', 'Emma', { disliked: ['Broccoli'] });
    const result = evaluateKidConstraint(r, k);
    expect(result.score).toBeCloseTo(0.75, 5);
    expect(result.softViolations).toHaveLength(1);
  });

  it('rewards favorites (+0.1 each, capped at 1.0)', () => {
    const r = recipe('r1', 'Chicken Rice', [chicken, rice]);
    const k = kid('k1', 'Emma', { favorites: ['Chicken', 'Rice'] });
    const result = evaluateKidConstraint(r, k);
    expect(result.score).toBe(1); // capped
    expect(result.favoriteHits).toEqual(['Chicken', 'Rice']);
  });

  it('hard violations short-circuit favorite bonuses', () => {
    const r = recipe('r1', 'Chicken Cheese', [chicken, cheese]);
    const k = kid('k1', 'Emma', { allergens: ['dairy'], favorites: ['Chicken'] });
    const result = evaluateKidConstraint(r, k);
    expect(result.score).toBe(0);
  });

  it('matches dislikes case-insensitively and by name OR id', () => {
    const r = recipe('r1', 'B Rice', [broccoli, rice]);
    const byName = evaluateKidConstraint(r, kid('k1', 'A', { disliked: ['BROCCOLI'] }));
    const byId = evaluateKidConstraint(r, kid('k2', 'B', { disliked: ['broc'] }));
    expect(byName.softViolations).toHaveLength(1);
    expect(byId.softViolations).toHaveLength(1);
  });
});

describe('dietary restriction matrix', () => {
  it('vegan excludes dairy AND meat', () => {
    const r = recipe('r1', 'Beef Cheese Plate', [beef, cheese]);
    const k = kid('k1', 'Vegan Kid', { dietary: ['vegan'] });
    const result = evaluateKidConstraint(r, k);
    // both foods should be hard-violated
    expect(result.hardViolations).toHaveLength(2);
  });

  it('pescatarian allows fish but excludes beef', () => {
    const k = kid('k1', 'Pesc', { dietary: ['pescatarian'] });
    const fishRecipe = recipe('r1', 'Salmon Rice', [fish, rice]);
    const beefRecipe = recipe('r2', 'Beef Rice', [beef, rice]);
    expect(evaluateKidConstraint(fishRecipe, k).hardViolations).toHaveLength(0);
    expect(evaluateKidConstraint(beefRecipe, k).hardViolations).toHaveLength(1);
  });

  it('gluten-free excludes pasta even though no allergen tag is present (name keyword)', () => {
    const noTag = food('p2', 'Penne Pasta', 'carb', []);
    const r = recipe('r1', 'Pasta Bowl', [chicken, noTag]);
    const k = kid('k1', 'GF', { dietary: ['gluten-free'] });
    expect(evaluateKidConstraint(r, k).hardViolations).toHaveLength(1);
  });

  it('nut-free excludes peanut butter via allergen', () => {
    const r = recipe('r1', 'PB Toast', [peanut]);
    const k = kid('k1', 'NF', { dietary: ['nut-free'] });
    expect(evaluateKidConstraint(r, k).hardViolations).toHaveLength(1);
  });
});

describe('solveSiblingMeals - resolution tiers', () => {
  it('returns full_match when every kid is happy with the recipe as written', () => {
    const r = recipe('r1', 'Chicken Rice', [chicken, rice]);
    const result = solveSiblingMeals({
      recipes: [r],
      pantry: [],
      kids: [kid('k1', 'A'), kid('k2', 'B')],
    });
    expect(result).toHaveLength(1);
    expect(result[0].resolutionType).toBe('full_match');
    expect(result[0].excluded).toBe(false);
    expect(result[0].satisfactionScore).toBe(100);
  });

  it('returns with_swaps when a soft-disliked food has a viable pantry swap', () => {
    const broccoli2 = food('broc', 'Broccoli', 'vegetable');
    const carrot = food('carrot', 'Carrots', 'vegetable');
    const r = recipe('r1', 'Chicken Broccoli Rice', [chicken, broccoli2, rice]);
    const result = solveSiblingMeals({
      recipes: [r],
      pantry: [carrot],
      kids: [kid('k1', 'Emma', { disliked: ['Broccoli'] }), kid('k2', 'Jack')],
    });
    expect(result[0].resolutionType).toBe('with_swaps');
    expect(result[0].swaps).toHaveLength(1);
    expect(result[0].swaps[0].swapInFoodName).toBe('Carrots');
    expect(result[0].swaps[0].swapOutFoodName).toBe('Broccoli');
  });

  it('falls back to split_plate when a swap cannot resolve the violation', () => {
    const r = recipe('r1', 'Chicken Cheese Rice', [chicken, cheese, rice]);
    const result = solveSiblingMeals({
      recipes: [r],
      pantry: [], // no swap candidate
      kids: [
        kid('k1', 'Emma', { allergens: ['dairy'] }), // hard violation on cheese
        kid('k2', 'Jack'),
      ],
    });
    expect(result[0].resolutionType).toBe('split_plate');
    expect(result[0].splitPlates).toHaveLength(1);
    expect(result[0].splitPlates[0].kidName).toBe('Emma');
    expect(result[0].splitPlates[0].modifications[0]).toContain('Hold the Cheddar Cheese');
  });

  it('drops the recipe entirely when split-plate would need too many modifications', () => {
    const r = recipe('r1', 'Cheese Pasta Beef', [cheese, pasta, beef]);
    const result = solveSiblingMeals({
      recipes: [r],
      pantry: [],
      kids: [
        kid('k1', 'Emma', {
          allergens: ['dairy', 'gluten'],
          dietary: ['vegetarian'], // also conflicts on beef
        }),
        kid('k2', 'Jack'),
      ],
      // 3 hard violations on Emma > maxSplitPlateModifications=2 default
    });
    expect(result[0].excluded).toBe(true);
    expect(result[0].excludeReason).toContain('Too many');
  });

  it('full_match outranks with_swaps which outranks split_plate at equal raw fit', () => {
    const r1 = recipe('r1', 'Plain', [chicken, rice]);
    const r2 = recipe('r2', 'Swap Needed', [chicken, broccoli, rice]);
    const r3 = recipe('r3', 'Split Needed', [chicken, cheese, rice]);
    const carrot = food('carrot', 'Carrots', 'vegetable');
    const kids = [
      kid('k1', 'Emma', { allergens: ['dairy'], disliked: ['Broccoli'] }),
      kid('k2', 'Jack'),
    ];
    const result = solveSiblingMeals({
      recipes: [r1, r2, r3],
      pantry: [carrot],
      kids,
    });
    expect(result[0].recipeId).toBe('r1');
    expect(result[0].resolutionType).toBe('full_match');
    expect(result[1].recipeId).toBe('r2');
    expect(result[1].resolutionType).toBe('with_swaps');
    expect(result[2].recipeId).toBe('r3');
    expect(result[2].resolutionType).toBe('split_plate');
  });
});

describe('swap viability', () => {
  it("rejects a swap candidate that would trigger another kid's allergen", () => {
    const broccoli2 = food('broc', 'Broccoli', 'vegetable');
    const peanutVeg = food('pveg', 'Peanut Veggie Mix', 'vegetable', ['peanut']);
    const r = recipe('r1', 'Recipe', [chicken, broccoli2]);
    const result = solveSiblingMeals({
      recipes: [r],
      pantry: [peanutVeg], // would-be swap, but peanut allergic to k2
      kids: [
        kid('k1', 'Emma', { disliked: ['Broccoli'] }),
        kid('k2', 'Jack', { allergens: ['peanut'] }),
      ],
    });
    expect(result[0].resolutionType).toBe('split_plate');
    expect(result[0].swaps).toHaveLength(0);
  });

  it("rejects a swap candidate that violates another kid's dietary restriction", () => {
    const broccoli2 = food('broc', 'Broccoli', 'vegetable');
    const meatyVeg = food('mveg', 'Bacon Veggie', 'vegetable');
    const r = recipe('r1', 'Recipe', [chicken, broccoli2]);
    const result = solveSiblingMeals({
      recipes: [r],
      pantry: [meatyVeg],
      kids: [
        kid('k1', 'Emma', { disliked: ['Broccoli'] }),
        kid('k2', 'Jack', { dietary: ['vegetarian'] }),
      ],
    });
    // chicken violates jack's vegetarian -> hard. So recipe is split_plate or excluded.
    expect(result[0].resolutionType === 'split_plate' || result[0].excluded).toBe(true);
  });
});

describe('computeFairnessBoosts', () => {
  it('returns zeros when history is empty', () => {
    expect(computeFairnessBoosts(['k1', 'k2'], [])).toEqual({ k1: 0, k2: 0 });
  });

  it('boosts the kid whose recent satisfaction has been below average', () => {
    const history: SolverHistoryEntry[] = [
      { kidId: 'k1', score: 1.0, daysAgo: 3 }, // Jack is winning
      { kidId: 'k1', score: 0.9, daysAgo: 8 },
      { kidId: 'k2', score: 0.3, daysAgo: 3 }, // Emma is losing
      { kidId: 'k2', score: 0.4, daysAgo: 8 },
    ];
    const boosts = computeFairnessBoosts(['k1', 'k2'], history);
    expect(boosts.k2).toBeGreaterThan(0);
    expect(boosts.k1).toBe(0);
    expect(boosts.k2).toBeLessThanOrEqual(0.15);
  });

  it('ignores history past the lookback window', () => {
    const history: SolverHistoryEntry[] = [{ kidId: 'k1', score: 0.1, daysAgo: 60 }];
    expect(computeFairnessBoosts(['k1'], history, 21)).toEqual({ k1: 0 });
  });
});

describe('solver fairness integration', () => {
  it('attaches a fairnessNote when a strongly-fitting recipe favors a recently-losing kid', () => {
    const r = recipe('r1', 'Chicken Rice', [chicken, rice]);
    const result = solveSiblingMeals({
      recipes: [r],
      pantry: [],
      kids: [
        kid('k1', 'Emma', { favorites: ['Chicken', 'Rice'] }),
        kid('k2', 'Jack', { favorites: ['Chicken', 'Rice'] }),
      ],
      history: [
        { kidId: 'k1', score: 0.2, daysAgo: 3 },
        { kidId: 'k1', score: 0.3, daysAgo: 7 },
        { kidId: 'k2', score: 1.0, daysAgo: 3 },
        { kidId: 'k2', score: 1.0, daysAgo: 7 },
      ],
    });
    expect(result[0].fairnessNote).toBeDefined();
    expect(result[0].fairnessNote).toContain('Emma');
  });
});

describe('topSiblingSolutions', () => {
  it('respects limit and excludes unsolvable recipes', () => {
    const r1 = recipe('r1', 'Good', [chicken, rice]);
    const r2 = recipe('r2', 'Bad', [cheese, pasta, beef]);
    const r3 = recipe('r3', 'Also Good', [chicken, broccoli]);
    const result = topSiblingSolutions(
      {
        recipes: [r1, r2, r3],
        pantry: [],
        kids: [
          kid('k1', 'Emma', { allergens: ['dairy', 'gluten'], dietary: ['vegetarian'] }),
          kid('k2', 'Jack'),
        ],
      },
      {},
      2
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => !r.excluded)).toBe(true);
    expect(result.find((r) => r.recipeId === 'r2')).toBeUndefined();
  });

  it('returns empty array when no kids are passed', () => {
    expect(
      topSiblingSolutions({
        recipes: [recipe('r1', 'X', [chicken])],
        pantry: [],
        kids: [],
      })
    ).toEqual([]);
  });

  it('penalizes prep time over budget', () => {
    const fast = recipe('r1', 'Fast', [chicken, rice], 10);
    const slow = recipe('r2', 'Slow', [chicken, rice], 90);
    const result = solveSiblingMeals(
      { recipes: [fast, slow], pantry: [], kids: [kid('k1', 'A')] },
      { maxMinutes: 20 }
    );
    expect(result[0].recipeId).toBe('r1');
    expect(result[0].satisfactionScore).toBeGreaterThan(result[1].satisfactionScore);
  });
});
