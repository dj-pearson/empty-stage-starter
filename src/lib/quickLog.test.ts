import { describe, it, expect, vi } from 'vitest';
import {
  quickLogNeedsMealChoice,
  resolveQuickLogMealId,
  selectQuickLogEntry,
  performQuickLog,
  type QuickLogEntry,
} from './quickLog';

/**
 * The quick-log path has to know which meal it is logging, and whether the
 * write landed (US-812).
 *
 * The floating "Log Meal Result" action opens the modal from every dashboard
 * page with no meal in context, and the handler behind it did nothing but fire
 * a success toast. So the most reachable way to record a result was the only
 * one that discarded it, while telling the user it had been saved.
 *
 * These are the decisions, render-free. The modal's own behaviour is pinned by
 * rendering it, in src/components/QuickLogModal.test.tsx.
 */

const meal = (id: string, notes?: string): QuickLogEntry => ({
  id,
  label: `meal ${id}`,
  notes,
});

describe('quickLogNeedsMealChoice', () => {
  it('asks nothing when the caller already knows the meal', () => {
    // The Home page opens this from a specific meal row.
    expect(quickLogNeedsMealChoice(undefined)).toBe(false);
  });

  it('does not ask a question with a single answer', () => {
    expect(quickLogNeedsMealChoice([meal('a')])).toBe(false);
  });

  it('asks once there is a genuine choice', () => {
    expect(quickLogNeedsMealChoice([meal('a'), meal('b')])).toBe(true);
  });

  it('does not ask when there is nothing planned', () => {
    // Zero meals is the caller's problem to report, not a picker with no rows.
    expect(quickLogNeedsMealChoice([])).toBe(false);
  });
});

describe('resolveQuickLogMealId', () => {
  it('resolves to nothing when the caller passed no meals', () => {
    expect(resolveQuickLogMealId(undefined, null)).toBeUndefined();
  });

  it('uses the only meal without making the user pick it', () => {
    expect(resolveQuickLogMealId([meal('a')], null)).toBe('a');
  });

  it('withholds a target until the user chooses between several', () => {
    // This is what stops a result landing on whichever meal happened to be
    // first in the list.
    expect(resolveQuickLogMealId([meal('a'), meal('b')], null)).toBeUndefined();
  });

  it('uses the chosen meal, not the first one', () => {
    expect(resolveQuickLogMealId([meal('a'), meal('b')], 'b')).toBe('b');
  });
});

describe('selectQuickLogEntry', () => {
  it('takes the first meal when the caller named none', () => {
    expect(selectQuickLogEntry([meal('a'), meal('b')])?.id).toBe('a');
  });

  it('takes the named meal', () => {
    expect(selectQuickLogEntry([meal('a'), meal('b')], 'b')?.id).toBe('b');
  });

  it('finds nothing when a named meal has gone', () => {
    // NOT todaysMeals[0]. A stale modal naming a deleted entry would otherwise
    // log tonight's refusal against this morning's breakfast.
    expect(selectQuickLogEntry([meal('a'), meal('b')], 'gone')).toBeUndefined();
  });
});

describe('performQuickLog', () => {
  const ok = () => ({ error: null });

  it('writes the result against the only planned meal', async () => {
    const save = vi.fn(ok);
    const outcome = await performQuickLog({
      meals: [meal('a')],
      result: 'ate',
      save,
    });

    expect(save).toHaveBeenCalledWith('a', { result: 'ate', notes: undefined });
    expect(outcome).toEqual({ status: 'saved', entry: meal('a') });
  });

  it('keeps the note already on the entry when none was typed', async () => {
    const save = vi.fn(ok);
    await performQuickLog({ meals: [meal('a', 'ate half')], result: 'tasted', save });

    expect(save).toHaveBeenCalledWith('a', { result: 'tasted', notes: 'ate half' });
  });

  it('writes the typed note over the old one', async () => {
    const save = vi.fn(ok);
    await performQuickLog({
      meals: [meal('a', 'ate half')],
      result: 'refused',
      notes: 'too tired',
      save,
    });

    expect(save).toHaveBeenCalledWith('a', { result: 'refused', notes: 'too tired' });
  });

  it('saves how much was eaten when one was picked', async () => {
    const save = vi.fn(ok);
    await performQuickLog({ meals: [meal('a')], result: 'ate', amount: 'nibbles', save });

    expect(save).toHaveBeenCalledWith('a', {
      result: 'ate',
      notes: undefined,
      amount_eaten: 'nibbles',
    });
  });

  it('clears a recorded amount when the meal is re-logged as refused', async () => {
    const save = vi.fn(ok);
    await performQuickLog({
      meals: [{ ...meal('a'), amount_eaten: 'some' }],
      result: 'refused',
      amount: 'a_lot',
      save,
    });

    expect(save).toHaveBeenCalledWith('a', {
      result: 'refused',
      notes: undefined,
      amount_eaten: null,
    });
  });

  it('says nothing is planned, and writes nothing', async () => {
    const save = vi.fn(ok);
    const outcome = await performQuickLog({ meals: [], result: 'ate', save });

    expect(save).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'nothing-planned' });
  });

  it('refuses a named meal that is no longer planned', async () => {
    const save = vi.fn(ok);
    const outcome = await performQuickLog({
      meals: [meal('a'), meal('b')],
      result: 'ate',
      mealId: 'deleted',
      save,
    });

    // The distinction matters: the user DID plan something, so "nothing
    // planned for today" would be a lie, and meal 'a' would be the wrong meal.
    expect(save).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'unknown-meal', mealId: 'deleted' });
  });

  it('reports a write the server rejected instead of a success', async () => {
    const error = { message: 'row level security' };
    const outcome = await performQuickLog({
      meals: [meal('a')],
      result: 'ate',
      save: () => ({ error }),
    });

    expect(outcome).toEqual({ status: 'failed', entry: meal('a'), error });
  });

  it('reports a save that throws rather than reading it as saved', async () => {
    const outcome = await performQuickLog({
      meals: [meal('a')],
      result: 'ate',
      save: () => {
        throw new Error('offline');
      },
    });

    expect(outcome.status).toBe('failed');
  });
});
