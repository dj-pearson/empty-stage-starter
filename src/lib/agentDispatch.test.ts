import { describe, it, expect } from 'vitest';

/**
 * US-478: unit tests for the dispatcher's per-agent skip/invoke decision.
 * Pure logic shared with the Deno edge function (see agentSchedule.test.ts).
 */
import { decideDispatch, type DispatchState } from '../../supabase/functions/_shared/dispatch';

const now = new Date('2026-07-09T10:05:00Z');

// A baseline agent that WOULD be invoked (due, enabled, under cap, idle).
const base: DispatchState = {
  enabled: true,
  scheduleCron: '*/5 * * * *',
  lastRunAt: '2026-07-09T10:00:00Z',
  isRunning: false,
  globalPause: false,
  todaySpendUsd: 0,
  dailyCapUsd: 5,
};

describe('decideDispatch', () => {
  it('invokes a due, enabled, idle, under-cap agent', () => {
    expect(decideDispatch(base, now)).toEqual({ invoke: true });
  });

  it('skips a disabled agent', () => {
    expect(decideDispatch({ ...base, enabled: false }, now)).toEqual({
      invoke: false,
      reason: 'disabled',
    });
  });

  it('skips all agents under the global kill switch', () => {
    expect(decideDispatch({ ...base, globalPause: true }, now)).toEqual({
      invoke: false,
      reason: 'global_pause',
    });
  });

  it('skips an agent at or over its daily cost cap', () => {
    expect(decideDispatch({ ...base, todaySpendUsd: 5, dailyCapUsd: 5 }, now)).toEqual({
      invoke: false,
      reason: 'cost_cap',
    });
    expect(decideDispatch({ ...base, todaySpendUsd: 6, dailyCapUsd: 5 }, now)).toEqual({
      invoke: false,
      reason: 'cost_cap',
    });
  });

  it('skips a not-yet-due agent', () => {
    // Already ran at the most recent fire time → not due.
    expect(decideDispatch({ ...base, lastRunAt: '2026-07-09T10:05:00Z' }, now)).toEqual({
      invoke: false,
      reason: 'not_due',
    });
  });

  it('does not double-invoke an already-running agent (idempotency)', () => {
    expect(decideDispatch({ ...base, isRunning: true }, now)).toEqual({
      invoke: false,
      reason: 'already_running',
    });
  });

  it('gate precedence: disabled beats every other skip reason', () => {
    const worst: DispatchState = {
      ...base,
      enabled: false,
      globalPause: true,
      isRunning: true,
      todaySpendUsd: 999,
    };
    expect(decideDispatch(worst, now)).toEqual({ invoke: false, reason: 'disabled' });
  });

  it('treats a null cap as unlimited spend', () => {
    expect(
      decideDispatch({ ...base, todaySpendUsd: 1000, dailyCapUsd: null }, now),
    ).toEqual({ invoke: true });
  });
});
