import { describe, it, expect } from 'vitest';
import type { Food, Kid, PlanEntry, Recipe } from '@/types';
import type { LadderRow } from '@/hooks/useFoodLadder';
import {
  favouritePlates,
  nextOpenSlot,
  planWriteEntries,
  selectPlateCandidates,
  type PlateCandidates,
  type SelectPlateInput,
} from './plateBuilder';

const TODAY = '2026-09-24';

function food(id: string, over: Partial<Food> = {}): Food {
  return { id, name: id, category: 'snack', is_safe: false, is_try_bite: false, quantity: 1, ...over };
}

function kid(over: Partial<Kid> = {}): Kid {
  return { id: 'kid-1', name: 'Mia', allergens: [], ...over };
}

function row(foodId: string, over: Partial<LadderRow> = {}): LadderRow {
  return {
    id: `row-${foodId}`,
    kidId: 'kid-1',
    foodId,
    currentRung: 'tiny_taste',
    consecutiveSuccesses: 0,
    consecutiveHolds: 0,
    consecutiveRefusals: 0,
    status: 'active',
    nextDueOn: TODAY,
    lastAttemptAt: null,
    pairedSafeFoodId: null,
    preferredPrep: null,
    preferredMealSlot: null,
    pausedReason: null,
    ...over,
  };
}

let entrySeq = 0;
function entry(foodId: string, over: Partial<PlanEntry> = {}): PlanEntry {
  entrySeq++;
  return {
    id: `e-${entrySeq}`,
    kid_id: 'kid-1',
    date: TODAY,
    meal_slot: 'dinner',
    food_id: foodId,
    result: null,
    ...over,
  };
}

function input(over: Partial<SelectPlateInput> = {}): SelectPlateInput {
  return {
    kid: kid(),
    foods: [],
    ladderRows: [],
    ladderStatus: 'ready',
    planEntries: [],
    recipes: [],
    date: TODAY,
    slot: 'dinner',
    todayIso: TODAY,
    ...over,
  };
}

function allIds(c: PlateCandidates): string[] {
  return [...c.safe, ...c.tryBite, ...c.bridge, ...c.gap].map((o) => o.food.id);
}

describe('selectPlateCandidates: allergen floor', () => {
  it("keeps a sibling's is_safe food with this kid's allergen out of every zone and lists it", () => {
    const nuts = food('pb', { name: 'Peanut butter', is_safe: true, allergens: ['peanuts'], category: 'protein' });
    const rice = food('rice', { name: 'Rice', is_safe: true, category: 'carb' });
    const c = selectPlateCandidates(
      input({
        kid: kid({ allergens: ['peanuts'], allergen_severity: { peanuts: 'severe' } }),
        foods: [nuts, rice],
      }),
    );
    expect(allIds(c)).not.toContain('pb');
    expect(c.safe.map((o) => o.food.id)).toEqual(['rice']);
    expect(c.safe[0].reasonKey).toBe('householdUnconfirmed');
    const held = c.heldBack.find((h) => h.food.id === 'pb' && h.zone === 'safe');
    expect(held).toMatchObject({ reason: 'allergen', allergen: 'peanut', copyKind: 'severe' });
  });

  it("gives an unrated allergy copyKind 'severeUnrated', and still drops a mild hit", () => {
    const egg = food('egg', { name: 'Scrambled egg', is_safe: true, allergens: ['eggs'], category: 'protein' });
    const milk = food('milk', { name: 'Milk', is_safe: true, allergens: ['milk'], category: 'dairy' });
    const c = selectPlateCandidates(
      input({
        kid: kid({ allergens: ['eggs', 'milk'], allergen_severity: { milk: 'mild' } }),
        foods: [egg, milk],
      }),
    );
    expect(allIds(c)).toEqual([]);
    expect(c.heldBack.find((h) => h.food.id === 'egg')?.copyKind).toBe('severeUnrated');
    expect(c.heldBack.find((h) => h.food.id === 'milk')).toMatchObject({ reason: 'allergen', copyKind: 'plain' });
  });

  it("drops an untagged 'Peanut butter crackers' from the bridge", () => {
    const toast = food('toast', { name: 'Toast', category: 'carb' });
    const pbc = food('pbc', { name: 'Peanut butter crackers', category: 'carb' });
    const crackers = food('crackers', { name: 'Crackers', category: 'carb' });
    const c = selectPlateCandidates(
      input({
        kid: kid({ allergens: ['peanuts'], always_eats_foods: ['toast'] }),
        foods: [toast, pbc, crackers],
        chainSuggestions: [
          { foodId: 'pbc', similarityScore: 95 },
          { foodId: 'crackers', similarityScore: 60 },
        ],
      }),
    );
    expect(c.defaults.safe).toBe('toast');
    expect(c.bridge.map((o) => o.food.id)).toEqual(['crackers']);
    expect(allIds(c)).not.toContain('pbc');
    expect(c.heldBack.find((h) => h.food.id === 'pbc' && h.zone === 'bridge')?.reason).toBe('allergen');
  });

  it("reads allergens undefined as 'unknown', not clean", () => {
    expect(selectPlateCandidates(input({ kid: kid({ allergens: undefined }) })).allergyState).toBe('unknown');
    expect(selectPlateCandidates(input({ kid: kid({ allergens: [] }) })).allergyState).toBe('none');
    expect(selectPlateCandidates(input({ kid: kid({ allergens: ['soy'] }) })).allergyState).toBe('listed');
  });
});

describe('selectPlateCandidates: try bite', () => {
  it('never offers a stalled, paused or backed-off row', () => {
    const foods = ['stall', 'pause', 'back', 'ok'].map((id) => food(id, { category: 'vegetable' }));
    const c = selectPlateCandidates(
      input({
        foods,
        ladderRows: [
          row('stall', { consecutiveHolds: 3 }),
          row('pause', { status: 'paused' }),
          row('back', { status: 'backed_off' }),
          row('ok'),
        ],
      }),
    );
    expect(c.tryBite.map((o) => o.food.id)).toEqual(['ok']);
    expect(c.heldBack.find((h) => h.food.id === 'stall')?.reason).toBe('stalled');
    expect(c.heldBack.find((h) => h.food.id === 'pause')?.reason).toBe('paused');
    expect(c.heldBack.find((h) => h.food.id === 'back')?.reason).toBe('paused');
  });

  it("holds back a disliked due food as 'disliked'", () => {
    const c = selectPlateCandidates(
      input({
        kid: kid({ disliked_foods: ['Broccoli'] }),
        foods: [food('broc', { name: 'Broccoli', category: 'vegetable' })],
        ladderRows: [row('broc')],
      }),
    );
    expect(c.tryBite).toEqual([]);
    expect(c.status.tryBite).toBe('empty');
    expect(c.heldBack).toContainEqual(expect.objectContaining({ zone: 'tryBite', reason: 'disliked' }));
  });

  it("reads a loading ladder as 'pending', not 'empty'", () => {
    const c = selectPlateCandidates(input({ ladderStatus: 'loading', ladderRows: [] }));
    expect(c.status.tryBite).toBe('pending');
    expect(selectPlateCandidates(input({ ladderStatus: 'error' })).status.tryBite).toBe('unavailable');
    expect(selectPlateCandidates(input()).status.tryBite).toBe('empty');
  });

  it('preselects the try bite row\'s pairedSafeFoodId as the safe food', () => {
    const c = selectPlateCandidates(
      input({
        kid: kid({ always_eats_foods: ['pasta', 'nuggets'] }),
        foods: [
          food('pasta', { category: 'carb' }),
          food('nuggets', { category: 'protein' }),
          food('pea', { category: 'vegetable' }),
        ],
        ladderRows: [row('pea', { pairedSafeFoodId: 'nuggets' })],
      }),
    );
    expect(c.defaults.tryBite).toBe('pea');
    expect(c.defaults.safe).toBe('nuggets');
    expect(c.safe[0]).toMatchObject({ reasonKey: 'chainPair' });
    expect(c.safe[0].food.id).toBe('nuggets');
  });

  it('ranks a row whose preferred slot matches first', () => {
    const c = selectPlateCandidates(
      input({
        foods: [food('a', { category: 'fruit' }), food('b', { category: 'fruit' })],
        ladderRows: [row('a'), row('b', { preferredMealSlot: 'dinner' })],
      }),
    );
    expect(c.tryBite.map((o) => o.food.id)).toEqual(['b', 'a']);
  });
});

describe('selectPlateCandidates: slot and exclusivity', () => {
  it('excludes a food already in the slot, and puts a food that fits safe and gap in one zone', () => {
    const c = selectPlateCandidates(
      input({
        kid: kid({ always_eats_foods: ['carrot', 'apple'] }),
        foods: [food('carrot', { category: 'vegetable' }), food('apple', { category: 'fruit' })],
        planEntries: [entry('carrot', { meal_slot: 'dinner' })],
      }),
    );
    expect(allIds(c)).not.toContain('carrot');
    expect(c.heldBack.find((h) => h.food.id === 'carrot')?.reason).toBe('alreadyInSlot');
    expect(allIds(c).filter((id) => id === 'apple')).toHaveLength(1);
    expect(c.safe.map((o) => o.food.id)).toEqual(['apple']);
  });

  it('does not call a snack-only day balanced, and counts a recipe row through its foods', () => {
    const chips = food('chips', { category: 'snack' });
    const snackOnly = selectPlateCandidates(
      input({ foods: [chips], planEntries: [entry('chips', { meal_slot: 'snack1' })] }),
    );
    expect(snackOnly.gapGroup).toBe('vegetable');
    expect(snackOnly.status.gap).not.toBe('balanced');

    const cheese = food('cheese', { category: 'dairy' });
    const spinach = food('spinach', { category: 'vegetable' });
    const berry = food('berry', { category: 'fruit' });
    const recipe: Recipe = { id: 'r1', name: 'Spinach bake', food_ids: ['cheese', 'spinach'] };
    const c = selectPlateCandidates(
      input({
        foods: [cheese, spinach, berry],
        recipes: [recipe],
        planEntries: [entry('cheese', { meal_slot: 'lunch', recipe_id: 'r1' })],
      }),
    );
    expect(c.gapGroup).toBe('fruit');
    expect(c.gap.map((o) => o.food.id)).toEqual(['berry']);
    expect(c.gap[0]).toMatchObject({ reasonKey: 'gapPantry', group: 'fruit' });
  });

  it("reports 'balanced' and invents nothing when every group is covered", () => {
    const groups = ['vegetable', 'fruit', 'protein', 'carb', 'dairy'] as const;
    const foods = groups.map((g) => food(g, { category: g }));
    const c = selectPlateCandidates(
      input({ foods, planEntries: groups.map((g) => entry(g, { meal_slot: 'lunch' })) }),
    );
    expect(c.status.gap).toBe('balanced');
    expect(c.gapGroup).toBeNull();
    expect(c.gap).toEqual([]);
  });

  it('gives identical output for shuffled input', () => {
    const foods = [
      food('carrot', { category: 'vegetable', is_safe: true }),
      food('apple', { category: 'fruit', is_safe: true }),
      food('bread', { category: 'carb', is_safe: true }),
      food('pea', { category: 'vegetable' }),
      food('bean', { category: 'vegetable' }),
      food('kiwi', { category: 'fruit' }),
    ];
    const rows = [row('pea'), row('bean'), row('kiwi', { nextDueOn: '2026-09-30', consecutiveSuccesses: 1, currentRung: 'full_portion' })];
    const entries = [entry('bread', { meal_slot: 'breakfast' }), entry('apple', { date: '2026-09-20', result: 'ate' })];
    const a = selectPlateCandidates(input({ foods, ladderRows: rows, planEntries: entries }));
    const b = selectPlateCandidates(
      input({ foods: [...foods].reverse(), ladderRows: [...rows].reverse(), planEntries: [...entries].reverse() }),
    );
    expect(b).toEqual(a);
  });

  it('puts a mastered camelCase LadderRow in the safe zone', () => {
    const c = selectPlateCandidates(
      input({
        foods: [food('mac', { category: 'carb' })],
        ladderRows: [row('mac', { status: 'mastered', currentRung: 'full_portion', nextDueOn: null })],
      }),
    );
    expect(c.safe.map((o) => o.food.id)).toEqual(['mac']);
    expect(c.safe[0]).toMatchObject({ reasonKey: 'mastered', ladderRowId: 'row-mac' });
  });
});

describe('nextOpenSlot', () => {
  it('returns dinner at 13:30 with lunch planned, and tomorrow breakfast at 21:00', () => {
    const entries = [entry('x', { meal_slot: 'lunch' })];
    expect(nextOpenSlot('kid-1', entries, new Date(2026, 8, 24, 13, 30))).toEqual({ date: TODAY, slot: 'dinner' });
    expect(nextOpenSlot('kid-1', entries, new Date(2026, 8, 24, 21, 0))).toEqual({
      date: '2026-09-25',
      slot: 'breakfast',
    });
  });
});

describe('planWriteEntries', () => {
  it('dedupes ids, skips foods already in the slot and files the try bite under try_bite', () => {
    const existing = [entry('rice', { meal_slot: 'dinner' })];
    const { entries, skipped } = planWriteEntries(
      'kid-1',
      TODAY,
      'dinner',
      { safe: 'rice', tryBite: 'pea', bridge: 'pea', gap: 'apple' },
      existing,
      'try_bite',
    );
    expect(skipped).toEqual(['rice']);
    expect(entries).toEqual([
      { kid_id: 'kid-1', date: TODAY, meal_slot: 'try_bite', food_id: 'pea', result: null },
      { kid_id: 'kid-1', date: TODAY, meal_slot: 'dinner', food_id: 'apple', result: null },
    ]);
    const same = planWriteEntries('kid-1', TODAY, 'dinner', { tryBite: 'pea' }, [], 'same');
    expect(same.entries[0].meal_slot).toBe('dinner');
  });
});

describe('favouritePlates', () => {
  it('ranks repeated good plates and drops one that now carries an allergen', () => {
    const foodsById = new Map(
      [
        food('pasta', { category: 'carb' }),
        food('peas', { category: 'vegetable' }),
        food('satay', { name: 'Satay chicken', category: 'protein' }),
        food('rice', { category: 'carb' }),
      ].map((f) => [f.id, f] as const),
    );
    const entries = [
      entry('pasta', { date: '2026-09-20', result: 'ate' }),
      entry('peas', { date: '2026-09-20', result: 'tasted' }),
      entry('pasta', { date: '2026-09-22', result: 'ate' }),
      entry('peas', { date: '2026-09-22', result: 'ate' }),
      entry('satay', { date: '2026-09-21', result: 'ate' }),
      entry('rice', { date: '2026-09-21', result: 'ate' }),
      entry('satay', { date: '2026-09-23', result: 'ate' }),
      entry('rice', { date: '2026-09-23', result: 'ate' }),
      entry('satay', { date: '2026-09-19', result: 'ate' }),
      entry('rice', { date: '2026-09-19', result: 'ate' }),
    ];
    const before = favouritePlates(entries, 'kid-1', TODAY, kid(), foodsById);
    expect(before.map((p) => p.key)).toEqual(['rice,satay', 'pasta,peas']);

    // The satay was fine when it was served; the kid's new peanut allergy drops it.
    foodsById.set('satay', food('satay', { name: 'Satay chicken', category: 'protein', allergens: ['peanuts'] }));
    const tagged = favouritePlates(entries, 'kid-1', TODAY, kid({ allergens: ['peanuts'] }), foodsById);
    expect(tagged.map((p) => p.key)).toEqual(['pasta,peas']);
    expect(tagged[0]).toMatchObject({ count: 2, lastDate: '2026-09-22' });
  });
});
