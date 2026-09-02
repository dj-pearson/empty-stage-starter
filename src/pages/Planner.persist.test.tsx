import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import React from 'react';

/**
 * US-715: a generated week has to be saved.
 *
 * Quick Build and AI Generate Week both ended in setPlanEntries, which is local
 * state only: nothing was inserted, the week was gone on reload and never
 * reached a partner's device, and the wholesale replace wiped every other kid
 * and every other week. This asserts the page now goes through
 * deleteWeekPlan + addPlanEntries, scoped to the kid and the week in view.
 */

const addPlanEntries = vi.fn().mockResolvedValue(undefined);
const deleteWeekPlan = vi.fn().mockResolvedValue(undefined);
const setPlanEntries = vi.fn();
const invokeEdgeFunction = vi.fn();

const KID = { id: 'kid-1', name: 'Robin', birth_date: '2020-01-01' };
const OTHER_KID_ENTRY = {
  id: 'other',
  kid_id: 'kid-2',
  date: '2026-09-08',
  meal_slot: 'lunch',
  food_id: 'safe1',
  result: null,
};

const FOODS = [
  { id: 'safe1', name: 'Rice', category: 'grain', unit: 'servings', is_safe: true, is_try_bite: false },
  { id: 'safe2', name: 'Peas', category: 'vegetable', unit: 'servings', is_safe: true, is_try_bite: false },
  { id: 'try1', name: 'Olive', category: 'vegetable', unit: 'servings', is_safe: false, is_try_bite: true },
];

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: FOODS }),
  useGrocery: () => ({ addGroceryItemsMerged: vi.fn() }),
  useKids: () => ({ kids: [KID], activeKidId: 'kid-1', setActiveKidId: vi.fn() }),
  useRecipes: () => ({ recipes: [] }),
  usePlan: () => ({
    planEntries: [OTHER_KID_ENTRY],
    setPlanEntries,
    updatePlanEntry: vi.fn(),
    addPlanEntry: vi.fn(),
    addPlanEntries,
    copyWeekPlan: vi.fn(),
    deleteWeekPlan,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}));
vi.mock('@/lib/edge-functions', () => ({
  invokeEdgeFunction: (...a: unknown[]) => invokeEdgeFunction(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('@/components/FoodSelectorDialog', () => ({ FoodSelectorDialog: () => <div /> }));
vi.mock('@/components/DetailedTrackingDialog', () => ({ DetailedTrackingDialog: () => <div /> }));
vi.mock('@/components/meal-planner/MobileMealPlanner', () => ({ MobileMealPlanner: () => <div /> }));
vi.mock('@/components/SwapMealDialog', () => ({ SwapMealDialog: () => <div /> }));
vi.mock('@/components/MissingIngredientsDialog', () => ({ MissingIngredientsDialog: () => <div /> }));
vi.mock('@/components/VarietyFatigueBanner', () => ({ VarietyFatigueBanner: () => <div /> }));

import Planner from './Planner';

const renderPlanner = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <Planner />
      </MemoryRouter>
    </HelmetProvider>,
  );

/** The Sunday of the current week, which is what the page opens on. */
const thisWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('Planner generation persists (US-715)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Quick Build saves through addPlanEntries and never through setPlanEntries', async () => {
    const user = userEvent.setup();
    renderPlanner();

    const button = await screen.findByRole('button', { name: /build week|quick build/i });
    await user.click(button);

    await waitFor(() => expect(addPlanEntries).toHaveBeenCalled());
    expect(setPlanEntries).not.toHaveBeenCalled();
  });

  it('Quick Build clears only this kid and only the week in view', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.click(await screen.findByRole('button', { name: /build week|quick build/i }));

    await waitFor(() => expect(deleteWeekPlan).toHaveBeenCalled());
    expect(deleteWeekPlan).toHaveBeenCalledWith(thisWeekStart(), 'kid-1');
  });

  it('Quick Build sends entries for this kid and this week only', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.click(await screen.findByRole('button', { name: /build week|quick build/i }));
    await waitFor(() => expect(addPlanEntries).toHaveBeenCalled());

    const entries = addPlanEntries.mock.calls[0][0] as Array<{ kid_id: string; date: string }>;
    expect(entries.length).toBeGreaterThan(0);
    expect([...new Set(entries.map((e) => e.kid_id))]).toEqual(['kid-1']);

    const start = thisWeekStart();
    const end = new Date(`${start}T00:00:00`);
    end.setDate(end.getDate() + 6);
    const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    for (const e of entries) {
      expect(e.date >= start && e.date <= endKey).toBe(true);
    }
    // The other kid's entry is never handed back for re-insertion.
    expect(entries.some((e) => e.kid_id === 'kid-2')).toBe(false);
  });

  it('AI Generate Week sends the week in view as startDate', async () => {
    invokeEdgeFunction.mockResolvedValue({
      data: { plan: [{ date: thisWeekStart(), meals: { lunch: 'safe1' } }] },
      error: null,
    });
    const user = userEvent.setup();
    renderPlanner();

    const aiButton = await screen.findByRole('button', { name: /ai generate|generate week/i });
    await user.click(aiButton);

    await waitFor(() => expect(invokeEdgeFunction).toHaveBeenCalled());
    const [fn, opts] = invokeEdgeFunction.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fn).toBe('ai-meal-plan');
    expect(opts.body.startDate).toBe(thisWeekStart());
  });

  it('AI Generate Week persists and never calls setPlanEntries', async () => {
    invokeEdgeFunction.mockResolvedValue({
      data: { plan: [{ date: thisWeekStart(), meals: { lunch: 'safe1' } }] },
      error: null,
    });
    const user = userEvent.setup();
    renderPlanner();

    await user.click(await screen.findByRole('button', { name: /ai generate|generate week/i }));

    await waitFor(() => expect(addPlanEntries).toHaveBeenCalled());
    expect(setPlanEntries).not.toHaveBeenCalled();
    const entries = addPlanEntries.mock.calls[0][0] as Array<Record<string, unknown>>;
    for (const e of entries) expect(e).not.toHaveProperty('id');
  });
});
