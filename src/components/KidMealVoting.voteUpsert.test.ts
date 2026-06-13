import { describe, it, expect } from 'vitest';
import { buildMealVoteUpsert, MEAL_VOTE_CONFLICT_TARGET } from './KidMealVoting';

describe('meal vote upsert contract (US-338)', () => {
  const base = {
    kidId: 'k1',
    householdId: 'h1',
    meal: { planEntryId: 'pe1', recipeId: 'r1', mealDate: '2026-06-13', mealSlot: 'dinner' },
  };

  it('uses the (kid_id, meal_date, meal_slot) dedupe key as the conflict target', () => {
    const { options } = buildMealVoteUpsert({ ...base, vote: 'love_it' });
    expect(options.onConflict).toBe('kid_id,meal_date,meal_slot');
    expect(MEAL_VOTE_CONFLICT_TARGET).toBe('kid_id,meal_date,meal_slot');
    // Every conflict column is always present on a real vote (no nullable
    // plan_entry_id / recipe_id), so re-voting UPDATES rather than duplicating.
    for (const col of MEAL_VOTE_CONFLICT_TARGET.split(',')) {
      const row = buildMealVoteUpsert({ ...base, vote: 'okay' }).row;
      expect(row[col]).toBeTruthy();
    }
  });

  it('builds the correct row (vote + emoji) for each vote type', () => {
    expect(buildMealVoteUpsert({ ...base, vote: 'love_it' }).row).toMatchObject({
      kid_id: 'k1',
      household_id: 'h1',
      plan_entry_id: 'pe1',
      recipe_id: 'r1',
      meal_date: '2026-06-13',
      meal_slot: 'dinner',
      vote: 'love_it',
      vote_emoji: '😍',
    });
    expect(buildMealVoteUpsert({ ...base, vote: 'okay' }).row.vote_emoji).toBe('🙂');
    expect(buildMealVoteUpsert({ ...base, vote: 'no_way' }).row.vote_emoji).toBe('😭');
  });

  it('keeps the same conflict target for a recipe-only vote (nullable plan_entry_id)', () => {
    // The old UNIQUE(kid_id, plan_entry_id) wouldn't dedupe when plan_entry_id
    // is null; the new key still does because date/slot are non-null.
    const { row, options } = buildMealVoteUpsert({
      kidId: 'k1',
      householdId: 'h1',
      meal: { recipeId: 'r1', mealDate: '2026-06-14', mealSlot: 'lunch' },
      vote: 'no_way',
    });
    expect(row.plan_entry_id).toBeUndefined();
    expect(options.onConflict).toBe('kid_id,meal_date,meal_slot');
    expect(row.meal_date).toBe('2026-06-14');
    expect(row.meal_slot).toBe('lunch');
  });
});
