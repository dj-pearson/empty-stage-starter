/**
 * US-597 / US-598: exposure ladder progression policy.
 *
 * These tests are the contract for the therapeutic behaviour of the feature.
 * In particular `steps down on a refusal` and `auto-pauses after two refusals
 * in a row` are not incidental — they are the rules that keep the app from
 * pushing a child who has just said no. Treat a failure here as a product
 * defect, not a broken assertion.
 *
 * The Swift mirror (US-606) is expected to pass the equivalent cases so the
 * two platforms cannot drift.
 */

import { describe, it, expect } from 'vitest';
import {
  RUNGS,
  ADVANCE_THRESHOLD,
  COOLDOWN_DAYS,
  REPEAT_DAYS,
  TANTRUM_COOLDOWN_DAYS,
  addDays,
  applyAttemptOutcome,
  deriveLadderFromAttempts,
  initialLadderState,
  isRung,
  nextRung,
  prevRung,
  rungIndex,
  type LadderAttempt,
  type LadderState,
  type Rung,
} from './exposureLadder';

const TODAY = '2026-08-01';

function stateAt(rung: Rung, over: Partial<LadderState> = {}): LadderState {
  return { ...initialLadderState(TODAY), currentRung: rung, ...over };
}

/** Apply a run of outcomes in sequence, all on the same day. */
function run(start: LadderState, outcomes: Parameters<typeof applyAttemptOutcome>[1][]) {
  return outcomes.reduce(
    (acc, outcome) => applyAttemptOutcome(acc, outcome, { today: TODAY }),
    start
  );
}

describe('rung helpers', () => {
  it('orders the eight stages gentlest first', () => {
    expect(RUNGS[0]).toBe('looking');
    expect(RUNGS[RUNGS.length - 1]).toBe('full_portion');
    expect(RUNGS).toHaveLength(8);
  });

  it('treats an unknown stage as the first rung rather than -1', () => {
    expect(rungIndex('not_a_rung')).toBe(0);
    expect(isRung('not_a_rung')).toBe(false);
    expect(isRung('licking')).toBe(true);
  });

  it('returns null above the top rung and clamps at the bottom', () => {
    expect(nextRung('full_portion')).toBeNull();
    expect(nextRung('looking')).toBe('touching');
    expect(prevRung('looking')).toBe('looking');
    expect(prevRung('touching')).toBe('looking');
  });
});

describe('addDays', () => {
  it('adds whole days without timezone drift', () => {
    expect(addDays('2026-08-01', 2)).toBe('2026-08-03');
    expect(addDays('2026-08-30', 4)).toBe('2026-09-03');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    // Leap day, because the one date bug everyone ships is February.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('applyAttemptOutcome', () => {
  it('never mutates the state it is given', () => {
    const before = stateAt('touching');
    const snapshot = JSON.parse(JSON.stringify(before));
    applyAttemptOutcome(before, 'refused', { today: TODAY });
    expect(before).toEqual(snapshot);
  });

  it('holds the rung on a single success and advances on the second', () => {
    const first = applyAttemptOutcome(stateAt('touching'), 'success', { today: TODAY });
    expect(first.currentRung).toBe('touching');
    expect(first.consecutiveSuccesses).toBe(1);

    const second = applyAttemptOutcome(first, 'success', { today: TODAY });
    expect(second.currentRung).toBe('smelling');
    expect(second.consecutiveSuccesses).toBe(0);
    expect(second.nextDueOn).toBe(addDays(TODAY, REPEAT_DAYS));
  });

  it('requires exactly ADVANCE_THRESHOLD consecutive successes', () => {
    const outcomes = Array<'success'>(ADVANCE_THRESHOLD).fill('success');
    const advanced = run(stateAt('looking'), outcomes);
    expect(advanced.currentRung).toBe('touching');
  });

  it('holds the rung on a partial and resets the success streak', () => {
    const primed = applyAttemptOutcome(stateAt('licking'), 'success', { today: TODAY });
    const held = applyAttemptOutcome(primed, 'partial', { today: TODAY });

    expect(held.currentRung).toBe('licking');
    expect(held.consecutiveSuccesses).toBe(0);
    expect(held.consecutiveHolds).toBe(1);
    expect(held.nextDueOn).toBe(addDays(TODAY, REPEAT_DAYS));
  });

  it('steps DOWN a rung on a refusal and rests longer than a normal repeat', () => {
    const refused = applyAttemptOutcome(stateAt('small_bite'), 'refused', { today: TODAY });

    expect(refused.currentRung).toBe('tiny_taste');
    expect(refused.nextDueOn).toBe(addDays(TODAY, COOLDOWN_DAYS));
    expect(COOLDOWN_DAYS).toBeGreaterThan(REPEAT_DAYS);
    expect(refused.status).toBe('active');
  });

  it('does not underflow when refused at the bottom rung', () => {
    const refused = applyAttemptOutcome(stateAt('looking'), 'refused', { today: TODAY });
    expect(refused.currentRung).toBe('looking');
    expect(refused.nextDueOn).toBe(addDays(TODAY, COOLDOWN_DAYS));
  });

  it('auto-pauses the food after two refusals in a row, with nothing scheduled', () => {
    const rested = run(stateAt('full_bite'), ['refused', 'refused']);

    expect(rested.status).toBe('paused');
    expect(rested.pausedReason).toBe('two_refusals');
    // Nothing due: the parent has to choose to come back to this food.
    expect(rested.nextDueOn).toBeNull();
    // Each refusal steps down, so two in a row drops two rungs. When the
    // parent does resume, they resume somewhere gentler than where it broke.
    expect(rested.currentRung).toBe('tiny_taste');
  });

  it('clears the refusal streak once the child engages again', () => {
    const recovered = run(stateAt('full_bite'), ['refused', 'partial']);
    expect(recovered.consecutiveRefusals).toBe(0);
    expect(recovered.status).toBe('active');
  });

  it('backs off with the longest rest on distress', () => {
    const distressed = applyAttemptOutcome(stateAt('tiny_taste'), 'tantrum', { today: TODAY });

    expect(distressed.status).toBe('backed_off');
    expect(distressed.pausedReason).toBe('distress');
    expect(distressed.currentRung).toBe('licking');
    expect(distressed.nextDueOn).toBe(addDays(TODAY, TANTRUM_COOLDOWN_DAYS));
    expect(TANTRUM_COOLDOWN_DAYS).toBeGreaterThan(COOLDOWN_DAYS);
  });

  it('masters the food and stops scheduling it at the top of the ladder', () => {
    const mastered = run(stateAt('full_portion'), ['success', 'success']);

    expect(mastered.status).toBe('mastered');
    expect(mastered.nextDueOn).toBeNull();
    expect(mastered.currentRung).toBe('full_portion');
  });

  it('leaves the ladder untouched for an outcome it does not model', () => {
    const before = stateAt('smelling', { consecutiveSuccesses: 1 });
    const after = applyAttemptOutcome(
      before,
      'weird_legacy_label' as unknown as 'success',
      { today: TODAY }
    );

    expect(after.currentRung).toBe('smelling');
    expect(after.consecutiveSuccesses).toBe(1);
    expect(after.status).toBe('active');
  });

  it('records when the attempt happened', () => {
    const after = applyAttemptOutcome(stateAt('looking'), 'success', {
      today: TODAY,
      attemptAt: '2026-07-30T18:12:00.000Z',
    });
    expect(after.lastAttemptAt).toBe('2026-07-30T18:12:00.000Z');
  });
});

describe('deriveLadderFromAttempts', () => {
  const attempt = (over: Partial<LadderAttempt> = {}): LadderAttempt => ({
    kidId: 'kid-1',
    foodId: 'food-1',
    stage: 'looking',
    outcome: 'success',
    attemptedAt: '2026-07-01T12:00:00.000Z',
    ...over,
  });

  it('produces nothing from an empty history', () => {
    expect(deriveLadderFromAttempts([], { today: TODAY })).toEqual([]);
  });

  it('climbs a food that has been going well', () => {
    const rows = deriveLadderFromAttempts(
      [
        attempt({ attemptedAt: '2026-07-01T12:00:00.000Z' }),
        attempt({ attemptedAt: '2026-07-03T12:00:00.000Z' }),
        attempt({ attemptedAt: '2026-07-05T12:00:00.000Z' }),
        attempt({ attemptedAt: '2026-07-07T12:00:00.000Z' }),
      ],
      { today: TODAY }
    );

    expect(rows).toHaveLength(1);
    // Four successes from 'looking' = two advances.
    expect(rows[0].state.currentRung).toBe('smelling');
    expect(rows[0].state.status).toBe('active');
  });

  it('starts from the rung the history was actually logged at', () => {
    const rows = deriveLadderFromAttempts(
      [attempt({ stage: 'small_bite', outcome: 'success' })],
      { today: TODAY }
    );
    // One success at small_bite: holds there rather than resetting to looking.
    expect(rows[0].state.currentRung).toBe('small_bite');
  });

  it('lands a history that ends badly in a rested state', () => {
    const rows = deriveLadderFromAttempts(
      [
        attempt({ stage: 'small_bite', attemptedAt: '2026-07-01T12:00:00.000Z' }),
        attempt({
          stage: 'small_bite',
          outcome: 'refused',
          attemptedAt: '2026-07-04T12:00:00.000Z',
        }),
        attempt({
          stage: 'small_bite',
          outcome: 'refused',
          attemptedAt: '2026-07-08T12:00:00.000Z',
        }),
      ],
      { today: TODAY }
    );

    expect(rows[0].state.status).toBe('paused');
    expect(rows[0].state.nextDueOn).toBeNull();
  });

  it('replays out-of-order history in chronological order', () => {
    const chronological = deriveLadderFromAttempts(
      [
        attempt({ outcome: 'refused', attemptedAt: '2026-07-01T12:00:00.000Z' }),
        attempt({ outcome: 'success', attemptedAt: '2026-07-05T12:00:00.000Z' }),
        attempt({ outcome: 'success', attemptedAt: '2026-07-09T12:00:00.000Z' }),
      ],
      { today: TODAY }
    );
    const shuffled = deriveLadderFromAttempts(
      [
        attempt({ outcome: 'success', attemptedAt: '2026-07-09T12:00:00.000Z' }),
        attempt({ outcome: 'refused', attemptedAt: '2026-07-01T12:00:00.000Z' }),
        attempt({ outcome: 'success', attemptedAt: '2026-07-05T12:00:00.000Z' }),
      ],
      { today: TODAY }
    );

    expect(shuffled).toEqual(chronological);
  });

  it('separates rows per kid and per food', () => {
    const rows = deriveLadderFromAttempts(
      [
        attempt({ kidId: 'kid-1', foodId: 'food-1' }),
        attempt({ kidId: 'kid-1', foodId: 'food-2' }),
        attempt({ kidId: 'kid-2', foodId: 'food-1' }),
      ],
      { today: TODAY }
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => `${r.kidId}/${r.foodId}`)).toEqual([
      'kid-1/food-1',
      'kid-1/food-2',
      'kid-2/food-1',
    ]);
  });

  it('skips rows that cannot describe a ladder position instead of throwing', () => {
    const rows = deriveLadderFromAttempts(
      [
        attempt({ kidId: null }),
        attempt({ foodId: null }),
        attempt({ outcome: null }),
        attempt({ outcome: 'some_legacy_outcome' }),
        attempt(),
      ],
      { today: TODAY }
    );

    expect(rows).toHaveLength(1);
  });

  it('tolerates an unrecognized stage label', () => {
    const rows = deriveLadderFromAttempts([attempt({ stage: 'nibbled_maybe' })], {
      today: TODAY,
    });
    expect(rows[0].state.currentRung).toBe('looking');
  });

  it('is idempotent — re-deriving the same history gives the same rows', () => {
    const history = [
      attempt({ attemptedAt: '2026-07-01T12:00:00.000Z' }),
      attempt({ outcome: 'partial', attemptedAt: '2026-07-04T12:00:00.000Z' }),
      attempt({ attemptedAt: '2026-07-06T12:00:00.000Z' }),
    ];

    expect(deriveLadderFromAttempts(history, { today: TODAY })).toEqual(
      deriveLadderFromAttempts(history, { today: TODAY })
    );
  });
});
