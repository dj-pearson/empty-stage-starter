/**
 * US-599 / US-602: exposure scheduling.
 *
 * The caps and exclusions asserted here are safety behaviour. `never
 * schedules more than the daily cap`, `never puts two exposures in one slot`,
 * `skips rather than serving an exposure with no anchor` and the stressful-slot
 * and blanket-pause cases all describe what reaches a real child's plate.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_ACTIVE_EXPOSURES,
  SCHEDULABLE_SLOTS,
  buildExposurePlanWrites,
  hasAllergenConflict,
  hasDislikedTexture,
  selectAnchor,
  selectDueExposures,
  successRatesFromAttempts,
  type ScheduledExposure,
  type SchedulableLadderRow,
  type SchedulerContext,
  type SchedulerFood,
  type SchedulerKid,
} from './ladderScheduler';

const DATE = '2026-08-01';

function food(over: Partial<SchedulerFood> & { id: string }): SchedulerFood {
  return {
    name: over.id,
    isSafe: false,
    allergens: [],
    texturePrimary: null,
    ...over,
  };
}

function kid(over: Partial<SchedulerKid> = {}): SchedulerKid {
  return {
    id: 'kid-1',
    allergens: [],
    textureDislikes: [],
    stressfulSlots: [],
    laddersPaused: false,
    ...over,
  };
}

function row(over: Partial<SchedulableLadderRow> & { id: string }): SchedulableLadderRow {
  return {
    kidId: 'kid-1',
    foodId: `${over.id}-food`,
    currentRung: 'touching',
    status: 'active',
    nextDueOn: DATE,
    pairedSafeFoodId: null,
    preferredMealSlot: null,
    preferredPrep: null,
    ...over,
  };
}

function ctx(over: Partial<SchedulerContext> = {}): SchedulerContext {
  const foods: SchedulerFood[] = over.foodsById
    ? [...over.foodsById.values()]
    : [
        food({ id: 'anchor-1', isSafe: true }),
        food({ id: 'r1-food' }),
        food({ id: 'r2-food' }),
        food({ id: 'r3-food' }),
        food({ id: 'r4-food' }),
      ];

  return {
    date: DATE,
    kid: kid(),
    foodsById: new Map(foods.map((f) => [f.id, f])),
    ...over,
  };
}

describe('allergen and texture predicates', () => {
  it('matches allergens case-insensitively', () => {
    expect(
      hasAllergenConflict(food({ id: 'f', allergens: ['Peanut'] }), kid({ allergens: ['peanut'] }))
    ).toBe(true);
  });

  it('reports no conflict when the child has no allergens listed', () => {
    expect(hasAllergenConflict(food({ id: 'f', allergens: ['dairy'] }), kid())).toBe(false);
  });

  it('flags a texture the child has told us they dislike', () => {
    expect(
      hasDislikedTexture(
        food({ id: 'f', texturePrimary: 'Slimy' }),
        kid({ textureDislikes: ['slimy'] })
      )
    ).toBe(true);
  });
});

describe('selectAnchor', () => {
  it('prefers the explicitly paired safe food', () => {
    const context = ctx({
      foodsById: new Map(
        [food({ id: 'paired', isSafe: true }), food({ id: 'other', isSafe: true })].map((f) => [
          f.id,
          f,
        ])
      ),
    });
    expect(selectAnchor(row({ id: 'r1', pairedSafeFoodId: 'paired' }), context)).toBe('paired');
  });

  it('refuses a paired anchor that conflicts with an allergen', () => {
    const context = ctx({
      kid: kid({ allergens: ['dairy'] }),
      foodsById: new Map(
        [
          food({ id: 'paired', isSafe: true, allergens: ['dairy'] }),
          food({ id: 'safe-fallback', isSafe: true }),
        ].map((f) => [f.id, f])
      ),
    });
    expect(selectAnchor(row({ id: 'r1', pairedSafeFoodId: 'paired' }), context)).toBe(
      'safe-fallback'
    );
  });

  it('falls back to the safe food with the strongest acceptance', () => {
    const context = ctx({
      foodsById: new Map(
        [
          food({ id: 'ok', isSafe: true }),
          food({ id: 'great', isSafe: true }),
          food({ id: 'not-safe' }),
        ].map((f) => [f.id, f])
      ),
      successRateByFoodId: new Map([
        ['ok', 0.5],
        ['great', 0.95],
      ]),
    });
    expect(selectAnchor(row({ id: 'r1' }), context)).toBe('great');
  });

  it('returns null when there is no safe food to anchor to', () => {
    const context = ctx({
      foodsById: new Map([food({ id: 'r1-food' })].map((f) => [f.id, f])),
    });
    expect(selectAnchor(row({ id: 'r1' }), context)).toBeNull();
  });
});

describe('selectDueExposures', () => {
  it('never schedules more than the daily cap', () => {
    const rows = ['r1', 'r2', 'r3', 'r4'].map((id) => row({ id }));
    const { scheduled, skipped } = selectDueExposures(rows, ctx());

    expect(scheduled).toHaveLength(MAX_ACTIVE_EXPOSURES);
    expect(skipped.filter((s) => s.reason === 'daily_cap_reached')).toHaveLength(1);
  });

  it('never puts two exposures in the same meal slot', () => {
    const rows = ['r1', 'r2', 'r3'].map((id) => row({ id }));
    const { scheduled } = selectDueExposures(rows, ctx());

    const slots = scheduled.map((s) => s.mealSlot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('leaves slots the parent marked stressful alone', () => {
    const rows = ['r1', 'r2', 'r3'].map((id) => row({ id }));
    const { scheduled } = selectDueExposures(
      rows,
      ctx({ kid: kid({ stressfulSlots: ['dinner', 'breakfast'] }) })
    );

    expect(scheduled.map((s) => s.mealSlot)).not.toContain('dinner');
    expect(scheduled.map((s) => s.mealSlot)).not.toContain('breakfast');
  });

  it('does not double-book a slot that is already committed', () => {
    const { scheduled } = selectDueExposures(
      [row({ id: 'r1', preferredMealSlot: 'lunch' })],
      ctx({ occupiedSlots: ['lunch'] })
    );
    expect(scheduled[0].mealSlot).not.toBe('lunch');
  });

  it('honors a preferred slot when it is free', () => {
    const { scheduled } = selectDueExposures(
      [row({ id: 'r1', preferredMealSlot: 'snack1' })],
      ctx()
    );
    expect(scheduled[0].mealSlot).toBe('snack1');
  });

  it('skips rather than serving an exposure with no anchor', () => {
    const context = ctx({
      foodsById: new Map([food({ id: 'r1-food' })].map((f) => [f.id, f])),
    });
    const { scheduled, skipped } = selectDueExposures([row({ id: 'r1' })], context);

    expect(scheduled).toHaveLength(0);
    expect(skipped[0].reason).toBe('no_anchor_available');
  });

  it('excludes anything but active rows', () => {
    const rows = [
      row({ id: 'paused', status: 'paused' }),
      row({ id: 'mastered', status: 'mastered' }),
      row({ id: 'backed', status: 'backed_off' }),
    ];
    const { scheduled, skipped } = selectDueExposures(rows, ctx());

    expect(scheduled).toHaveLength(0);
    expect(skipped.every((s) => s.reason === 'not_active')).toBe(true);
  });

  it('excludes a food that is not due yet — this is how a cooldown is enforced', () => {
    const { scheduled, skipped } = selectDueExposures(
      [row({ id: 'r1', nextDueOn: '2026-08-05' })],
      ctx()
    );

    expect(scheduled).toHaveLength(0);
    expect(skipped[0].reason).toBe('not_due');
  });

  it('includes an overdue food', () => {
    const { scheduled } = selectDueExposures([row({ id: 'r1', nextDueOn: '2026-07-20' })], ctx());
    expect(scheduled).toHaveLength(1);
  });

  it('excludes a food with no due date at all', () => {
    const { skipped } = selectDueExposures([row({ id: 'r1', nextDueOn: null })], ctx());
    expect(skipped[0].reason).toBe('not_due');
  });

  it('schedules nothing at all when the parent has paused this child', () => {
    const rows = ['r1', 'r2'].map((id) => row({ id }));
    const { scheduled, skipped } = selectDueExposures(rows, ctx({ kid: kid({ laddersPaused: true }) }));

    expect(scheduled).toHaveLength(0);
    expect(skipped.every((s) => s.reason === 'kid_paused')).toBe(true);
  });

  it('never schedules a food that conflicts with the child allergens', () => {
    const context = ctx({
      kid: kid({ allergens: ['peanut'] }),
      foodsById: new Map(
        [
          food({ id: 'r1-food', allergens: ['Peanut'] }),
          food({ id: 'anchor-1', isSafe: true }),
        ].map((f) => [f.id, f])
      ),
    });
    const { scheduled, skipped } = selectDueExposures([row({ id: 'r1' })], context);

    expect(scheduled).toHaveLength(0);
    expect(skipped[0].reason).toBe('allergen_conflict');
  });

  it('ignores ladder rows belonging to a different child', () => {
    const { scheduled } = selectDueExposures(
      [row({ id: 'other', kidId: 'kid-2' }), row({ id: 'mine' })],
      ctx()
    );

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].ladderRowId).toBe('mine');
  });

  it('orders the most overdue food first', () => {
    const rows = [
      row({ id: 'recent', nextDueOn: '2026-08-01' }),
      row({ id: 'ancient', nextDueOn: '2026-07-01' }),
    ];
    const { scheduled } = selectDueExposures(rows, ctx());
    expect(scheduled[0].ladderRowId).toBe('ancient');
  });

  it('deprioritizes a food whose texture the child dislikes', () => {
    const context = ctx({
      kid: kid({ textureDislikes: ['slimy'] }),
      foodsById: new Map(
        [
          food({ id: 'slimy-food', texturePrimary: 'slimy' }),
          food({ id: 'fine-food', texturePrimary: 'crunchy' }),
          food({ id: 'anchor-1', isSafe: true }),
        ].map((f) => [f.id, f])
      ),
    });
    const rows = [
      row({ id: 'a-slimy', foodId: 'slimy-food' }),
      row({ id: 'z-fine', foodId: 'fine-food' }),
    ];

    const { scheduled } = selectDueExposures(rows, context);
    // 'a-slimy' sorts first by id, so ordering here can only come from texture.
    expect(scheduled[0].foodId).toBe('fine-food');
  });

  it('carries the rung, anchor and prep through to the scheduled exposure', () => {
    const context = ctx({
      foodsById: new Map(
        [food({ id: 'r1-food' }), food({ id: 'anchor-1', isSafe: true })].map((f) => [f.id, f])
      ),
    });
    const { scheduled } = selectDueExposures(
      [row({ id: 'r1', currentRung: 'licking', preferredPrep: 'steamed' })],
      context
    );

    expect(scheduled[0]).toMatchObject({
      rung: 'licking',
      anchorFoodId: 'anchor-1',
      preferredPrep: 'steamed',
      kidId: 'kid-1',
    });
  });

  it('is deterministic — the same inputs always produce the same plan', () => {
    const rows = ['r1', 'r2', 'r3', 'r4'].map((id) => row({ id }));
    expect(selectDueExposures(rows, ctx())).toEqual(selectDueExposures(rows, ctx()));
  });

  it('only ever uses slots it is allowed to schedule into', () => {
    const rows = ['r1', 'r2', 'r3'].map((id) => row({ id }));
    const { scheduled } = selectDueExposures(rows, ctx());
    for (const exposure of scheduled) {
      expect(SCHEDULABLE_SLOTS).toContain(exposure.mealSlot);
    }
  });
});

describe('buildExposurePlanWrites', () => {
  const exposure = (over: Partial<ScheduledExposure> = {}): ScheduledExposure => ({
    ladderRowId: 'l1',
    kidId: 'kid-1',
    foodId: 'broccoli',
    rung: 'touching',
    mealSlot: 'dinner',
    anchorFoodId: 'pasta',
    preferredPrep: null,
    ...over,
  });

  it('writes the anchor onto the plate as well as the exposure', () => {
    const { entries } = buildExposurePlanWrites([exposure()], DATE, []);

    expect(entries.map((e) => e.food_id)).toEqual(['pasta', 'broccoli']);
    // "Served beside a trusted food" has to be true on the plan the parent
    // reads, not just an attribute on a ladder row they never open.
    expect(entries.every((e) => e.meal_slot === 'dinner')).toBe(true);
    expect(entries.every((e) => e.date === DATE)).toBe(true);
  });

  it('never bills an exposure as the main dish', () => {
    const { entries } = buildExposurePlanWrites([exposure()], DATE, []);
    expect(entries.every((e) => e.is_primary_dish === false)).toBe(true);
  });

  it('does not duplicate a food already on that plate', () => {
    const { entries } = buildExposurePlanWrites([exposure()], DATE, [
      { foodId: 'pasta', mealSlot: 'dinner' },
    ]);

    expect(entries.map((e) => e.food_id)).toEqual(['broccoli']);
  });

  it('is idempotent — re-running a fully scheduled day writes nothing', () => {
    const first = buildExposurePlanWrites([exposure()], DATE, []);
    const second = buildExposurePlanWrites(
      [exposure()],
      DATE,
      first.entries.map((e) => ({ foodId: e.food_id, mealSlot: e.meal_slot }))
    );

    expect(second.entries).toHaveLength(0);
  });

  it('treats the same food in a different slot as a separate plate', () => {
    const { entries } = buildExposurePlanWrites([exposure()], DATE, [
      { foodId: 'pasta', mealSlot: 'lunch' },
    ]);
    expect(entries.map((e) => e.food_id)).toEqual(['pasta', 'broccoli']);
  });

  it('records the pairing that was actually chosen back onto the ladder row', () => {
    const { ladderPatches } = buildExposurePlanWrites([exposure()], DATE, []);

    expect(ladderPatches).toEqual([
      { id: 'l1', paired_safe_food_id: 'pasta', preferred_meal_slot: 'dinner' },
    ]);
  });

  it('handles several exposures across different slots', () => {
    const { entries, ladderPatches } = buildExposurePlanWrites(
      [
        exposure({ ladderRowId: 'l1', foodId: 'broccoli', mealSlot: 'dinner' }),
        exposure({ ladderRowId: 'l2', foodId: 'pepper', mealSlot: 'lunch', anchorFoodId: 'toast' }),
      ],
      DATE,
      []
    );

    expect(entries).toHaveLength(4);
    expect(ladderPatches).toHaveLength(2);
  });
});

describe('successRatesFromAttempts', () => {
  it('scores a partial as half a success', () => {
    const rates = successRatesFromAttempts([
      { foodId: 'f1', outcome: 'success' },
      { foodId: 'f1', outcome: 'partial' },
    ]);
    expect(rates.get('f1')).toBeCloseTo(0.75);
  });

  it('drags a repeatedly refused food to the bottom', () => {
    const rates = successRatesFromAttempts([
      { foodId: 'f1', outcome: 'refused' },
      { foodId: 'f1', outcome: 'refused' },
    ]);
    expect(rates.get('f1')).toBe(0);
  });

  it('ignores attempts with no food attached', () => {
    const rates = successRatesFromAttempts([
      { foodId: null, outcome: 'success' },
      { foodId: 'f1', outcome: 'success' },
    ]);
    expect(rates.size).toBe(1);
    expect(rates.get('f1')).toBe(1);
  });

  it('returns nothing for an empty history', () => {
    expect(successRatesFromAttempts([]).size).toBe(0);
  });
});
