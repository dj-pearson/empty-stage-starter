import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';
import { isoDay } from '@/lib/mobilePlannerDay';
import { resetWeekStartsOnForTests } from '@/lib/weekStartPref';

/**
 * ?date=&slot= deep links (TodayTasks, QuickActionsFab, TonightHero,
 * Dashboard, OnboardingProgressBar, Meal Builder) open the week holding the
 * date, focus that cell once, and then leave only ?week in the URL.
 */

let phone = false;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: phone && query.includes('max-width'),
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

const KIDS = [{ id: 'sam', name: 'Sam', allergens: [] }];

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: [], updateFood: vi.fn() }),
  useGrocery: () => ({ addGroceryItemsMerged: vi.fn(), deleteGroceryItems: vi.fn() }),
  useKids: () => ({ kids: KIDS, activeKidId: null, setActiveKid: vi.fn() }),
  useRecipes: () => ({ recipes: [] }),
  usePlan: () => ({
    planEntries: [],
    setPlanEntries: vi.fn(),
    updatePlanEntry: vi.fn(),
    addPlanEntry: vi.fn(),
    addPlanEntries: vi.fn(),
    copyWeekPlan: vi.fn(),
    deleteWeekPlan: vi.fn(),
    deletePlanEntries: vi.fn(),
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

const location: { search: string } = { search: '' };
function LocationProbe() {
  location.search = useLocation().search;
  return null;
}

const renderPlanner = (path: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Planner />
        <LocationProbe />
      </MemoryRouter>
    </HelmetProvider>,
  );

const now = new Date();
const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const nextMonday = isoDay(new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 7));
// Wednesday of next week: inside the week, not its first day.
const target = isoDay(new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 9));

const cell = (date: string, slot: string) =>
  document.querySelector<HTMLElement>(`[data-cell-date="${date}"][data-cell-slot="${slot}"]`);

beforeEach(() => {
  localStorage.clear();
  resetWeekStartsOnForTests();
  location.search = '';
  phone = false;
});

afterEach(() => resetWeekStartsOnForTests());

describe('Planner ?date=&slot= deep link', () => {
  it('opens the week holding the date and focuses that cell', async () => {
    renderPlanner(`/dashboard/planner?date=${target}&slot=lunch`);
    const first = document.querySelector('[data-cell-slot="breakfast"]') as HTMLElement;
    expect(first.dataset.cellDate).toBe(nextMonday);
    await waitFor(() => expect(document.activeElement).toBe(cell(target, 'lunch')));
  });

  it('removes date and slot from the URL and keeps the week', async () => {
    renderPlanner(`/dashboard/planner?date=${target}&slot=lunch`);
    await waitFor(() => {
      const params = new URLSearchParams(location.search);
      expect(params.get('date')).toBeNull();
      expect(params.get('slot')).toBeNull();
      expect(params.get('week')).toBe(nextMonday);
    });
    // The view did not jump back to this week when ?date went away.
    const first = document.querySelector('[data-cell-slot="breakfast"]') as HTMLElement;
    expect(first.dataset.cellDate).toBe(nextMonday);
  });

  it('keeps an explicit ?week over the one ?date implies', async () => {
    const thisMondayIso = isoDay(thisMonday);
    renderPlanner(`/dashboard/planner?week=${thisMondayIso}&date=${target}&slot=lunch`);
    await waitFor(() => expect(new URLSearchParams(location.search).get('date')).toBeNull());
    expect(new URLSearchParams(location.search).get('week')).toBe(thisMondayIso);
    const first = document.querySelector('[data-cell-slot="breakfast"]') as HTMLElement;
    expect(first.dataset.cellDate).toBe(thisMondayIso);
  });

  it('ignores an invalid date and still cleans the URL', async () => {
    renderPlanner('/dashboard/planner?date=not-a-date&slot=lunch');
    await waitFor(() => expect(new URLSearchParams(location.search).get('date')).toBeNull());
    expect(new URLSearchParams(location.search).get('week')).toBeNull();
    const first = document.querySelector('[data-cell-slot="breakfast"]') as HTMLElement;
    expect(first.dataset.cellDate).toBe(isoDay(thisMonday));
  });
});

describe('Planner deep link on a phone', () => {
  it('selects the day tab and focuses the slot card', async () => {
    phone = true;
    renderPlanner(`/dashboard/planner?date=${target}&slot=lunch`);
    // Wednesday is index 2 of a Monday week.
    await waitFor(() => expect(document.getElementById('planner-day-2')).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => {
      const focused = document.activeElement as HTMLElement | null;
      expect(focused?.tagName).toBe('SECTION');
      expect(focused?.getAttribute('aria-label')).toMatch(/lunch/i);
    });
    expect(new URLSearchParams(location.search).get('week')).toBe(nextMonday);
  });
});
