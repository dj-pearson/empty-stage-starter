import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@/i18n';
import type { MealSlot, PlanEntry } from '@/types';

/**
 * US-715: a generated week has to be saved, and saved without destroying what
 * was there. Quick Build and AI Generate go through replaceWeekPlan, scoped to
 * the kid and the week in view; a success toast only fires when the server
 * actually took the write; destructive actions confirm and offer Undo.
 */

// ---- Mocked plan context (most tests) --------------------------------------
const replaceWeekPlan = vi.fn();
const addPlanEntries = vi.fn();
const addPlanEntry = vi.fn();
const deleteWeekPlan = vi.fn();
const deletePlanEntries = vi.fn();
const setPlanEntries = vi.fn();
const invokeEdgeFunction = vi.fn();

const KID = { id: 'kid-1', name: 'Robin', date_of_birth: '2020-01-01', allergens: ['peanuts'], notes: 'secret' };

/** The Monday of the current week (item 3's default), which is what the page opens on. */
const thisWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const OTHER_KID_ENTRY: PlanEntry = {
  id: 'other', kid_id: 'kid-2', date: thisWeekStart(), meal_slot: 'lunch', food_id: 'safe1', result: null,
};

const FOODS = [
  { id: 'safe1', name: 'Rice', category: 'carb', unit: 'servings', is_safe: true, is_try_bite: false, quantity: 3 },
  { id: 'safe2', name: 'Peas', category: 'vegetable', unit: 'servings', is_safe: true, is_try_bite: false, quantity: 3 },
  { id: 'try1', name: 'Olive', category: 'vegetable', unit: 'servings', is_safe: false, is_try_bite: true, quantity: 3 },
  { id: 'nut1', name: 'Peanut butter', category: 'protein', unit: 'jar', is_safe: true, is_try_bite: false, allergens: ['Peanuts'] },
];

const state: { entries: PlanEntry[]; realPlan: boolean } = { entries: [OTHER_KID_ENTRY], realPlan: false };

const mockPlan = () => ({
  planEntries: state.entries,
  setPlanEntries,
  updatePlanEntry: vi.fn().mockResolvedValue({ error: null }),
  addPlanEntry,
  addPlanEntries,
  copyWeekPlan: vi.fn().mockResolvedValue({ error: null, copied: 0, skipped: 0, insertedIds: [] }),
  deleteWeekPlan,
  deletePlanEntries,
  movePlanEntries: vi.fn().mockResolvedValue({ error: null }),
  replaceSlot: vi.fn().mockResolvedValue({ error: null }),
  replaceWeekPlan,
  scheduleRecipe: vi.fn().mockResolvedValue({ error: null, succeeded: [], failed: [] }),
});

vi.mock('@/contexts/AppContext', async () => {
  const real = await vi.importActual<typeof import('@/contexts/PlanContext')>('@/contexts/PlanContext');
  return {
    useFoods: () => ({ foods: FOODS, updateFood: vi.fn() }),
    useGrocery: () => ({ addGroceryItemsMerged: vi.fn(), deleteGroceryItems: vi.fn() }),
    useKids: () => ({ kids: [KID], activeKidId: 'kid-1', setActiveKid: vi.fn() }),
    useRecipes: () => ({ recipes: [] }),
    usePlan: () => (state.realPlan ? real.usePlan() : mockPlan()),
  };
});

const auth: { userId: string | null; householdId: string | null } = { userId: null, householdId: null };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

// ---- Supabase: only the real-context tests reach it -------------------------
const server = {
  insertError: null as unknown,
  deleteErrors: [] as unknown[],
  inserted: [] as Array<Record<string, unknown>>,
  deleted: [] as string[][],
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: (table: string) => {
      if (table !== 'plan_entries') {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order']) chain[m] = () => chain;
        chain.limit = () => Promise.resolve({ data: [], error: null });
        return chain;
      }
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          const start = server.inserted.length;
          server.inserted.push(...rows);
          const data = server.insertError ? null : rows.map((r, i) => ({ ...r, id: `srv-${start + i}` }));
          return { select: () => Promise.resolve({ data, error: server.insertError }) };
        },
        delete: () => ({
          in: (_c: string, ids: string[]) => {
            server.deleted.push(ids);
            return Promise.resolve({ error: server.deleteErrors.shift() ?? null });
          },
        }),
      };
    },
  },
}));
vi.mock('@/lib/supabaseAuthError', () => ({
  isSupabaseAuthError: () => false,
  handleSupabaseAuthError: vi.fn().mockResolvedValue('not-auth-error'),
}));
vi.mock('@/lib/trackActivation', () => ({ trackActivationOnce: vi.fn() }));
vi.mock('@/hooks/useRealtimeSubscription', () => ({ registerSubscription: vi.fn(), unregisterSubscription: vi.fn() }));
vi.mock('@/lib/edge-functions', () => ({
  invokeEdgeFunction: (...a: unknown[]) => invokeEdgeFunction(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
const GROCERY = { preview: () => ({ toAdd: 0, alreadyHave: 0, onList: 0 }), push: vi.fn() };
vi.mock('@/hooks/usePlanToGrocery', () => ({ usePlanToGrocery: () => GROCERY }));
vi.mock('@/components/FoodSelectorDialog', () => ({ FoodSelectorDialog: () => <div /> }));
vi.mock('@/components/meal-planner/MobileMealPlanner', () => ({ MobileMealPlanner: () => <div /> }));
vi.mock('@/components/meal-planner/PlannerTemplatesController', () => ({ PlannerTemplatesController: () => null }));
vi.mock('@/components/MissingIngredientsDialog', () => ({ MissingIngredientsDialog: () => <div /> }));
vi.mock('@/components/VarietyFatigueBanner', () => ({ VarietyFatigueBanner: () => <div /> }));

const syncLadderAfterPlanResult = vi.fn().mockResolvedValue([]);
vi.mock('@/hooks/useFoodLadder', () => ({ syncLadderAfterPlanResult }));

interface GridStubProps {
  kidId: string;
  onMarkResult?: (entry: PlanEntry, result: 'ate' | 'tasted' | 'refused', attemptId?: string) => void;
  onClearWeek?: (kidId: string) => void;
  onAddEntry?: (date: string, slot: MealSlot, foodId: string) => void;
}
vi.mock('@/components/GSAPCalendarMealPlanner', () => ({
  GSAPCalendarMealPlanner: (p: GridStubProps) => (
    <div>
      <button onClick={() => p.onClearWeek?.(p.kidId)}>grid-clear</button>
      <button onClick={() => p.onAddEntry?.(thisWeekStart(), 'lunch', 'nut1')}>grid-add-nut</button>
      <button onClick={() => p.onMarkResult?.(OTHER_KID_ENTRY, 'ate')}>grid-mark-ate</button>
      <button onClick={() => p.onMarkResult?.(OTHER_KID_ENTRY, 'ate', 'attempt-1')}>grid-mark-ladder</button>
    </div>
  ),
}));

import Planner from './Planner';
import { PlanProvider, usePlan } from '@/contexts/PlanContext';

const renderPlanner = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <Planner />
      </MemoryRouter>
    </HelmetProvider>,
  );

const QUICK_BUILD = /quick build/i;
const AI_GENERATE = /ai generate week/i;

beforeEach(() => {
  vi.clearAllMocks();
  state.entries = [OTHER_KID_ENTRY];
  state.realPlan = false;
  replaceWeekPlan.mockResolvedValue({ error: null, removed: [], insertedIds: ['n1'] });
  addPlanEntries.mockResolvedValue({ error: null, insertedIds: [] });
  addPlanEntry.mockResolvedValue({ error: null, insertedIds: ['n1'] });
  deletePlanEntries.mockResolvedValue({ error: null, removed: [] });
});

describe('planner result marks move the ladder (item 41)', () => {
  it('a NULL -> result mark syncs the ladder once; a ladder-logged mark does not', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: 'grid-mark-ate' }));
    await waitFor(() => expect(syncLadderAfterPlanResult).toHaveBeenCalledTimes(1));
    expect(syncLadderAfterPlanResult).toHaveBeenCalledWith('other');

    await user.click(screen.getByRole('button', { name: 'grid-mark-ladder' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(syncLadderAfterPlanResult).toHaveBeenCalledTimes(1);
  });
});

describe('Planner generation persists (US-715)', () => {
  it('Quick Build saves through replaceWeekPlan and never through setPlanEntries', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click((await screen.findAllByRole('button', { name: QUICK_BUILD }))[0]);

    await waitFor(() => expect(replaceWeekPlan).toHaveBeenCalled());
    expect(setPlanEntries).not.toHaveBeenCalled();
    expect(deleteWeekPlan).not.toHaveBeenCalled();
  });

  it('Quick Build replaces only this kid and only the week in view', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click((await screen.findAllByRole('button', { name: QUICK_BUILD }))[0]);

    await waitFor(() => expect(replaceWeekPlan).toHaveBeenCalled());
    const [weekStart, kidId, entries] = replaceWeekPlan.mock.calls[0] as [string, string, Array<{ kid_id: string; date: string }>];
    expect(weekStart).toBe(thisWeekStart());
    expect(kidId).toBe('kid-1');
    expect(entries.length).toBeGreaterThan(0);
    expect([...new Set(entries.map((e) => e.kid_id))]).toEqual(['kid-1']);
    const end = plusDays(weekStart, 6);
    for (const e of entries) expect(e.date >= weekStart && e.date <= end).toBe(true);
  });

  it('a refused write fires no success toast', async () => {
    replaceWeekPlan.mockResolvedValue({ error: { message: 'nope' }, removed: [], insertedIds: [] });
    const user = userEvent.setup();
    renderPlanner();
    await user.click((await screen.findAllByRole('button', { name: QUICK_BUILD }))[0]);

    await waitFor(() => expect(replaceWeekPlan).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('AI Generate sends the week in view and only the kid fields the function reads', async () => {
    invokeEdgeFunction.mockResolvedValue({
      data: { plan: [{ date: thisWeekStart(), meals: { lunch: 'safe1' } }] },
      error: null,
    });
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: AI_GENERATE }));

    await waitFor(() => expect(invokeEdgeFunction).toHaveBeenCalled());
    const [fn, opts] = invokeEdgeFunction.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fn).toBe('ai-meal-plan');
    expect(opts.body.startDate).toBe(thisWeekStart());
    const kid = opts.body.kid as Record<string, unknown>;
    expect(Object.keys(kid).sort()).toEqual(['age', 'allergens', 'favorite_foods', 'id', 'name']);
    expect(kid).not.toHaveProperty('notes');
  });

  it('AI Generate keeps only entries inside the week with a real slot and food', async () => {
    const start = thisWeekStart();
    invokeEdgeFunction.mockResolvedValue({
      data: {
        plan: [
          { date: start, meals: { lunch: 'safe1', brunch: 'safe2', dinner: 'ghost' } },
          { date: plusDays(start, 9), meals: { lunch: 'safe2' } },
        ],
      },
      error: null,
    });
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: AI_GENERATE }));

    await waitFor(() => expect(replaceWeekPlan).toHaveBeenCalled());
    const entries = replaceWeekPlan.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(entries).toEqual([{ kid_id: 'kid-1', date: start, meal_slot: 'lunch', food_id: 'safe1', result: null }]);
    for (const e of entries) expect(e).not.toHaveProperty('id');
  });

  it('AI Generate refuses to replace the week when nothing valid comes back', async () => {
    invokeEdgeFunction.mockResolvedValue({ data: { plan: 'nonsense' }, error: null });
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: AI_GENERATE }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(replaceWeekPlan).not.toHaveBeenCalled();
    expect(String(toastError.mock.calls[0][0])).not.toMatch(/deployed|\{/);
  });
});

describe('Planner destructive flows', () => {
  it('Clear week confirms, then offers an Undo that restores the rows intact', async () => {
    const mine: PlanEntry = {
      id: 'm1', kid_id: 'kid-1', date: thisWeekStart(), meal_slot: 'dinner', food_id: 'safe1',
      result: 'ate', notes: 'all of it', amount_eaten: 'a_lot',
    };
    state.entries = [OTHER_KID_ENTRY, mine];
    deleteWeekPlan.mockResolvedValue({ error: null, removed: [mine] });
    const user = userEvent.setup();
    renderPlanner();

    await user.click(await screen.findByRole('button', { name: 'grid-clear' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/1 meal for Robin/);
    await user.click(screen.getByRole('button', { name: /clear week/i }));

    await waitFor(() => expect(deleteWeekPlan).toHaveBeenCalledWith(thisWeekStart(), 'kid-1'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const opts = toastSuccess.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(opts.action.label).toMatch(/undo/i);

    await act(async () => { opts.action.onClick(); });
    await waitFor(() => expect(addPlanEntries).toHaveBeenCalled());
    const restored = addPlanEntries.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(restored).toEqual([
      { kid_id: 'kid-1', date: thisWeekStart(), meal_slot: 'dinner', food_id: 'safe1', result: 'ate', notes: 'all of it', amount_eaten: 'a_lot' },
    ]);
  });

  it('Cancel on the clear confirm writes nothing', async () => {
    state.entries = [OTHER_KID_ENTRY, { ...OTHER_KID_ENTRY, id: 'm1', kid_id: 'kid-1' }];
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: 'grid-clear' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(deleteWeekPlan).not.toHaveBeenCalled();
  });
});

describe('Allergen guard', () => {
  describe('mild allergy', () => {
    const kidRecord = KID as Record<string, unknown>;
    beforeEach(() => { kidRecord.allergen_severity = { peanuts: 'mild' }; });
    afterEach(() => { delete kidRecord.allergen_severity; });

    it("asks before adding a food that carries the kid's allergen, and writes nothing on Cancel", async () => {
      const user = userEvent.setup();
      renderPlanner();

      await user.click(await screen.findByRole('button', { name: 'grid-add-nut' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toMatch(/Peanut butter contains peanut, which Robin is allergic to/);
      // Cancel is the default: it has focus.
      const cancel = screen.getByRole('button', { name: /cancel/i });
      await waitFor(() => expect(document.activeElement).toBe(cancel));
      await user.click(cancel);

      expect(addPlanEntry).not.toHaveBeenCalled();
      expect(addPlanEntries).not.toHaveBeenCalled();
    });

    it('writes when the parent picks Add anyway', async () => {
      const user = userEvent.setup();
      renderPlanner();
      await user.click(await screen.findByRole('button', { name: 'grid-add-nut' }));
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: /add anyway/i }));
      await waitFor(() => expect(addPlanEntry).toHaveBeenCalledWith(expect.objectContaining({ food_id: 'nut1', kid_id: 'kid-1' })));
    });
  });

  describe('allergy with no recorded severity (item 3a)', () => {
    it('gets the severe confirm, worded as not recorded rather than severe', async () => {
      const user = userEvent.setup();
      renderPlanner();
      await user.click(await screen.findByRole('button', { name: 'grid-add-nut' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toMatch(/peanut allergy \(severity not recorded, treated as severe\): Robin/);
      expect(dialog.textContent).toMatch(/Robin has a peanut allergy with no severity recorded, so it is treated as severe/);
      expect(dialog.textContent).not.toMatch(/Severe peanut allergy/);
      expect(dialog.textContent).not.toMatch(/has a severe peanut allergy/);
      expect(screen.queryByRole('button', { name: /^add anyway$/i })).toBeNull();
      expect(screen.getByRole('button', { name: /add it for Robin anyway/i })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(addPlanEntry).not.toHaveBeenCalled();
    });

    it('writes only after the named confirm', async () => {
      const user = userEvent.setup();
      renderPlanner();
      await user.click(await screen.findByRole('button', { name: 'grid-add-nut' }));
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: /add it for Robin anyway/i }));
      await waitFor(() => expect(addPlanEntry).toHaveBeenCalledWith(expect.objectContaining({ food_id: 'nut1' })));
    });

    it('Quick Build never places it', async () => {
      const user = userEvent.setup();
      renderPlanner();
      await user.click((await screen.findAllByRole('button', { name: QUICK_BUILD }))[0]);
      await waitFor(() => expect(replaceWeekPlan).toHaveBeenCalled());
      const entries = replaceWeekPlan.mock.calls[0][2] as Array<{ food_id: string }>;
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.food_id === 'nut1')).toBe(false);
    });
  });

  describe('severe allergy (item 29)', () => {
    const kidRecord = KID as Record<string, unknown>;
    beforeEach(() => { kidRecord.allergen_severity = { peanuts: 'severe' }; });
    afterEach(() => { delete kidRecord.allergen_severity; });

    it('names the child and the allergen in the title and on the button, and writes nothing on Cancel', async () => {
      const user = userEvent.setup();
      renderPlanner();
      await user.click(await screen.findByRole('button', { name: 'grid-add-nut' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toMatch(/Severe peanut allergy: Robin/);
      expect(dialog.textContent).toMatch(/Robin has a severe peanut allergy/);
      expect(screen.queryByRole('button', { name: /^add anyway$/i })).toBeNull();
      expect(screen.getByRole('button', { name: /add it for Robin anyway/i })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(addPlanEntry).not.toHaveBeenCalled();
    });

    it('writes only after the named confirm', async () => {
      const user = userEvent.setup();
      renderPlanner();
      await user.click(await screen.findByRole('button', { name: 'grid-add-nut' }));
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: /add it for Robin anyway/i }));
      await waitFor(() => expect(addPlanEntry).toHaveBeenCalledWith(expect.objectContaining({ food_id: 'nut1' })));
    });

    it('Quick Build never places the severe allergen', async () => {
      const user = userEvent.setup();
      renderPlanner();
      await user.click((await screen.findAllByRole('button', { name: QUICK_BUILD }))[0]);
      await waitFor(() => expect(replaceWeekPlan).toHaveBeenCalled());
      const entries = replaceWeekPlan.mock.calls[0][2] as Array<{ food_id: string }>;
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.food_id === 'nut1')).toBe(false);
    });

    it('AI Generate drops a reply that names the allergen food (client-side guard)', async () => {
      const start = thisWeekStart();
      invokeEdgeFunction.mockResolvedValue({
        data: { plan: [{ date: start, meals: { lunch: 'nut1', dinner: 'safe1' } }] },
        error: null,
      });
      const user = userEvent.setup();
      renderPlanner();
      await user.click(await screen.findByRole('button', { name: AI_GENERATE }));
      await waitFor(() => expect(replaceWeekPlan).toHaveBeenCalled());
      const entries = replaceWeekPlan.mock.calls[0][2] as Array<{ food_id: string }>;
      expect(entries.map((e) => e.food_id)).toEqual(['safe1']);
    });
  });

  it('AI Generate drops a mild or unrated allergen food too, and refuses a week of only that', async () => {
    invokeEdgeFunction.mockResolvedValue({
      data: { plan: [{ date: thisWeekStart(), meals: { lunch: 'nut1' } }] },
      error: null,
    });
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: AI_GENERATE }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(replaceWeekPlan).not.toHaveBeenCalled();
  });
});

describe('Planner against the real PlanContext', () => {
  let api: ReturnType<typeof usePlan> | null = null;
  function Probe() { api = usePlan(); return null; }

  const OLD: PlanEntry[] = [
    { id: 'old-1', kid_id: 'kid-1', date: thisWeekStart(), meal_slot: 'lunch', food_id: 'try1', result: 'tasted' },
    { id: 'old-2', kid_id: 'kid-1', date: plusDays(thisWeekStart(), 1), meal_slot: 'dinner', food_id: 'try1', result: null },
  ];

  const mountReal = async () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <PlanProvider>
            <Probe />
            <Planner />
          </PlanProvider>
        </MemoryRouter>
      </HelmetProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    act(() => { api!.setPlanEntries(OLD); });
    await waitFor(() => expect(api!.planEntries).toHaveLength(2));
  };

  beforeEach(() => {
    api = null;
    state.realPlan = true;
    auth.userId = 'u1';
    auth.householdId = 'hh1';
    server.insertError = null;
    server.deleteErrors = [];
    server.inserted = [];
    server.deleted = [];
  });
  afterEach(() => {
    auth.userId = null;
    auth.householdId = null;
  });

  const quickBuildAndConfirm = async () => {
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: QUICK_BUILD }))[0]);
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: /^replace$/i }));
  };

  it('an insert the server refuses leaves the old week in state and fires no success toast', async () => {
    server.insertError = { message: 'permission denied' };
    await mountReal();
    await quickBuildAndConfirm();

    await waitFor(() => expect(server.inserted.length).toBeGreaterThan(0));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(server.deleted).toEqual([]);
    expect(api!.planEntries.map((e) => e.id).sort()).toEqual(['old-1', 'old-2']);
    expect(api!.planEntries.find((e) => e.id === 'old-1')?.result).toBe('tasted');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('a delete the server refuses leaves no duplicates', async () => {
    server.deleteErrors = [{ message: 'permission denied' }];
    await mountReal();
    await quickBuildAndConfirm();

    await waitFor(() => expect(server.deleted.length).toBe(2));
    // First the stale rows (refused), then the rows it had just inserted.
    expect(server.deleted[1].every((id) => id.startsWith('srv-'))).toBe(true);
    await waitFor(() =>
      expect(api!.planEntries.map((e) => e.id).sort()).toEqual(['old-1', 'old-2']),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('Planner copy', () => {
  it('has no toast called with a string literal', () => {
    const src = readFileSync(resolve(__dirname, 'Planner.tsx'), 'utf8');
    expect(src).not.toMatch(/toast\.(success|error|info|warning)\(\s*["'`]/);
  });
});
