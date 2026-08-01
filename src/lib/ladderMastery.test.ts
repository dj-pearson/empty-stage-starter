/**
 * US-603: mastery hands off to the chaining engine.
 *
 * `never re-suggests a food already on the ladder` and `never suggests an
 * allergen` are the two that matter. The first is what keeps the handoff from
 * looking like the app forgot what you have been doing; the second is a
 * safety rule that sensory similarity must never override.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HANDOFF_LIMIT,
  buildWinContribution,
  selectHandoffCandidates,
  type ChainSuggestion,
  type HandoffContext,
} from './ladderMastery';

function suggestion(over: Partial<ChainSuggestion> & { foodId: string }): ChainSuggestion {
  return {
    foodName: over.foodId,
    similarityScore: 50,
    reasons: ['texture'],
    ...over,
  };
}

function ctx(over: Partial<HandoffContext> = {}): HandoffContext {
  return {
    masteredFoodId: 'nuggets',
    ladderFoodIds: ['nuggets'],
    kidAllergens: [],
    allergensByFoodId: new Map(),
    ...over,
  };
}

describe('selectHandoffCandidates', () => {
  it('pairs every candidate with the mastered food as its anchor', () => {
    const candidates = selectHandoffCandidates([suggestion({ foodId: 'fish-stick' })], ctx());

    expect(candidates).toHaveLength(1);
    expect(candidates[0].anchorFoodId).toBe('nuggets');
    // Chaining from a win rather than starting cold is the entire point.
    expect(candidates[0].foodId).toBe('fish-stick');
  });

  it('never re-suggests a food already on the ladder', () => {
    const candidates = selectHandoffCandidates(
      [suggestion({ foodId: 'fish-stick' }), suggestion({ foodId: 'already-working-on' })],
      ctx({ ladderFoodIds: ['nuggets', 'already-working-on'] })
    );

    expect(candidates.map((c) => c.foodId)).toEqual(['fish-stick']);
  });

  it('never suggests the mastered food back to itself', () => {
    const candidates = selectHandoffCandidates([suggestion({ foodId: 'nuggets' })], ctx());
    expect(candidates).toHaveLength(0);
  });

  it('never suggests an allergen, however similar it scores', () => {
    const candidates = selectHandoffCandidates(
      [
        suggestion({ foodId: 'fish-stick', similarityScore: 99 }),
        suggestion({ foodId: 'safe-option', similarityScore: 20 }),
      ],
      ctx({
        kidAllergens: ['Fish'],
        allergensByFoodId: new Map([['fish-stick', ['fish']]]),
      })
    );

    expect(candidates.map((c) => c.foodId)).toEqual(['safe-option']);
  });

  it('ranks by similarity score', () => {
    const candidates = selectHandoffCandidates(
      [
        suggestion({ foodId: 'weak', similarityScore: 30 }),
        suggestion({ foodId: 'strong', similarityScore: 90 }),
        suggestion({ foodId: 'middling', similarityScore: 60 }),
      ],
      ctx()
    );

    expect(candidates.map((c) => c.foodId)).toEqual(['strong', 'middling', 'weak']);
  });

  it('offers a short list rather than a wall of options', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      suggestion({ foodId: `food-${i}`, similarityScore: 100 - i })
    );
    expect(selectHandoffCandidates(many, ctx())).toHaveLength(DEFAULT_HANDOFF_LIMIT);
  });

  it('honors an explicit limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => suggestion({ foodId: `food-${i}` }));
    expect(selectHandoffCandidates(many, ctx({ limit: 1 }))).toHaveLength(1);
  });

  it('is deterministic when scores tie', () => {
    const tied = [
      suggestion({ foodId: 'b', similarityScore: 50 }),
      suggestion({ foodId: 'a', similarityScore: 50 }),
    ];
    expect(selectHandoffCandidates(tied, ctx()).map((c) => c.foodId)).toEqual(['a', 'b']);
  });

  it('returns nothing when there is nothing to chain to', () => {
    expect(selectHandoffCandidates([], ctx())).toEqual([]);
  });
});

describe('buildWinContribution', () => {
  const base = {
    ladderRowId: 'ladder-1',
    sourceFoodName: 'Chicken nuggets',
    targetFoodName: 'Fish sticks',
    pickinessBucket: 'high' as const,
    shareEnabled: true,
  };

  it('keys the contribution to the ladder row so a replay cannot double count', () => {
    const contribution = buildWinContribution(base);
    expect(contribution?.contributionKey).toBe('ladder:ladder-1');
    expect(contribution?.outcome).toBe('success');
  });

  it('contributes nothing when the household has opted out', () => {
    expect(buildWinContribution({ ...base, shareEnabled: false })).toBeNull();
  });

  it('contributes nothing when a food has no usable name', () => {
    expect(buildWinContribution({ ...base, targetFoodName: '   ' })).toBeNull();
    expect(buildWinContribution({ ...base, sourceFoodName: '' })).toBeNull();
  });

  it('trims names so the server normalizer sees clean input', () => {
    const contribution = buildWinContribution({
      ...base,
      sourceFoodName: '  Chicken nuggets ',
    });
    expect(contribution?.sourceFoodName).toBe('Chicken nuggets');
  });

  it('carries the pickiness bucket through for aggregation', () => {
    expect(buildWinContribution({ ...base, pickinessBucket: 'medium' })?.pickinessBucket).toBe(
      'medium'
    );
  });
});
