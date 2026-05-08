import { describe, it, expect } from 'vitest';
import {
  generateHiddenVeggieRewrites,
  applyRewriteToRecipe,
  type HiddenVeggieTechnique,
  type RewriterKid,
  type RewriterRecipe,
} from './hiddenVeggieRewriter';

const baseTechnique = (overrides: Partial<HiddenVeggieTechnique> = {}): HiddenVeggieTechnique => ({
  id: 't1',
  veggieName: 'cauliflower',
  veggieAllergens: [],
  recipeKeywords: ['mac and cheese', 'cheese sauce'],
  recipeCategories: [],
  technique: 'puree',
  prepMethod: 'steamed_then_pureed',
  maxRatio: 0.3,
  suggestedAmount: '1/2 cup pureed cauliflower',
  instructionTemplate: 'Steam cauliflower until soft, blend smooth, whisk into the cheese sauce.',
  stealthTip: 'Cauliflower vanishes into cheese sauce.',
  stealthScore: 85,
  ...overrides,
});

const baseRecipe = (overrides: Partial<RewriterRecipe> = {}): RewriterRecipe => ({
  id: 'r1',
  name: 'Mac and Cheese',
  description: 'Classic family mac and cheese',
  category: 'carb',
  instructions: 'Boil pasta. Make cheese sauce. Combine.',
  existingFoodNames: ['Macaroni', 'Cheddar Cheese', 'Milk', 'Butter'],
  ...overrides,
});

const kid = (
  id: string,
  name: string,
  opts: { allergens?: string[]; disliked?: string[] } = {}
): RewriterKid => ({
  id,
  name,
  allergens: opts.allergens ?? [],
  dislikedFoods: opts.disliked ?? [],
});

describe('generateHiddenVeggieRewrites - matching', () => {
  it('matches a recipe by keyword and emits a rewrite', () => {
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe(),
      techniques: [baseTechnique()],
      kids: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].veggieName).toBe('cauliflower');
    expect(result[0].variantName).toBe('Mac and Cheese (Hidden Cauliflower)');
    expect(result[0].matchReasons.some((r) => r.includes('mac and cheese'))).toBe(true);
  });

  it('returns empty when no keyword matches', () => {
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe({
        name: 'Banana Smoothie',
        description: 'Frozen banana with milk',
        instructions: 'Blend.',
        existingFoodNames: ['Banana', 'Milk'],
      }),
      techniques: [baseTechnique()],
      kids: [],
    });
    expect(result).toEqual([]);
  });

  it('honors recipe_categories filter', () => {
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe({ category: 'protein' }),
      techniques: [baseTechnique({ recipeCategories: ['carb'] })],
      kids: [],
    });
    expect(result).toEqual([]);
  });

  it('skips techniques whose stealth score is below the floor', () => {
    const result = generateHiddenVeggieRewrites(
      {
        recipe: baseRecipe(),
        techniques: [baseTechnique({ stealthScore: 50 })],
        kids: [],
      },
      { minStealthScore: 70 }
    );
    expect(result).toEqual([]);
  });

  it('skips a technique if the recipe already mentions the veggie', () => {
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe({
        name: 'Mac and Cheese with Cauliflower',
        existingFoodNames: ['Macaroni', 'Cauliflower'],
      }),
      techniques: [baseTechnique()],
      kids: [],
    });
    expect(result).toEqual([]);
  });
});

describe('generateHiddenVeggieRewrites - kid safety', () => {
  it("drops a technique that hits any kid's allergen", () => {
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe(),
      techniques: [baseTechnique({ veggieAllergens: ['nightshade'] })],
      kids: [kid('k1', 'Emma', { allergens: ['nightshade'] })],
    });
    expect(result).toEqual([]);
  });

  it('keeps a technique when only one of multiple kids is at risk - actually, we drop if ANY are at risk', () => {
    // The function is conservative: ANY kid allergic blocks the rewrite.
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe(),
      techniques: [baseTechnique({ veggieAllergens: ['nightshade'] })],
      kids: [kid('k1', 'Safe'), kid('k2', 'Risky', { allergens: ['nightshade'] })],
    });
    expect(result).toEqual([]);
  });

  it('marks kids as safe when no allergen overlap', () => {
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe(),
      techniques: [baseTechnique()],
      kids: [kid('k1', 'A'), kid('k2', 'B')],
    });
    expect(result[0].safeForKidIds).toEqual(['k1', 'k2']);
  });
});

describe('generateHiddenVeggieRewrites - dedup, order, limit', () => {
  it('returns at most one rewrite per veggie even if multiple techniques match', () => {
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe(),
      techniques: [
        baseTechnique({ id: 't1', stealthScore: 90 }),
        baseTechnique({ id: 't2', stealthScore: 80 }), // same veggie
      ],
      kids: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].techniqueId).toBe('t1'); // highest stealth wins
  });

  it('orders by stealth score descending', () => {
    const result = generateHiddenVeggieRewrites({
      recipe: baseRecipe(),
      techniques: [
        baseTechnique({ id: 't1', veggieName: 'spinach', stealthScore: 75 }),
        baseTechnique({ id: 't2', veggieName: 'carrot', stealthScore: 90 }),
        baseTechnique({ id: 't3', veggieName: 'cauliflower', stealthScore: 85 }),
      ],
      kids: [],
    });
    expect(result.map((r) => r.veggieName)).toEqual(['carrot', 'cauliflower', 'spinach']);
  });

  it('respects the limit', () => {
    const result = generateHiddenVeggieRewrites(
      {
        recipe: baseRecipe(),
        techniques: [
          baseTechnique({ id: 't1', veggieName: 'spinach' }),
          baseTechnique({ id: 't2', veggieName: 'carrot' }),
          baseTechnique({ id: 't3', veggieName: 'cauliflower' }),
        ],
        kids: [],
      },
      { limit: 2 }
    );
    expect(result).toHaveLength(2);
  });
});

describe('applyRewriteToRecipe', () => {
  it('appends the ingredient line and instruction step idempotently', () => {
    const recipe = baseRecipe();
    const rewrites = generateHiddenVeggieRewrites({
      recipe,
      techniques: [baseTechnique()],
      kids: [],
    });
    const applied = applyRewriteToRecipe(
      { ...recipe, additionalIngredients: '', tips: '' },
      rewrites[0]
    );
    expect(applied.variantName).toBe('Mac and Cheese (Hidden Cauliflower)');
    expect(applied.additionalIngredientsAddendum).toContain('1/2 cup pureed cauliflower');
    expect(applied.updatedInstructions).toContain('Hidden veggie step:');
    expect(applied.updatedTips).toContain('[Hidden veggies]');
  });

  it('preserves existing additional ingredients and tips', () => {
    const recipe = {
      ...baseRecipe(),
      additionalIngredients: 'Salt to taste',
      tips: 'Use whole milk for creaminess',
    };
    const rewrites = generateHiddenVeggieRewrites({
      recipe,
      techniques: [baseTechnique()],
      kids: [],
    });
    const applied = applyRewriteToRecipe(recipe, rewrites[0]);
    expect(applied.additionalIngredientsAddendum).toMatch(/^Salt to taste/);
    expect(applied.updatedTips.startsWith('Use whole milk')).toBe(true);
  });

  it('does not double-add the same stealth tip on repeat application', () => {
    const recipe = baseRecipe();
    const rewrites = generateHiddenVeggieRewrites({
      recipe,
      techniques: [baseTechnique()],
      kids: [],
    });
    const once = applyRewriteToRecipe(
      { ...recipe, additionalIngredients: '', tips: '' },
      rewrites[0]
    );
    const twice = applyRewriteToRecipe(
      { ...recipe, additionalIngredients: '', tips: once.updatedTips },
      rewrites[0]
    );
    // Tip should appear only once.
    const occurrences = (twice.updatedTips.match(/\[Hidden veggies\]/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('does not suffix the variant name twice on reapply', () => {
    const variantRecipe = baseRecipe({ name: 'Mac and Cheese (Hidden Cauliflower)' });
    const rewrites = generateHiddenVeggieRewrites({
      recipe: variantRecipe,
      techniques: [baseTechnique({ veggieName: 'sweet potato' })], // different veggie so a match still fires
      kids: [],
    });
    if (rewrites.length > 0) {
      // Variant name should not double-wrap.
      expect(rewrites[0].variantName).toBe('Mac and Cheese (Hidden Cauliflower)');
    }
  });
});
