/**
 * Progress with its real sections: the trajectory, badges, household numbers
 * and recent history render as they ship, and only the network reads and the
 * context providers are stubbed. Progress.test.tsx stubs the sections to pin
 * the shell; this file pins the props the page hands them (ladder rows,
 * scope, kid ids, journal link) against what those components actually read.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Food, Kid, PlanEntry } from '@/types';
import type { KidLadderRow } from '@/lib/kidProgress';
import '@/i18n';

const state = vi.hoisted(() => ({
  kids: [] as Kid[],
  activeKidId: null as string | null,
  foods: [] as Food[],
  planEntries: [] as PlanEntry[],
  ladderRows: [] as KidLadderRow[],
  progressIds: [] as string[][],
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children?: ReactNode }) => <>{children}</>,
  HelmetProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'u1', householdId: 'h1' }),
}));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({
    kids: state.kids,
    activeKidId: state.activeKidId,
    kidsHydrated: true,
    kidsLoadError: null,
    refreshKids: () => Promise.resolve(),
    setActiveKid: () => {},
    setActiveKidId: () => {},
  }),
  useFoods: () => ({ foods: state.foods, foodsHydrated: true }),
  usePlan: () => ({ planEntries: state.planEntries }),
  useRecipes: () => ({ recipes: [] }),
}));

// The two server reads. Everything downstream of them is real.
vi.mock('@/hooks/useKidsProgressSummary', () => ({
  useKidsProgressSummary: (ids: readonly string[]) => {
    state.progressIds.push([...ids]);
    const wanted = new Set(ids);
    return {
      ladderRows: state.ladderRows.filter((r) => wanted.has(r.kid_id)),
      attempts: [],
      loading: false,
      error: false,
      truncated: false,
    };
  },
}));

vi.mock('@/hooks/useHouseholdHistory', () => ({
  useHouseholdHistory: () => ({
    entries: state.planEntries,
    loading: false,
    error: false,
    truncated: false,
    fromIso: '2025-09-24',
  }),
}));

vi.mock('@/hooks/useKidBadges', () => ({
  useKidBadges: (kidId: string | null | undefined) => ({
    rows: [],
    rowsKidId: kidId ?? null,
    loading: false,
    error: false,
    retry: () => {},
  }),
}));

import Progress from './Progress';

const maya = { id: 'k1', name: 'Maya', allergens: [] } as unknown as Kid;
const sam = { id: 'k2', name: 'Sam', allergens: [] } as unknown as Kid;

function iso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

beforeEach(() => {
  state.kids = [maya, sam];
  state.activeKidId = 'k2';
  state.foods = [
    { id: 'f1', name: 'Peas', category: 'vegetable' } as Food,
    { id: 'f2', name: 'Rice', category: 'carb' } as Food,
  ];
  state.planEntries = [
    { id: 'p1', kid_id: 'k1', date: iso(0), meal_slot: 'dinner', food_id: 'f1', result: 'ate' } as PlanEntry,
    { id: 'p2', kid_id: 'k2', date: iso(0), meal_slot: 'dinner', food_id: 'f2', result: 'tasted' } as PlanEntry,
  ];
  state.ladderRows = [
    { kid_id: 'k1', food_id: 'f1', status: 'mastered', current_rung: 'eat', updated_at: `${iso(-40)}T12:00:00Z` },
    { kid_id: 'k1', food_id: 'f2', status: 'mastered', current_rung: 'eat', updated_at: `${iso(-10)}T12:00:00Z` },
    { kid_id: 'k2', food_id: 'f1', status: 'active', current_rung: 'touch' },
  ];
  state.progressIds = [];
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/progress']}>
      <Progress />
    </MemoryRouter>
  );
}

function graduationsFor(kidId: string): string | null | undefined {
  const row = screen.getByTestId(`household-kid-${kidId}`);
  const term = within(row).getByText('Ladder graduations to date');
  return term.parentElement?.querySelector('dd')?.textContent;
}

describe('Progress page, real sections', () => {
  it("counts a sibling's graduations while one child is in scope", () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: "Sam's progress" })).toBeInTheDocument();
    // Maya is not in scope, but the household numbers still list her, and
    // her two mastered ladder rows must reach them.
    expect(graduationsFor('k1')).toBe('2');
    expect(graduationsFor('k2')).toBe('0');
  });

  it('scopes the recent history link and rows to the child in scope', () => {
    renderPage();
    const history = document.getElementById('progress-history');
    expect(history).not.toBeNull();
    const journal = within(history as HTMLElement).getByRole('link', { name: /journal/i });
    expect(journal).toHaveAttribute('href', '/dashboard/food-journal?kid=k2');
    expect(within(history as HTMLElement).getByText('Rice')).toBeInTheDocument();
    expect(within(history as HTMLElement).queryByText('Peas')).toBeNull();
  });

  it('draws the trajectory for the child in scope only', () => {
    renderPage();
    const milestones = document.getElementById('progress-milestones') as HTMLElement;
    expect(within(milestones).queryByText(/Maya/)).toBeNull();
  });
});
