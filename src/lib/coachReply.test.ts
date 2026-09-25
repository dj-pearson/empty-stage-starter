import { describe, expect, it } from 'vitest';
import {
  extractMentionedFoods,
  pickNextOpenSlot,
  replyAllergenWarnings,
  resolveCoachActions,
  type ResolveCoachActionsInput,
} from './coachReply';
import type { Food, Kid, PlanEntry } from '@/types';

function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return { id, name, category: 'protein', is_safe: false, is_try_bite: false, ...extra };
}

describe('replyAllergenWarnings', () => {
  const treeNutKid = { allergens: ['tree nuts'], allergen_severity: { 'tree nuts': 'severe' as const } };

  it('flags almond butter for a tree-nut kid', () => {
    expect(replyAllergenWarnings('Try a thin layer of almond butter on toast.', treeNutKid)).toEqual([
      { key: 'tree nut', severity: 'severe' },
    ]);
  });

  it('does not flag butternut squash', () => {
    expect(replyAllergenWarnings('Roast some butternut squash fries.', treeNutKid)).toEqual([]);
  });

  it('puts severe first and reads a missing severity as unrecorded', () => {
    const kid = { allergens: ['egg', 'milk', 'peanut'], allergen_severity: { milk: 'mild', peanut: 'severe' } };
    expect(replyAllergenWarnings('Scrambled egg with milk, or peanut sauce.', kid)).toEqual([
      { key: 'peanut', severity: 'severe' },
      { key: 'egg', severity: 'unrecorded' },
      { key: 'milk', severity: 'mild' },
    ]);
  });

  it('returns nothing when allergies are unknown or none', () => {
    expect(replyAllergenWarnings('peanut butter', { allergens: undefined })).toEqual([]);
    expect(replyAllergenWarnings('peanut butter', { allergens: [] })).toEqual([]);
  });
});

describe('extractMentionedFoods', () => {
  const foods = [food('b', 'Butter'), food('pb', 'Peanut butter'), food('c', 'Carrots'), food('x', 'Ox')];

  it('takes peanut butter as one food, not butter', () => {
    expect(extractMentionedFoods('Spread peanut butter on a cracker.', foods).map((f) => f.id)).toEqual(['pb']);
  });

  it('keeps order of first appearance and dedupes', () => {
    const text = 'Serve carrots with butter. More CARROTS later, and Peanut Butter.';
    expect(extractMentionedFoods(text, foods).map((f) => f.id)).toEqual(['c', 'b', 'pb']);
  });

  it('matches whole words only and ignores names under three characters', () => {
    expect(extractMentionedFoods('Buttery carrotsy ox', foods)).toEqual([]);
  });

  it('caps at max', () => {
    expect(extractMentionedFoods('carrots, butter, peanut butter', foods, 2)).toHaveLength(2);
  });
});

type ActionKid = ResolveCoachActionsInput['kid'];

function actionKid(extra: Partial<Kid> = {}): ActionKid {
  return { id: 'k1', name: 'Emma', allergens: [], disliked_foods: [], always_eats_foods: [], ...extra };
}

function resolve(foods: Food[], extra: Partial<ResolveCoachActionsInput> = {}) {
  return resolveCoachActions({
    kid: actionKid(),
    mentioned: foods,
    foodById: new Map(foods.map((f) => [f.id, f])),
    ladderFoodIds: new Set(),
    plannedFoodIds: new Set(),
    allergyState: 'none',
    ...extra,
  });
}

describe('resolveCoachActions', () => {
  const carrots = food('c', 'Carrots');

  it('offers try bite, ladder and grocery for one clean food', () => {
    expect(resolve([carrots]).map((a) => [a.type, a.status])).toEqual([
      ['try_bite', 'ok'],
      ['ladder', 'ok'],
      ['grocery', 'ok'],
    ]);
  });

  it('blocks try bite and ladder on a severe hit and asks before grocery', () => {
    const pb = food('pb', 'Peanut butter');
    const actions = resolve([pb], {
      kid: actionKid({ allergens: ['peanuts'], allergen_severity: { peanut: 'severe' } }),
      allergyState: 'listed',
    });
    expect(actions.map((a) => [a.type, a.status])).toEqual([
      ['try_bite', 'blocked'],
      ['ladder', 'blocked'],
      ['grocery', 'confirm'],
    ]);
    expect(actions[0].reason).toEqual({ allergen: 'peanut', severity: 'severe' });
    expect(actions[2].reason).toEqual({ allergen: 'peanut', severity: 'severe' });
  });

  it('asks for confirmation while allergies are unknown', () => {
    const actions = resolve([carrots], { kid: actionKid({ allergens: undefined }), allergyState: 'unknown' });
    expect(actions.filter((a) => a.type !== 'grocery').every((a) => a.status === 'confirm')).toBe(true);
  });

  it('asks before adding a grocery item whose name hits', () => {
    const milk = food('m', 'Whole milk');
    const actions = resolve([milk], {
      kid: actionKid({ allergens: ['dairy'], allergen_severity: { milk: 'mild' } }),
      allergyState: 'listed',
      ladderFoodIds: new Set(['m']),
      plannedFoodIds: new Set(['m']),
    });
    expect(actions).toEqual([
      { key: 'grocery:m', type: 'grocery', food: milk, status: 'confirm', reason: { allergen: 'milk', severity: 'mild' } },
    ]);
  });

  it('drops ladder for a food already on it and try bite for one already planned', () => {
    const actions = resolve([carrots], { ladderFoodIds: new Set(['c']), plannedFoodIds: new Set(['c']) });
    expect(actions.map((a) => a.type)).toEqual(['grocery']);
  });

  it('spreads three chips across three foods, one per type per food', () => {
    const foods = [carrots, food('p', 'Peas'), food('r', 'Rice')];
    const actions = resolve(foods);
    expect(actions).toHaveLength(3);
    expect(actions.map((a) => a.key)).toEqual(['try_bite:c', 'try_bite:p', 'try_bite:r']);
    expect(new Set(actions.map((a) => a.key)).size).toBe(3);
  });
});

describe('pickNextOpenSlot', () => {
  const entry = (date: string, meal_slot: PlanEntry['meal_slot'], kid_id = 'k1'): PlanEntry => ({
    id: `${date}-${meal_slot}-${kid_id}`,
    kid_id,
    date,
    meal_slot,
    food_id: 'f',
    result: null,
  });
  const morning = new Date(2026, 8, 24, 10, 0);
  const evening = new Date(2026, 8, 24, 18, 30);

  it("returns today's dinner when free before 17:00", () => {
    expect(pickNextOpenSlot('k1', [entry('2026-09-24', 'dinner', 'k2')], morning)).toEqual({
      date: '2026-09-24',
      meal_slot: 'dinner',
    });
  });

  it("falls back to tomorrow's snack when today's dinner is taken", () => {
    expect(pickNextOpenSlot('k1', [entry('2026-09-24', 'dinner')], morning)).toEqual({
      date: '2026-09-25',
      meal_slot: 'snack1',
    });
  });

  it('falls back after 17:00', () => {
    expect(pickNextOpenSlot('k1', [], evening)).toEqual({ date: '2026-09-25', meal_slot: 'snack1' });
  });

  it("uses tomorrow's dinner when tomorrow's snack is taken", () => {
    expect(pickNextOpenSlot('k1', [entry('2026-09-25', 'snack1')], evening)).toEqual({
      date: '2026-09-25',
      meal_slot: 'dinner',
    });
  });
});
