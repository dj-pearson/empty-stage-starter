import { describe, it, expect } from 'vitest';
import { buildSiblingScheduleRequests } from './siblingSchedule';

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
