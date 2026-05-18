import { describe, it, expect } from 'vitest';
import {
  applyRelaxation,
  familyWins,
  minKidScore,
  type SolverResult,
} from './siblingMealFinder';

type KS = SolverResult['perKidSatisfaction'][number];

function kid(score: number, softCount = 0): KS {
  return {
    kidId: `k${Math.random()}`,
    kidName: 'Kid',
    score,
    hardViolations: [],
    softViolations: Array.from({ length: softCount }, (_, i) => ({
      foodId: `f${i}`,
      foodName: `Food ${i}`,
      reason: 'dislikes it',
      severity: 'soft' as const,
    })),
    favoriteHits: [],
  };
}

function result(
  over: Partial<SolverResult> & { perKidSatisfaction: KS[] }
): SolverResult {
  return {
    recipeId: 'r1',
    recipeName: 'Recipe',
    imageUrl: null,
    prepMinutes: 20,
    resolutionType: 'full_match',
    satisfactionScore: 80,
    swaps: [],
    splitPlates: [],
    excluded: false,
    ...over,
  };
}

describe('minKidScore', () => {
  it('returns 0 for no kids', () => {
    expect(minKidScore(result({ perKidSatisfaction: [] }))).toBe(0);
  });
  it('returns the lowest per-kid score', () => {
    expect(
      minKidScore(result({ perKidSatisfaction: [kid(0.9), kid(0.4), kid(0.7)] }))
    ).toBeCloseTo(0.4);
  });
});

describe('applyRelaxation', () => {
  const fullMatch = result({
    recipeId: 'full',
    resolutionType: 'full_match',
    perKidSatisfaction: [kid(0.8), kid(0.9)],
  });
  const withSwaps = result({
    recipeId: 'swaps',
    resolutionType: 'with_swaps',
    perKidSatisfaction: [kid(0.6, 1), kid(0.7)],
  });
  const splitPlate = result({
    recipeId: 'split',
    resolutionType: 'split_plate',
    perKidSatisfaction: [kid(0.5, 2), kid(0.6, 1)],
  });
  const excluded = result({
    recipeId: 'ex',
    excluded: true,
    perKidSatisfaction: [kid(0)],
  });
  const all = [fullMatch, withSwaps, splitPlate, excluded];

  it('always drops excluded results', () => {
    const out = applyRelaxation(all, {
      allowAversionsPerKid: 3,
      allowSwaps: true,
      hideSoftBlocks: false,
    });
    expect(out.map((r) => r.recipeId)).not.toContain('ex');
  });

  it('allowSwaps=false keeps only full matches', () => {
    const out = applyRelaxation(all, {
      allowAversionsPerKid: 3,
      allowSwaps: false,
      hideSoftBlocks: false,
    });
    expect(out.map((r) => r.recipeId)).toEqual(['full']);
  });

  it('allowAversionsPerKid caps worst per-kid soft violations', () => {
    const cap0 = applyRelaxation(all, {
      allowAversionsPerKid: 0,
      allowSwaps: true,
      hideSoftBlocks: false,
    });
    expect(cap0.map((r) => r.recipeId)).toEqual(['full']);

    const cap1 = applyRelaxation(all, {
      allowAversionsPerKid: 1,
      allowSwaps: true,
      hideSoftBlocks: false,
    });
    expect(cap1.map((r) => r.recipeId).sort()).toEqual(['full', 'swaps']);

    const cap2 = applyRelaxation(all, {
      allowAversionsPerKid: 2,
      allowSwaps: true,
      hideSoftBlocks: false,
    });
    expect(cap2.map((r) => r.recipeId).sort()).toEqual(['full', 'split', 'swaps']);
  });

  it('hideSoftBlocks drops anything with a soft violation', () => {
    const out = applyRelaxation(all, {
      allowAversionsPerKid: 3,
      allowSwaps: true,
      hideSoftBlocks: true,
    });
    expect(out.map((r) => r.recipeId)).toEqual(['full']);
  });
});

describe('familyWins', () => {
  it('keeps only full matches with a positive min kid score', () => {
    const good = result({
      recipeId: 'good',
      resolutionType: 'full_match',
      perKidSatisfaction: [kid(0.8), kid(0.5)],
    });
    const zero = result({
      recipeId: 'zero',
      resolutionType: 'full_match',
      perKidSatisfaction: [kid(0.8), kid(0)],
    });
    const swaps = result({
      recipeId: 'swaps',
      resolutionType: 'with_swaps',
      perKidSatisfaction: [kid(0.9), kid(0.9)],
    });
    const out = familyWins([good, zero, swaps]);
    expect(out.map((r) => r.recipeId)).toEqual(['good']);
  });
});
