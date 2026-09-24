import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';
import type { PlanEntry } from '@/types';
import { isoDay } from '@/lib/mobilePlannerDay';
import { resetWeekStartsOnForTests, setWeekStartsOnLocal } from '@/lib/weekStartPref';

/**
 * Items 2-4 on the desktop page: family mode is one grid (not a grid per
 * child), the try-bite strip sits above it, and the week starts on Monday
 * unless the user chose Sunday.
 */

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

const KIDS = [
  { id: 'sam', name: 'Sam', allergens: [] },
  { id: 'ada', name: 'Ada', allergens: [] },
];
const FOODS = [
  { id: 'rice', name: 'Rice', category: 'carb', unit: 'cup', is_safe: true, is_try_bite: false, quantity: 4 },
  { id: 'kiwi', name: 'Kiwi', category: 'fruit', unit: 'each', is_safe: false, is_try_bite: true, quantity: 4 },
];

const now = new Date();
const today = isoDay(now);
const monday = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
const sunday = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()));

const state: { entries: PlanEntry[] } = { entries: [] };
const deletePlanEntries = vi.fn();
const setActiveKid = vi.fn();

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: FOODS, updateFood: vi.fn() }),
  useGrocery: () => ({ addGroceryItemsMerged: vi.fn(), deleteGroceryItems: vi.fn() }),
  useKids: () => ({ kids: KIDS, activeKidId: null, setActiveKid }),
  useRecipes: () => ({ recipes: [] }),
  usePlan: () => ({
    planEntries: state.entries,
    setPlanEntries: vi.fn(),
    updatePlanEntry: vi.fn(),
    addPlanEntry: vi.fn(),
    addPlanEntries: vi.fn(),
    copyWeekPlan: vi.fn(),
    deleteWeekPlan: vi.fn(),
    deletePlanEntries,
    movePlanEntries: vi.fn(),
    replaceSlot: vi.fn(),
    replaceWeekPlan: vi.fn(),
    scheduleRecipe: vi.fn(),
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: null, householdId: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/lib/logger', () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withContext: () => logger };
  return { logger };
});
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
const GROCERY = { preview: () => ({ toAdd: 0, alreadyHave: 0, onList: 0 }), push: vi.fn() };
vi.mock('@/hooks/usePlanToGrocery', () => ({ usePlanToGrocery: () => GROCERY }));
vi.mock('@/components/VarietyFatigueBanner', () => ({ VarietyFatigueBanner: () => null }));
vi.mock('@/components/GSAPCalendarMealPlanner', () => ({ GSAPCalendarMealPlanner: () => <div>kid-grid</div> }));

import Planner from './Planner';

const renderPlanner = (path = '/dashboard/planner') =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Planner />
      </MemoryRouter>
    </HelmetProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetWeekStartsOnForTests();
  deletePlanEntries.mockResolvedValue({ error: null, removed: [] });
  state.entries = [
    { id: '1', kid_id: 'sam', date: today, meal_slot: 'dinner', food_id: 'rice', result: null },
    { id: '2', kid_id: 'ada', date: today, meal_slot: 'dinner', food_id: 'rice', result: null },
    { id: '3', kid_id: 'ada', date: today, meal_slot: 'try_bite', food_id: 'kiwi', result: null },
  ];
});

afterEach(() => resetWeekStartsOnForTests());

describe('Planner desktop family mode', () => {
  it('renders one family grid instead of a grid per child', () => {
    renderPlanner();
    expect(screen.getByTestId('family-week-grid')).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.queryByText('kid-grid')).toBeNull();
    const dinner = document.querySelector<HTMLElement>(`[data-cell-date="${today}"][data-cell-slot="dinner"]`)!;
    expect(within(dinner).getByText('Rice')).toBeInTheDocument();
  });

  it('removes one kid meal through the page, with the rows of that kid only', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole('button', { name: /Ada's Dinner options/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Remove Ada's Dinner/ }));
    expect(deletePlanEntries).toHaveBeenCalledWith(['2']);
  });

  it("opens one child's detailed grid from the family grid", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole('button', { name: 'Ada' }));
    expect(setActiveKid).toHaveBeenCalledWith('ada');
  });

  it('shows the try-bite strip above the grid', () => {
    renderPlanner();
    expect(screen.getByTestId('try-bite-strip')).toBeInTheDocument();
    expect(screen.getByTestId('try-bite-ada-kiwi')).toHaveAttribute('href', '/dashboard/food-tracker?food=kiwi');
  });
});

describe('Planner week start (item 3)', () => {
  it('opens on the Monday of this week by default', () => {
    renderPlanner();
    expect(document.querySelector(`[data-cell-date="${monday}"][data-cell-slot="breakfast"]`)).not.toBeNull();
    const first = document.querySelector('[data-cell-slot="breakfast"]') as HTMLElement;
    expect(first.dataset.cellDate).toBe(monday);
  });

  it('opens on Sunday for a user who chose Sunday', () => {
    setWeekStartsOnLocal(0, null);
    renderPlanner();
    const first = document.querySelector('[data-cell-slot="breakfast"]') as HTMLElement;
    expect(first.dataset.cellDate).toBe(sunday);
  });

  it('a ?week= saved under a Sunday start opens on the Monday week holding that day', () => {
    // A Sunday URL, read with Monday as the start, is the last day of the
    // week before; nothing is lost, the window just contains it.
    renderPlanner(`/dashboard/planner?week=${sunday}`);
    const cells = [...document.querySelectorAll<HTMLElement>('[data-cell-slot="breakfast"]')].map((c) => c.dataset.cellDate);
    expect(cells).toHaveLength(7);
    expect(cells).toContain(sunday);
    expect(cells[6]).toBe(sunday);
  });
});
