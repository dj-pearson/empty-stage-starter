/**
 * US-604: weekly ladder narrative.
 *
 * The test that matters most is `a mixed week` — it pins the counting for a
 * week where one food climbs, one holds, one is eased back and one is
 * finished, all at once. Everything else in the report is prose built on top
 * of those four numbers, so if they are right the section is right.
 */

import { describe, it, expect } from 'vitest';
import { summarizeLadderWeek } from './ladderWeekly';
import type { LadderAttempt } from './exposureLadder';

const WEEK_START = '2026-03-02';
const WEEK_END = '2026-03-08';

function attempt(
  foodId: string,
  day: string,
  outcome: LadderAttempt['outcome'],
  stage: string | null = null
): LadderAttempt {
  return {
    kidId: 'kid-1',
    foodId,
    stage,
    outcome,
    attemptedAt: `${day}T18:00:00.000Z`,
  };
}

const NAMES = {
  broccoli: 'Broccoli',
  peas: 'Peas',
  yogurt: 'Yogurt',
  nuggets: 'Nuggets',
};

describe('summarizeLadderWeek', () => {
  it('returns null when the household has no ladder history at all', () => {
    expect(
      summarizeLadderWeek({ attempts: [], weekStart: WEEK_START, weekEnd: WEEK_END })
    ).toBeNull();
  });

  it('returns null when nothing in the history is a ladder outcome', () => {
    const junk: LadderAttempt[] = [
      {
        kidId: 'kid-1',
        foodId: 'broccoli',
        stage: 'looking',
        outcome: 'unknown',
        attemptedAt: `${WEEK_START}T12:00:00Z`,
      },
      {
        kidId: 'kid-1',
        foodId: null,
        stage: null,
        outcome: 'success',
        attemptedAt: `${WEEK_START}T12:00:00Z`,
      },
    ];
    expect(
      summarizeLadderWeek({ attempts: junk, weekStart: WEEK_START, weekEnd: WEEK_END })
    ).toBeNull();
  });

  it('counts a mixed week: one advanced, one held, one backed off, one mastered', () => {
    const attempts: LadderAttempt[] = [
      // Broccoli: sitting at 'touching' before the week, two successes inside
      // it -> advances to 'smelling'.
      attempt('broccoli', '2026-02-20', 'partial', 'touching'),
      attempt('broccoli', '2026-03-03', 'success'),
      attempt('broccoli', '2026-03-06', 'success'),

      // Peas: engaged twice but never cleared the rung -> holds at 'licking'.
      attempt('peas', '2026-02-25', 'partial', 'licking'),
      attempt('peas', '2026-03-04', 'partial'),
      attempt('peas', '2026-03-07', 'partial'),

      // Yogurt: real distress inside the week -> steps down and rests.
      attempt('yogurt', '2026-02-24', 'success', 'small_bite'),
      attempt('yogurt', '2026-03-05', 'tantrum'),

      // Nuggets: already at the top rung, two successes finish the ladder.
      attempt('nuggets', '2026-02-26', 'partial', 'full_portion'),
      attempt('nuggets', '2026-03-02', 'success'),
      attempt('nuggets', '2026-03-08', 'success'),
    ];

    const summary = summarizeLadderWeek({
      attempts,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      kidId: 'kid-1',
      foodNames: NAMES,
    });

    expect(summary).not.toBeNull();
    const s = summary!;

    expect(s.advanced.map((m) => m.foodName).sort()).toEqual(['Broccoli', 'Nuggets']);
    expect(s.held.map((m) => m.foodName)).toEqual(['Peas']);
    expect(s.backedOff.map((m) => m.foodName)).toEqual(['Yogurt']);

    expect(s.foodsWorkedOn).toBe(4);
    expect(s.totalExposures).toBe(7);
    expect(s.masteredCount).toBe(1);
    expect(s.headline).toEqual({ kind: 'week', exposures: 7, foods: 4, advanced: 2 });
    expect(s.narrative.map((l) => l.kind)).toEqual([
      'moved_up',
      'mastered',
      'held',
      'backed_off',
      'mastered_total',
    ]);

    const broccoli = s.advanced.find((m) => m.foodName === 'Broccoli')!;
    expect(broccoli.fromRung).toBe('touching');
    expect(broccoli.toRung).toBe('smelling');
    expect(broccoli.exposures).toBe(2);
    expect(broccoli.masteredThisWeek).toBe(false);

    const nuggets = s.advanced.find((m) => m.foodName === 'Nuggets')!;
    expect(nuggets.masteredThisWeek).toBe(true);

    expect(s.held[0].toRung).toBe('licking');
    expect(s.backedOff[0].fromRung).toBe('small_bite');
    // Distress steps DOWN a rung — small_bite -> tiny_taste, never sideways.
    expect(s.backedOff[0].toRung).toBe('tiny_taste');
  });

  it('measures movement against the rung the week started on, not the all-time start', () => {
    // Two successes before the week already moved this food up. The report
    // must not re-credit that climb.
    const attempts: LadderAttempt[] = [
      attempt('broccoli', '2026-02-10', 'success', 'looking'),
      attempt('broccoli', '2026-02-12', 'success'),
      attempt('broccoli', '2026-03-03', 'partial'),
    ];

    const s = summarizeLadderWeek({
      attempts,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      foodNames: NAMES,
    })!;

    expect(s.advanced).toHaveLength(0);
    expect(s.held.map((m) => m.foodName)).toEqual(['Broccoli']);
    expect(s.held[0].fromRung).toBe('touching');
    expect(s.held[0].toRung).toBe('touching');
  });

  it('ignores attempts logged after the week being reported on', () => {
    const attempts: LadderAttempt[] = [
      attempt('broccoli', '2026-03-04', 'partial', 'touching'),
      attempt('broccoli', '2026-03-10', 'success'),
      attempt('broccoli', '2026-03-12', 'success'),
    ];

    const s = summarizeLadderWeek({
      attempts,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      foodNames: NAMES,
    })!;

    expect(s.totalExposures).toBe(1);
    expect(s.advanced).toHaveLength(0);
    expect(s.held[0].toRung).toBe('touching');
  });

  it('counts mastered foods that were finished before this week', () => {
    const attempts: LadderAttempt[] = [
      attempt('nuggets', '2026-02-01', 'success', 'full_portion'),
      attempt('nuggets', '2026-02-03', 'success'),
      attempt('peas', '2026-03-04', 'partial', 'licking'),
    ];

    const s = summarizeLadderWeek({
      attempts,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      foodNames: NAMES,
    })!;

    // Mastered last month, untouched this week: counted, but not listed as
    // week movement.
    expect(s.masteredCount).toBe(1);
    expect(s.foodsWorkedOn).toBe(1);
    expect(s.advanced).toHaveLength(0);
  });

  it('gives an encouraging summary for a week with no advancement', () => {
    const attempts: LadderAttempt[] = [
      attempt('peas', '2026-03-03', 'partial', 'licking'),
      attempt('peas', '2026-03-06', 'partial'),
    ];

    const s = summarizeLadderWeek({
      attempts,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      foodNames: NAMES,
    })!;

    expect(s.advanced).toHaveLength(0);
    expect(s.narrative.map((l) => l.kind)).toContain('no_advancement');
    expect(s.narrative.map((l) => l.kind)).not.toContain('nothing_logged');
  });

  it('still produces a summary when the ladder existed but the week was empty', () => {
    const attempts: LadderAttempt[] = [attempt('peas', '2026-02-20', 'partial', 'licking')];

    const s = summarizeLadderWeek({
      attempts,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      foodNames: NAMES,
    })!;

    expect(s.foodsWorkedOn).toBe(0);
    expect(s.totalExposures).toBe(0);
    expect(s.headline).toEqual({ kind: 'empty_week' });
    expect(s.narrative.map((l) => l.kind)).toEqual(['nothing_logged']);
  });

  it('scopes to one child when kidId is given', () => {
    const attempts: LadderAttempt[] = [
      attempt('peas', '2026-03-03', 'partial', 'licking'),
      { ...attempt('broccoli', '2026-03-04', 'success', 'looking'), kidId: 'kid-2' },
    ];

    const s = summarizeLadderWeek({
      attempts,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      kidId: 'kid-1',
      foodNames: NAMES,
    })!;

    expect(s.foodsWorkedOn).toBe(1);
    expect(s.held.map((m) => m.foodName)).toEqual(['Peas']);
  });

  it('falls back to the food id when no display name is supplied', () => {
    const s = summarizeLadderWeek({
      attempts: [attempt('food-abc', '2026-03-03', 'partial', 'looking')],
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
    })!;

    expect(s.held[0].foodName).toBe('food-abc');
  });
});
