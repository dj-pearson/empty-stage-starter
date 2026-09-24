import { describe, it, expect, vi } from 'vitest';
import {
  quickLogNeedsMealChoice,
  resolveQuickLogMealId,
  selectQuickLogEntry,
  performQuickLog,
  buildQuickLogMeals,
  slotForTime,
  mergeNote,
  buildUndoPatch,
  type QuickLogEntry,
} from './quickLog';
import type { PlanEntry } from '@/types';

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
    expect(outcome).toEqual({
      status: 'saved',
      entry: meal('a'),
      patch: { result: 'ate', notes: undefined },
    });
  });

  it('keeps the note already on the entry when none was typed', async () => {
    const save = vi.fn(ok);
    await performQuickLog({ meals: [meal('a', 'ate half')], result: 'tasted', save });

    expect(save).toHaveBeenCalledWith('a', { result: 'tasted', notes: 'ate half' });
  });

  it('adds a typed note to the shared one rather than wiping it', async () => {
    // plan_entries.notes is the household's note. Quick-logging "too tired"
    // used to replace a parent's earlier "rash on cheek?" outright.
    const save = vi.fn(ok);
    await performQuickLog({
      meals: [meal('a', 'ate half')],
      result: 'refused',
      notes: 'too tired',
      save,
    });

    expect(save).toHaveBeenCalledWith('a', { result: 'refused', notes: 'ate half\ntoo tired' });
  });

  it('does not write a note twice when the entry already says it', async () => {
    const save = vi.fn(ok);
    await performQuickLog({
      meals: [meal('a', 'Loved it!')],
      result: 'ate',
      notes: '  loved   IT! ',
      save,
    });

    expect(save).toHaveBeenCalledWith('a', { result: 'ate', notes: 'Loved it!' });
  });

  it('overwrites the note in replace mode', async () => {
    const save = vi.fn(ok);
    await performQuickLog({
      meals: [meal('a', 'ate half')],
      result: 'refused',
      notes: 'too tired',
      noteMode: 'replace',
      save,
    });

    expect(save).toHaveBeenCalledWith('a', { result: 'refused', notes: 'too tired' });
  });

  it('clears the amount when the caller passes null', async () => {
    const save = vi.fn(ok);
    await performQuickLog({
      meals: [{ ...meal('a'), amount_eaten: 'some' }],
      result: 'ate',
      amount: null,
      save,
    });

    expect(save).toHaveBeenCalledWith('a', { result: 'ate', notes: undefined, amount_eaten: null });
  });

  it('hands back the exact patch it sent', async () => {
    const save = vi.fn(ok);
    const outcome = await performQuickLog({
      meals: [{ ...meal('a', 'ate half'), amount_eaten: 'some' }],
      result: 'refused',
      notes: 'too tired',
      save,
    });

    expect(outcome.status).toBe('saved');
    if (outcome.status !== 'saved') return;
    expect(outcome.patch).toBe((save.mock.calls[0] as unknown[])[1]);
    expect(outcome.patch).toEqual({ result: 'refused', notes: 'ate half\ntoo tired', amount_eaten: null });
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

describe('mergeNote', () => {
  it('keeps the existing note when nothing was typed', () => {
    expect(mergeNote('rash on cheek?', undefined)).toBe('rash on cheek?');
    expect(mergeNote('rash on cheek?', '   ')).toBe('rash on cheek?');
    expect(mergeNote(null, undefined)).toBeUndefined();
  });

  it('uses the typed note when there was none', () => {
    expect(mergeNote('', ' too tired ')).toBe('too tired');
    expect(mergeNote(null, 'too tired')).toBe('too tired');
  });

  it('joins a different note on a new line', () => {
    expect(mergeNote(' rash on cheek? ', 'too tired')).toBe('rash on cheek?\ntoo tired');
  });

  it('skips a note already on one of the lines', () => {
    expect(mergeNote('rash on cheek?\nToo tired', 'too  tired')).toBe('rash on cheek?\nToo tired');
  });
});

describe('buildUndoPatch', () => {
  const before = { result: null, notes: 'rash on cheek?', amount_eaten: 'some' as const };

  it('restores only the keys the log touched', () => {
    expect(buildUndoPatch(before, { result: 'ate' })).toEqual({ result: null });
    expect(buildUndoPatch(before, { result: 'ate', notes: 'x', amount_eaten: null })).toEqual({
      result: null,
      notes: 'rash on cheek?',
      amount_eaten: 'some',
    });
  });

  it('puts back null, never an empty string, for an entry that had no note', () => {
    expect(buildUndoPatch({ ...before, notes: undefined }, { notes: 'x' })).toEqual({ notes: null });
    expect(buildUndoPatch({ ...before, notes: null }, { notes: 'x' })).toEqual({ notes: null });
    expect(buildUndoPatch({ ...before, notes: '' }, { notes: 'x' })).toEqual({ notes: null });
  });

  it('turns an unrecorded amount into null', () => {
    expect(buildUndoPatch({ ...before, amount_eaten: undefined }, { amount_eaten: 'a_lot' })).toEqual({
      amount_eaten: null,
    });
  });
});

describe('buildQuickLogMeals', () => {
  const TODAY = '2026-09-24';
  const kids = [
    { id: 'k1', name: 'Ada' },
    { id: 'k2', name: 'Ben' },
  ];
  const foods = [
    { id: 'pasta', name: 'Pasta' },
    { id: 'cheese', name: 'Cheese' },
    { id: 'oats', name: 'Oats' },
    { id: 'peas', name: 'Peas' },
  ];
  const recipes = [{ id: 'mac', name: 'Mac and cheese' }];
  const row = (over: Partial<PlanEntry> & Pick<PlanEntry, 'id' | 'kid_id' | 'meal_slot' | 'food_id'>): PlanEntry => ({
    date: TODAY,
    result: null,
    ...over,
  });
  const at = (h: number) => new Date(2026, 8, 24, h, 0, 0);

  const entries: PlanEntry[] = [
    row({ id: 'a-din-1', kid_id: 'k1', meal_slot: 'dinner', food_id: 'pasta', recipe_id: 'mac', is_primary_dish: false }),
    row({ id: 'a-din-2', kid_id: 'k1', meal_slot: 'dinner', food_id: 'cheese', recipe_id: 'mac', is_primary_dish: true }),
    row({ id: 'a-bfast', kid_id: 'k1', meal_slot: 'breakfast', food_id: 'oats' }),
    row({ id: 'b-din', kid_id: 'k2', meal_slot: 'dinner', food_id: 'peas' }),
    row({ id: 'b-yday', kid_id: 'k2', meal_slot: 'dinner', food_id: 'peas', date: '2026-09-23' }),
  ];

  it("lists every kid's entries in Family mode, named by kid", () => {
    const meals = buildQuickLogMeals(entries, kids, foods, recipes, null, TODAY, at(18));
    expect(meals.map((m) => m.label)).toEqual([
      'Ada \u00b7 breakfast \u00b7 Oats',
      'Ada \u00b7 dinner \u00b7 Mac and cheese',
      'Ben \u00b7 dinner \u00b7 Peas',
    ]);
  });

  it('lists only the selected kid, without a name, when one is active', () => {
    const meals = buildQuickLogMeals(entries, kids, foods, recipes, 'k2', TODAY, at(18));
    expect(meals.map((m) => m.label)).toEqual(['dinner \u00b7 Peas']);
  });

  it('lists a recipe once, on its primary row', () => {
    const meals = buildQuickLogMeals(entries, kids, foods, recipes, 'k1', TODAY, at(18));
    const dinner = meals.filter((m) => m.slot === 'dinner');
    expect(dinner).toHaveLength(1);
    expect(dinner[0].id).toBe('a-din-2');
  });

  it('preselects dinner at 18:00', () => {
    const meals = buildQuickLogMeals(entries, kids, foods, recipes, null, TODAY, at(18));
    const picked = meals.filter((m) => m.preselected);
    expect(picked).toHaveLength(1);
    expect(picked[0].slot).toBe('dinner');
  });

  it('preselects breakfast in the morning', () => {
    const meals = buildQuickLogMeals(entries, kids, foods, recipes, null, TODAY, at(7));
    expect(meals.find((m) => m.preselected)?.id).toBe('a-bfast');
  });

  it('skips an already-logged row when preselecting', () => {
    const logged = entries.map((e) => (e.id === 'a-din-2' ? { ...e, result: 'ate' as const } : e));
    const meals = buildQuickLogMeals(logged, kids, foods, recipes, null, TODAY, at(19));
    expect(meals.find((m) => m.preselected)?.id).toBe('b-din');
  });

  it('uses the slot label the caller passes', () => {
    const meals = buildQuickLogMeals(entries, kids, foods, recipes, 'k2', TODAY, at(18), (s) => s.toUpperCase());
    expect(meals[0].label).toBe('DINNER \u00b7 Peas');
  });

  it('gives an empty list for an empty plan', () => {
    expect(buildQuickLogMeals([], kids, foods, recipes, null, TODAY, at(18))).toEqual([]);
  });

  it('switches to dinner at 16:00', () => {
    expect(slotForTime(at(15))).toBe('snack2');
    expect(slotForTime(at(16))).toBe('dinner');
  });
});
