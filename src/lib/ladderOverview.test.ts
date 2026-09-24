/**
 * Food Tracker overview grouping.
 *
 * The screen promises each food appears once, in the place the parent can
 * act on it: a food due today is offered today, not also listed as "close to
 * safe" further down. These tests pin that exclusivity and the arithmetic
 * behind "N more good tries to safe".
 */

import { describe, it, expect } from 'vitest';
import { ADVANCE_THRESHOLD, RUNGS, applyAttemptOutcome, initialLadderState } from './exposureLadder';
import {
  CLOSE_TO_SAFE_MAX,
  exposuresToSafe,
  STALLED_HOLDS,
  groupLadder,
  selectNextStep,
  summaryCounts,
  toOverviewRow,
  type OverviewRow,
} from './ladderOverview';

const TODAY = '2026-08-10';

function row(id: string, over: Partial<OverviewRow> = {}): OverviewRow {
  return {
    id,
    currentRung: 'looking',
    consecutiveSuccesses: 0,
    consecutiveHolds: 0,
    status: 'active',
    nextDueOn: '2026-08-20',
    ...over,
  };
}

describe('exposuresToSafe', () => {
  it('counts every success the policy needs from the bottom rung', () => {
    // 7 climbs plus graduating from the top rung, ADVANCE_THRESHOLD each.
    expect(exposuresToSafe(row('a'))).toBe(RUNGS.length * ADVANCE_THRESHOLD);
    expect(exposuresToSafe(row('a'))).toBe(16);
  });

  it('is 1 at full_portion with one success banked', () => {
    expect(
      exposuresToSafe(row('a', { currentRung: 'full_portion', consecutiveSuccesses: 1 }))
    ).toBe(1);
  });

  it('is 0 once mastered', () => {
    expect(exposuresToSafe(row('a', { status: 'mastered', currentRung: 'full_portion' }))).toBe(0);
  });

  it('agrees with the policy: that many successes in a row masters the food', () => {
    let state = initialLadderState(TODAY);
    const needed = exposuresToSafe(state);
    for (let i = 0; i < needed; i++) {
      expect(state.status).toBe('active');
      state = applyAttemptOutcome(state, 'success', { today: TODAY });
    }
    expect(state.status).toBe('mastered');
  });
});

describe('groupLadder', () => {
  const rows: OverviewRow[] = [
    row('due-far', { nextDueOn: TODAY }),
    row('due-close', { nextDueOn: '2026-08-01', currentRung: 'full_portion' }),
    row('close', { currentRung: 'full_bite', consecutiveSuccesses: 1 }),
    row('working', { currentRung: 'touching' }),
    row('undated-active', { nextDueOn: null }),
    row('paused', { status: 'paused', nextDueOn: null }),
    row('backed-off', { status: 'backed_off', nextDueOn: '2026-08-15' }),
    row('safe', { status: 'mastered', currentRung: 'full_portion', nextDueOn: null }),
    row('stuck', { consecutiveHolds: 3 }),
  ];

  it('puts every row in exactly one bucket', () => {
    const g = groupLadder(rows, TODAY);
    const all = [...g.dueToday, ...g.closeToSafe, ...g.workingOn, ...g.resting, ...g.safeNow];
    expect(all.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());
    expect(new Set(all.map((r) => r.id)).size).toBe(rows.length);
  });

  it('never lists a due row as close to safe as well', () => {
    const g = groupLadder(rows, TODAY);
    const dueRow = rows.find((r) => r.id === 'due-close');
    expect(dueRow && exposuresToSafe(dueRow)).toBeLessThanOrEqual(CLOSE_TO_SAFE_MAX);
    expect(g.dueToday.map((r) => r.id)).toContain('due-close');
    expect(g.closeToSafe.map((r) => r.id)).not.toContain('due-close');
  });

  it('sorts due rows closest to safe first', () => {
    expect(groupLadder(rows, TODAY).dueToday.map((r) => r.id)).toEqual(['due-close', 'due-far']);
  });

  it('buckets the rest by status and distance', () => {
    const g = groupLadder(rows, TODAY);
    expect(g.closeToSafe.map((r) => r.id)).toEqual(['close']);
    expect(g.workingOn.map((r) => r.id)).toContain('working');
    expect(g.workingOn.map((r) => r.id)).toContain('undated-active');
    // Dated rest before undated rest.
    expect(g.resting.map((r) => r.id)).toEqual(['backed-off', 'paused']);
    expect(g.safeNow.map((r) => r.id)).toEqual(['safe']);
  });

  it('flags a food held three times in a row as stalled', () => {
    const g = groupLadder(rows, TODAY);
    expect([...g.stalledIds]).toEqual(['stuck']);
  });

  it('is driven only by the today argument', () => {
    const later = groupLadder(rows, '2026-08-20');
    // Everything dated on or before the 20th is now due.
    expect(later.dueToday.map((r) => r.id)).toEqual(
      expect.arrayContaining(['due-far', 'due-close', 'close', 'working', 'stuck'])
    );
    expect(later.closeToSafe).toEqual([]);
    expect(groupLadder(rows, TODAY)).toEqual(groupLadder(rows, TODAY));
  });

  it('summarizes the groups for the status line', () => {
    expect(summaryCounts(groupLadder(rows, TODAY))).toEqual({ due: 2, close: 1, onLadder: 8 });
  });
});

describe('selectNextStep', () => {
  it('prefers a stalled active row over one closer to safe', () => {
    const rows = [
      row('close', { currentRung: 'full_portion', consecutiveSuccesses: 1 }),
      row('stuck', { currentRung: 'touching', consecutiveHolds: STALLED_HOLDS }),
    ];
    const step = selectNextStep(rows, TODAY);
    expect(step?.row.id).toBe('stuck');
    expect(step?.reason).toBe('stalled');
    expect(step?.triesLeft).toBe(exposuresToSafe(rows[1]));
  });

  it('never calls a paused row stalled', () => {
    const rows = [row('p', { status: 'paused', consecutiveHolds: STALLED_HOLDS + 2 })];
    expect(selectNextStep(rows, TODAY)?.reason).toBe('resting');
  });

  it('picks the lowest exposuresToSafe even when that row is due today', () => {
    const rows = [
      row('notDue', { currentRung: 'full_portion', consecutiveSuccesses: 0 }),
      row('due', { currentRung: 'full_portion', consecutiveSuccesses: 1, nextDueOn: TODAY }),
      row('far', { nextDueOn: TODAY }),
    ];
    const step = selectNextStep(rows, TODAY);
    expect(step?.row.id).toBe('due');
    expect(step?.reason).toBe('close');
    expect(step?.triesLeft).toBe(1);
  });

  it('falls back to the longest-resting paused or backed-off row', () => {
    const rows = [
      row('work', { nextDueOn: '2026-09-01' }),
      row('later', { status: 'paused', nextDueOn: '2026-08-30' }),
      row('first', { status: 'backed_off', nextDueOn: '2026-08-12' }),
      row('safe', { status: 'mastered' }),
    ];
    const step = selectNextStep(rows, TODAY);
    expect(step?.row.id).toBe('first');
    expect(step?.reason).toBe('resting');
  });

  it('returns null when every row is mastered', () => {
    expect(selectNextStep([row('a', { status: 'mastered' }), row('b', { status: 'mastered' })], TODAY)).toBeNull();
    expect(selectNextStep([], TODAY)).toBeNull();
  });
});

describe('toOverviewRow', () => {
  it('defaults missing counters to 0 and builds an id from kid and food', () => {
    const out = toOverviewRow({ kid_id: 'k1', food_id: 'f1', status: 'active', current_rung: 'licking' });
    expect(out).toEqual({
      id: 'k1:f1',
      foodId: 'f1',
      currentRung: 'licking',
      consecutiveSuccesses: 0,
      consecutiveHolds: 0,
      status: 'active',
      nextDueOn: null,
    });
  });

  it('maps an unknown rung to the first rung and keeps a real id', () => {
    const out = toOverviewRow({
      id: 'r9',
      kid_id: 'k1',
      food_id: 'f1',
      status: 'active',
      current_rung: 'sniffing',
      consecutive_successes: null,
      consecutive_holds: 2,
      next_due_on: '2026-08-11',
    });
    expect(out.currentRung).toBe(RUNGS[0]);
    expect(out.id).toBe('r9');
    expect(out.consecutiveSuccesses).toBe(0);
    expect(out.consecutiveHolds).toBe(2);
    expect(out.nextDueOn).toBe('2026-08-11');
  });
});
