import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { quickLogNeedsMealChoice, resolveQuickLogMealId } from '@/lib/quickLog';

/**
 * The quick-log path has to know which meal it is logging (US-812).
 *
 * The floating "Log Meal Result" action opens this modal from every dashboard
 * page with no meal in context, and the handler behind it did nothing but fire
 * a success toast. So the most reachable way to record a result was the only
 * one that discarded it, while telling the user it had been saved.
 *
 * These assertions are deliberately render-free. Component tests that mount
 * React currently die on "Cannot read properties of null (reading 'useState')"
 * across this whole repo -- two physical React copies, node_modules/react and
 * the nested one under node_modules/.deno/react-dom@19.1.0/node_modules --
 * which is US-813 and not something to fix from inside a UX change. The
 * decision the picker encodes is pulled out into two pure functions so it can
 * be pinned properly rather than pinned by proxy.
 */

const meal = (id: string) => ({ id, label: `meal ${id}` });

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

describe('the modal disables logging until the question is answered', () => {
  const modal = readFileSync(
    path.join(process.cwd(), 'src', 'components', 'QuickLogModal.tsx'),
    'utf8'
  );

  it('gates the result buttons on the meal choice', () => {
    expect(modal).toContain('disabled={isLoading || awaitingMealChoice}');
  });

  it('refuses to fire onLog while awaiting a choice', () => {
    expect(modal).toContain('if (awaitingMealChoice) return;');
  });

  it('passes the resolved meal id to the caller', () => {
    expect(modal).toContain('onLog(result, notes || undefined, resolvedMealId ?? undefined)');
  });
});

describe('the dashboard handler writes instead of pretending', () => {
  const dashboard = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'Dashboard.tsx'),
    'utf8'
  );

  it('persists through updatePlanEntry', () => {
    expect(dashboard).toContain('updatePlanEntry(entry.id, { result, notes:');
  });

  it('reports a failed write rather than a success', () => {
    expect(dashboard).toContain("Couldn't log that meal");
  });

  it('says so when there is nothing to log against', () => {
    expect(dashboard).toContain('Nothing planned for today');
  });

  it('hands the modal today\'s meals so the picker has rows', () => {
    expect(dashboard).toContain('meals={todaysMeals}');
  });

  it('never falls back to the first meal when a specific one was named', () => {
    // `find(...) ?? todaysMeals[0]` would log against the wrong dinner whenever
    // the named entry had gone (deleted, or a stale modal).
    expect(dashboard).toContain(
      'mealId ? todaysMeals.find((meal) => meal.id === mealId) : todaysMeals[0]'
    );
  });
});
