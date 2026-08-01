/**
 * US-600: one-tap rung logging.
 *
 * Two things are pinned here. First the write contract — what a single tap at
 * the dinner table turns into: an attempt at the rung the child was *asked
 * for*, a plan-entry result, and the new ladder state. Second the rollback:
 * a failed persist must leave the parent looking at the rung that is really
 * stored, not an optimistic one that never landed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertSingle = vi.fn();
const ladderUpdateEq = vi.fn();
const planUpdateEq = vi.fn();
const selectEq = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'food_attempts') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single: insertSingle }),
          }),
          select: vi.fn().mockReturnValue({ eq: selectEq }),
        };
      }
      if (table === 'plan_entries') {
        return { update: vi.fn().mockReturnValue({ eq: planUpdateEq }) };
      }
      return {
        select: vi.fn().mockReturnValue({ eq: selectEq }),
        update: vi.fn().mockReturnValue({ eq: ladderUpdateEq }),
      };
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import {
  buildQuickLogWrites,
  normalizeLadderRow,
  useFoodLadder,
  type LadderRow,
} from './useFoodLadder';

const NOW = '2026-08-01T18:30:00.000Z';
const TODAY = '2026-08-01';

const row: LadderRow = {
  id: 'ladder-1',
  kidId: 'kid-1',
  foodId: 'food-1',
  currentRung: 'licking',
  consecutiveSuccesses: 0,
  consecutiveHolds: 0,
  consecutiveRefusals: 0,
  status: 'active',
  nextDueOn: TODAY,
  lastAttemptAt: null,
  pairedSafeFoodId: 'safe-1',
  preferredPrep: 'steamed',
  preferredMealSlot: 'dinner',
  pausedReason: null,
};

describe('buildQuickLogWrites', () => {
  it('maps each tap to the right attempt outcome and plan result', () => {
    expect(buildQuickLogWrites({ row, result: 'accepted', now: NOW, today: TODAY })).toMatchObject({
      attemptRow: { outcome: 'success' },
      planPatch: { result: 'ate' },
    });
    expect(buildQuickLogWrites({ row, result: 'held', now: NOW, today: TODAY })).toMatchObject({
      attemptRow: { outcome: 'partial' },
      planPatch: { result: 'tasted' },
    });
    expect(buildQuickLogWrites({ row, result: 'refused', now: NOW, today: TODAY })).toMatchObject({
      attemptRow: { outcome: 'refused' },
      planPatch: { result: 'refused' },
    });
  });

  it('records the attempt at the rung the child was asked for, not the new one', () => {
    const writes = buildQuickLogWrites({ row, result: 'refused', now: NOW, today: TODAY });

    // Asked for a lick, refused, so the ladder drops to smelling — but the
    // attempt is still the record of a licking exposure having been offered.
    expect(writes.attemptRow.stage).toBe('licking');
    expect(writes.nextState.currentRung).toBe('smelling');
  });

  it('carries the learned prep and slot onto the attempt', () => {
    const writes = buildQuickLogWrites({ row, result: 'accepted', now: NOW, today: TODAY });
    expect(writes.attemptRow.preparation_method).toBe('steamed');
    expect(writes.attemptRow.meal_slot).toBe('dinner');
  });

  it('prefers an explicitly supplied meal slot over the learned one', () => {
    const writes = buildQuickLogWrites({
      row,
      result: 'accepted',
      now: NOW,
      today: TODAY,
      mealSlot: 'lunch',
    });
    expect(writes.attemptRow.meal_slot).toBe('lunch');
  });

  it('produces a ladder update that matches the derived next state', () => {
    const writes = buildQuickLogWrites({ row, result: 'accepted', now: NOW, today: TODAY });
    expect(writes.ladderUpdate).toMatchObject({
      current_rung: writes.nextState.currentRung,
      consecutive_successes: writes.nextState.consecutiveSuccesses,
      status: writes.nextState.status,
      next_due_on: writes.nextState.nextDueOn,
    });
  });
});

describe('normalizeLadderRow', () => {
  it('maps snake_case columns to the camelCase UI shape', () => {
    const normalized = normalizeLadderRow({
      id: 'l1',
      kid_id: 'k1',
      food_id: 'f1',
      current_rung: 'small_bite',
      consecutive_successes: 1,
      consecutive_holds: 2,
      consecutive_refusals: 0,
      status: 'active',
      next_due_on: '2026-08-03',
      last_attempt_at: NOW,
      paired_safe_food_id: 's1',
      preferred_prep: 'raw',
      preferred_meal_slot: 'lunch',
      paused_reason: null,
    });

    expect(normalized).toMatchObject({
      kidId: 'k1',
      foodId: 'f1',
      currentRung: 'small_bite',
      consecutiveHolds: 2,
      pairedSafeFoodId: 's1',
      preferredMealSlot: 'lunch',
    });
  });

  it('falls back to the first rung for a stage label it does not recognize', () => {
    const normalized = normalizeLadderRow({
      id: 'l1',
      kid_id: 'k1',
      food_id: 'f1',
      current_rung: 'gnawed_thoughtfully',
      consecutive_successes: 0,
      consecutive_holds: 0,
      consecutive_refusals: 0,
      status: 'active',
      next_due_on: null,
      last_attempt_at: null,
      paired_safe_food_id: null,
      preferred_prep: null,
      preferred_meal_slot: null,
      paused_reason: null,
    });
    expect(normalized.currentRung).toBe('looking');
  });
});

describe('useFoodLadder.quickLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectEq.mockResolvedValue({
      data: [
        {
          id: 'ladder-1',
          kid_id: 'kid-1',
          food_id: 'food-1',
          current_rung: 'licking',
          consecutive_successes: 0,
          consecutive_holds: 0,
          consecutive_refusals: 0,
          status: 'active',
          next_due_on: TODAY,
          last_attempt_at: null,
          paired_safe_food_id: 'safe-1',
          preferred_prep: 'steamed',
          preferred_meal_slot: 'dinner',
          paused_reason: null,
        },
      ],
      error: null,
    });
    insertSingle.mockResolvedValue({ data: { id: 'attempt-1' }, error: null });
    ladderUpdateEq.mockResolvedValue({ error: null });
    planUpdateEq.mockResolvedValue({ error: null });
  });

  async function mounted() {
    const hook = renderHook(() => useFoodLadder('kid-1'));
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
    return hook;
  }

  it('advances the ladder in place on a successful log', async () => {
    const { result } = await mounted();

    await act(async () => {
      const ok = await result.current.quickLog({ row: result.current.rows[0], result: 'accepted' });
      expect(ok).toBe(true);
    });

    expect(result.current.rows[0].consecutiveSuccesses).toBe(1);
    expect(result.current.rows[0].currentRung).toBe('licking');
  });

  it('restores the prior ladder state when the ladder write fails', async () => {
    const { result } = await mounted();
    const before = result.current.rows[0];
    ladderUpdateEq.mockResolvedValue({ error: { message: 'network down' } });

    await act(async () => {
      const ok = await result.current.quickLog({ row: before, result: 'refused' });
      expect(ok).toBe(false);
    });

    // Non-destructive rollback: the row is restored, not dropped.
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toEqual(before);
  });

  it('restores the prior state when the attempt insert itself fails', async () => {
    const { result } = await mounted();
    const before = result.current.rows[0];
    insertSingle.mockResolvedValue({ data: null, error: { message: 'rls denied' } });

    await act(async () => {
      const ok = await result.current.quickLog({ row: before, result: 'accepted' });
      expect(ok).toBe(false);
    });

    expect(result.current.rows[0]).toEqual(before);
  });

  it('keeps the log when only the plan-entry back-link fails', async () => {
    const { result } = await mounted();
    planUpdateEq.mockResolvedValue({ error: { message: 'plan entry vanished' } });

    await act(async () => {
      const ok = await result.current.quickLog({
        row: result.current.rows[0],
        result: 'accepted',
        planEntryId: 'plan-1',
      });
      // The attempt and the ladder are both correct; only the back-reference
      // is missing, which is not worth throwing away a parent's log for.
      expect(ok).toBe(true);
    });

    expect(result.current.rows[0].consecutiveSuccesses).toBe(1);
  });

  it('groups rows by status for the board', async () => {
    const { result } = await mounted();
    expect(result.current.grouped.active).toHaveLength(1);
    expect(result.current.grouped.mastered).toHaveLength(0);
  });
});
