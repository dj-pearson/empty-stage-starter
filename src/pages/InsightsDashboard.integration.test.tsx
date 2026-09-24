/**
 * The Insights page with its real sections and the real useKidsProgressSummary.
 * Only the edges are faked: app state, auth, the feature flag and the Supabase
 * query chain. This pins the contracts the shell test stubs away: the ladder
 * columns the hook selects are the ones NextStepSection reads (via
 * toOverviewRow), logged plan entries reach WeekTrendSection's headline, and
 * the family view repeats no section id.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Food, Kid, PlanEntry } from '@/types';
import { toISODate, addIsoDays } from '@/lib/date-utils';

type Result = { data: unknown; error: unknown };

const state = vi.hoisted(() => ({
  kids: [] as Kid[],
  activeKidId: null as string | null,
  foods: [] as Food[],
  planEntries: [] as PlanEntry[],
  results: {} as Record<string, { data: unknown; error: unknown }>,
  selects: {} as Record<string, string>,
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children?: ReactNode }) => <>{children}</>,
  HelmetProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({
    kids: state.kids,
    activeKidId: state.activeKidId,
    kidsHydrated: true,
    kidsLoadError: null,
    refreshKids: vi.fn(() => Promise.resolve()),
    setActiveKid: vi.fn(),
    setActiveKidId: vi.fn(),
  }),
  useFoods: () => ({ foods: state.foods, foodsHydrated: true }),
  usePlan: () => ({ planEntries: state.planEntries }),
  useRecipes: () => ({ recipes: [] }),
  useGrocery: () => ({ groceryItems: [], addGroceryItem: vi.fn(), deleteGroceryItem: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'u1', householdId: 'h1' }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({ useFeatureFlag: () => true }));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  function query(table: string) {
    const result = (): Result => state.results[table] ?? { data: [], error: null };
    const chain = {
      select: (cols: string) => {
        state.selects[table] = cols;
        return chain;
      },
      in: () => chain,
      eq: () => chain,
      gte: () => chain,
      then: (resolve: (value: Result) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  }
  return {
    supabase: {
      from: (table: string) => query(table),
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  };
});

import InsightsDashboard from './InsightsDashboard';

const TODAY = toISODate(new Date());
const sam: Kid = { id: 'k1', name: 'Sam', allergens: [] };
const ada: Kid = { id: 'k2', name: 'Ada', allergens: [] };

let seq = 0;
function entry(kid_id: string, daysAgo: number, food_id: string, result: PlanEntry['result']): PlanEntry {
  seq += 1;
  return {
    id: `p${seq}`,
    kid_id,
    date: addIsoDays(TODAY, -daysAgo),
    meal_slot: 'dinner',
    food_id,
    result,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/insights']}>
      <InsightsDashboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  seq = 0;
  state.kids = [sam, ada];
  state.activeKidId = null;
  state.foods = [
    { id: 'f-pasta', name: 'Pasta', category: 'carb', is_safe: true, is_try_bite: false },
    { id: 'f-broc', name: 'Broccoli', category: 'vegetable', is_safe: false, is_try_bite: true },
  ];
  state.planEntries = [
    entry('k1', 0, 'f-pasta', 'ate'),
    entry('k1', 1, 'f-pasta', 'ate'),
    entry('k1', 2, 'f-broc', 'tasted'),
    entry('k2', 0, 'f-pasta', 'ate'),
  ];
  state.selects = {};
  state.results = {
    // A stalled ladder row for Sam: only nameable if the hook selected
    // consecutive_holds and the section read it through toOverviewRow.
    kid_food_ladder: {
      data: [
        {
          id: 'l1',
          kid_id: 'k1',
          food_id: 'f-broc',
          status: 'active',
          current_rung: 'touching',
          last_attempt_at: null,
          consecutive_successes: 0,
          consecutive_holds: 4,
          next_due_on: null,
        },
      ],
      error: null,
    },
    food_attempts: { data: [], error: null },
  };
});

describe('InsightsDashboard with real sections', () => {
  it('feeds the ladder read into the next step and repeats no id in the family view', async () => {
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByText(/Broccoli has stayed at/)).toBeInTheDocument());
    expect(state.selects.kid_food_ladder).toContain('consecutive_holds');

    // Each child's row has its own headline from that child's logged results.
    expect(screen.getByText(/Sam was offered 3 dishes this week, with 2 different foods/)).toBeInTheDocument();
    expect(screen.getByText(/Log a few more meals for Ada/)).toBeInTheDocument();

    const ids = Array.from(container.querySelectorAll('[id]')).map((el) => el.id);
    expect(ids.length).toBe(new Set(ids).size);
    expect(container.querySelector('#insights-trend')).toBeNull();
  });

  it('renders every section once for a selected child', async () => {
    state.activeKidId = 'k1';
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText(/Broccoli has stayed at/)).toBeInTheDocument());
    const ids = Array.from(container.querySelectorAll('section[id^="insights-"]')).map((s) => s.id);
    expect(ids).toEqual([
      'insights-trend',
      'insights-next',
      'insights-working',
      'insights-variety',
      'insights-allergy',
    ]);
    const all = Array.from(container.querySelectorAll('[id]')).map((el) => el.id);
    expect(all.length).toBe(new Set(all).size);
  });
});
