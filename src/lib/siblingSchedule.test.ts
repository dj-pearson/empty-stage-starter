import { describe, it, expect } from 'vitest';
import type { Food, Kid } from '@/types';
import type { KidPlate } from './platePlanner';
import {
  buildSiblingScheduleRequests,
  buildSiblingScheduleRequestsResult,
  siblingScheduleGuard,
} from './siblingSchedule';

/**
 * US-718: "Use this meal" has to schedule something real.
 *
 * It used to send `food_id: ''` to addPlanEntry. plan_entries.food_id is a NOT
 * NULL uuid, so an empty string is invalid rather than absent and the insert
 * was rejected every time -- and before US-717 the context appended a
 * locally-generated row anyway, so the meal showed up on the planner and
 * existed nowhere else.
 */

const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const KID_A = '11111111-1111-1111-1111-111111111111';
const KID_B = '22222222-2222-2222-2222-222222222222';

describe('buildSiblingScheduleRequests (US-718)', () => {
  it('never emits an empty food_id, because it emits no food_id at all', () => {
    const requests = buildSiblingScheduleRequests({
      recipeId: UUID,
      kidIds: [KID_A],
      date: '2026-09-08',
      mealSlot: 'dinner',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty('food_id');
    expect(requests[0]).not.toHaveProperty('p_food_id');
    expect(JSON.stringify(requests)).not.toContain('""');
  });

  it('carries the recipe id and the slot for one child', () => {
    expect(
      buildSiblingScheduleRequests({
        recipeId: UUID,
        kidIds: [KID_A],
        date: '2026-09-08',
        mealSlot: 'dinner',
      }),
    ).toEqual([
      { p_kid_id: KID_A, p_recipe_id: UUID, p_date: '2026-09-08', p_meal_slot: 'dinner' },
    ]);
  });

  it('schedules the meal once per sibling', () => {
    const requests = buildSiblingScheduleRequests({
      recipeId: UUID,
      kidIds: [KID_A, KID_B],
      date: '2026-09-08',
      mealSlot: 'lunch',
    });
    expect(requests.map((r) => r.p_kid_id)).toEqual([KID_A, KID_B]);
    expect(requests.every((r) => r.p_recipe_id === UUID)).toBe(true);
  });

  it('drops a blank or missing kid id instead of sending one', () => {
    const requests = buildSiblingScheduleRequests({
      recipeId: UUID,
      kidIds: ['', null, undefined, KID_A, '   '],
      date: '2026-09-08',
      mealSlot: 'dinner',
    });
    expect(requests.map((r) => r.p_kid_id)).toEqual([KID_A]);
  });

  it('does not schedule the same child twice', () => {
    const requests = buildSiblingScheduleRequests({
      recipeId: UUID,
      kidIds: [KID_A, KID_A],
      date: '2026-09-08',
      mealSlot: 'dinner',
    });
    expect(requests).toHaveLength(1);
  });

  it('returns nothing when the result has no recipe', () => {
    for (const recipeId of [null, undefined, '', '   ']) {
      expect(
        buildSiblingScheduleRequests({
          recipeId,
          kidIds: [KID_A],
          date: '2026-09-08',
          mealSlot: 'dinner',
        }),
      ).toEqual([]);
    }
  });

  it('returns nothing when there are no children selected', () => {
    expect(
      buildSiblingScheduleRequests({
        recipeId: UUID,
        kidIds: [],
        date: '2026-09-08',
        mealSlot: 'dinner',
      }),
    ).toEqual([]);
  });

  it('returns nothing without a date or a slot', () => {
    expect(
      buildSiblingScheduleRequests({ recipeId: UUID, kidIds: [KID_A], date: '', mealSlot: 'dinner' }),
    ).toEqual([]);
    expect(
      buildSiblingScheduleRequests({ recipeId: UUID, kidIds: [KID_A], date: '2026-09-08', mealSlot: '' }),
    ).toEqual([]);
  });

  it('every emitted payload is complete', () => {
    const requests = buildSiblingScheduleRequests({
      recipeId: UUID,
      kidIds: [KID_A, KID_B],
      date: '2026-09-08',
      mealSlot: 'dinner',
    });
    for (const r of requests) {
      expect(Object.values(r).every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    }
  });
});

describe('buildSiblingScheduleRequestsResult', () => {
  const base = { recipeId: UUID, kidIds: [KID_A], date: '2026-09-08', mealSlot: 'dinner' };

  it('says which part is missing', () => {
    expect(buildSiblingScheduleRequestsResult({ ...base, recipeId: ' ' })).toEqual({ ok: false, reason: 'no_recipe' });
    expect(buildSiblingScheduleRequestsResult({ ...base, date: '' })).toEqual({ ok: false, reason: 'no_date' });
    expect(buildSiblingScheduleRequestsResult({ ...base, mealSlot: '' })).toEqual({ ok: false, reason: 'no_date' });
    expect(buildSiblingScheduleRequestsResult({ ...base, kidIds: ['', null] })).toEqual({ ok: false, reason: 'no_kids' });
  });

  it('returns the same requests as the list form', () => {
    const out = buildSiblingScheduleRequestsResult({ ...base, kidIds: [KID_A, KID_B] });
    expect(out.ok && out.requests).toEqual(buildSiblingScheduleRequests({ ...base, kidIds: [KID_A, KID_B] }));
  });
});

describe('siblingScheduleGuard', () => {
  const food = (id: string, name: string, allergens: string[] = []): Food => ({
    id,
    name,
    category: 'protein',
    is_safe: true,
    is_try_bite: false,
    allergens,
  });
  const sauce = food('sauce', 'Satay sauce', ['peanut']);
  const noodles = food('noodles', 'Noodles');
  const foodById = new Map([sauce, noodles].map((f) => [f.id, f]));
  const kid = (id: string, name: string, over: Partial<Kid> = {}): Kid => ({ id, name, allergens: [], ...over });

  const severe = kid('s', 'Sam', { allergens: ['peanut'], allergen_severity: { peanut: 'severe' } });
  const unrated = kid('u', 'Uma', { allergens: ['peanut'] });
  const mild = kid('m', 'Mia', { allergens: ['peanut'], allergen_severity: { peanut: 'mild' } });
  const clear = kid('c', 'Cal');

  const plate = (kidId: string, over: Partial<KidPlate> = {}): KidPlate => ({
    kidId,
    kidName: kidId,
    placements: [],
    onPlate: [],
    separated: [],
    heldBack: [],
    exposure: null,
    blocked: false,
    blockedBy: null,
    isEmpty: false,
    ...over,
  });

  it('removes severe and unrated kids, keeps mild ones', () => {
    const out = siblingScheduleGuard({
      kids: [severe, unrated, mild, clear],
      recipeFoodIds: ['sauce', 'noodles'],
      foodById,
    });
    expect(out.schedule).toEqual(['m', 'c']);
    expect(out.blocked.map((b) => [b.kid.id, b.allergen, b.copyKind, b.cause])).toEqual([
      ['s', 'peanut', 'severe', 'allergen'],
      ['u', 'peanut', 'severeUnrated', 'allergen'],
    ]);
    expect(out.noFoods).toBe(false);
  });

  it('removes plate-blocked and empty-plate kids', () => {
    const out = siblingScheduleGuard({
      kids: [mild, clear, kid('e', 'Eve')],
      recipeFoodIds: ['noodles'],
      foodById,
      plates: [
        plate('m', { blocked: true, blockedBy: { kind: 'cannot_hold_back', componentName: 'Noodles' } }),
        plate('c'),
        plate('e', { isEmpty: true }),
      ],
    });
    expect(out.schedule).toEqual(['c']);
    expect(out.blocked.map((b) => [b.kid.id, b.cause])).toEqual([
      ['m', 'plate_blocked'],
      ['e', 'plate_empty'],
    ]);
  });

  it('flags a recipe with no foods', () => {
    expect(siblingScheduleGuard({ kids: [clear], recipeFoodIds: [], foodById }).noFoods).toBe(true);
    expect(siblingScheduleGuard({ kids: [clear], recipeFoodIds: null, foodById }).noFoods).toBe(true);
  });
});
