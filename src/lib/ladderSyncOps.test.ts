import { describe, it, expect } from 'vitest';
import {
  planAttemptReplay,
  attemptRowFromOp,
  isLadderAttemptOp,
  type LadderAttemptOp,
} from './ladderSyncOps';
import { RUNGS, ADVANCE_THRESHOLD, type LadderState } from './exposureLadder';

/**
 * US-609: what a queued exposure writes when it finally reaches the server.
 * The interesting cases are all about time passing between the log and the
 * replay -- another device moving the ladder, the same op replaying twice, the
 * food being removed entirely.
 */

const state = (over: Partial<LadderState> = {}): LadderState => ({
  currentRung: RUNGS[0],
  consecutiveSuccesses: 0,
  consecutiveHolds: 0,
  consecutiveRefusals: 0,
  status: 'active',
  nextDueOn: '2026-08-19',
  lastAttemptAt: null,
  pausedReason: null,
  ...over,
});

const op = (over: Partial<LadderAttemptOp> = {}): LadderAttemptOp => ({
  attemptId: '11111111-1111-4111-8111-111111111111',
  ladderRowId: 'ladder-1',
  kidId: 'kid-1',
  foodId: 'food-1',
  stage: RUNGS[0],
  outcome: 'success',
  attemptedAt: '2026-08-19T17:00:00.000Z',
  today: '2026-08-19',
  ...over,
});

describe('replay idempotency (US-609)', () => {
  it('writes nothing when the attempt id is already on the server', () => {
    expect(
      planAttemptReplay({ op: op(), serverState: state(), attemptExists: true }),
    ).toEqual({ action: 'skip', reason: 'already-applied' });
  });

  it('is the attempt id, not the payload, that makes it exactly-once', () => {
    // Same logical attempt replayed after a crash: identical id, so identical
    // verdict regardless of what the ladder has done since.
    const queued = op();
    const moved = state({ currentRung: RUNGS[2], consecutiveSuccesses: 1 });

    expect(planAttemptReplay({ op: queued, serverState: moved, attemptExists: true }))
      .toEqual({ action: 'skip', reason: 'already-applied' });
  });

  it('carries the client-generated id onto the row it inserts', () => {
    const row = attemptRowFromOp(op());

    expect(row.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(row.stage).toBe(RUNGS[0]);
    expect(row.attempted_at).toBe('2026-08-19T17:00:00.000Z');
  });

  it('records the rung that was offered, not the one the child ends on', () => {
    // stage is the rung asked for; the ladder may move past it on success.
    const row = attemptRowFromOp(op({ stage: RUNGS[1] }));
    expect(row.stage).toBe(RUNGS[1]);
  });
});

describe('conflict rule: server wins, local step re-applies (US-609)', () => {
  it('derives the next state from the server row, not from the offline one', () => {
    // Queued while the ladder sat at rung 0. By replay time the other parent
    // has moved it to rung 2. The step must land on top of rung 2.
    const server = state({ currentRung: RUNGS[2] });

    const plan = planAttemptReplay({ op: op(), serverState: server, attemptExists: false });

    expect(plan.action).toBe('apply');
    if (plan.action !== 'apply') return;
    // One success below the threshold holds the rung it found, and never
    // reverts to the rung captured offline.
    expect(plan.nextState.currentRung).toBe(RUNGS[2]);
    expect(plan.nextState.consecutiveSuccesses).toBe(1);
  });

  it('never resurrects a stale rung after the server advanced', () => {
    const server = state({ currentRung: RUNGS[3] });

    const plan = planAttemptReplay({
      op: op({ stage: RUNGS[0] }),
      serverState: server,
      attemptExists: false,
    });

    if (plan.action !== 'apply') throw new Error('expected apply');
    const stale = RUNGS.indexOf(RUNGS[0]);
    expect(RUNGS.indexOf(plan.nextState.currentRung)).toBeGreaterThan(stale);
  });

  it('advances from the server count, so a queued success cannot double-advance', () => {
    // Server already holds one success. This queued success is the second,
    // which is exactly the threshold: it should advance once, not twice.
    const server = state({ currentRung: RUNGS[0], consecutiveSuccesses: ADVANCE_THRESHOLD - 1 });

    const plan = planAttemptReplay({ op: op(), serverState: server, attemptExists: false });

    if (plan.action !== 'apply') throw new Error('expected apply');
    expect(plan.nextState.currentRung).toBe(RUNGS[1]);
    expect(plan.nextState.consecutiveSuccesses).toBe(0);
  });

  it('folds a refusal into the server counters rather than the offline ones', () => {
    // Offline the child had 0 refusals; the server has since recorded one.
    // The queued refusal is therefore the second, which auto-pauses (US-602).
    const server = state({ currentRung: RUNGS[2], consecutiveRefusals: 1 });

    const plan = planAttemptReplay({
      op: op({ outcome: 'refused' }),
      serverState: server,
      attemptExists: false,
    });

    if (plan.action !== 'apply') throw new Error('expected apply');
    expect(plan.nextState.consecutiveRefusals).toBe(2);
    expect(plan.nextState.status).toBe('paused');
  });

  it('stamps the attempt time, not the replay time', () => {
    const plan = planAttemptReplay({
      op: op({ attemptedAt: '2026-08-01T09:00:00.000Z' }),
      serverState: state(),
      attemptExists: false,
    });

    if (plan.action !== 'apply') throw new Error('expected apply');
    expect(plan.nextState.lastAttemptAt).toBe('2026-08-01T09:00:00.000Z');
  });

  it('drops the op when the food was removed from the ladder meanwhile', () => {
    expect(
      planAttemptReplay({ op: op(), serverState: null, attemptExists: false }),
    ).toEqual({ action: 'skip', reason: 'row-gone' });
  });
});

describe('queued payloads are validated before replay (US-609)', () => {
  it('accepts a well-formed op', () => {
    expect(isLadderAttemptOp(op())).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['an empty object', {}],
    ['a missing attemptId', { ...op(), attemptId: undefined }],
    ['an empty attemptId', { ...op(), attemptId: '' }],
    ['a missing ladderRowId', { ...op(), ladderRowId: undefined }],
    ['a numeric attemptedAt', { ...op(), attemptedAt: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(isLadderAttemptOp(value)).toBe(false);
  });
});
