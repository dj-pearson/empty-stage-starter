/**
 * The Progress shell: scope resolution, the gate, the section order and the
 * ?section landing that /dashboard/analytics redirects to. Section
 * components are stubbed so this pins the page, not them.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Kid } from '@/types';
import '@/i18n';

const state = vi.hoisted(() => ({
  kids: [] as Kid[],
  activeKidId: null as string | null,
  kidsHydrated: true,
  foodsHydrated: true,
  setActiveKid: vi.fn(),
  progressCalls: [] as Array<{ ids: readonly string[]; opts: unknown }>,
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children?: ReactNode }) => <>{children}</>,
  HelmetProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({
    kids: state.kids,
    activeKidId: state.activeKidId,
    kidsHydrated: state.kidsHydrated,
    kidsLoadError: null,
    refreshKids: vi.fn(() => Promise.resolve()),
    setActiveKid: state.setActiveKid,
    setActiveKidId: vi.fn(),
  }),
  useFoods: () => ({ foods: [], foodsHydrated: state.foodsHydrated }),
  usePlan: () => ({ planEntries: [] }),
  useRecipes: () => ({ recipes: [] }),
}));

vi.mock('@/hooks/useKidsProgressSummary', () => ({
  useKidsProgressSummary: (ids: readonly string[], opts: unknown) => {
    state.progressCalls.push({ ids, opts });
    return {
      ladderRows: [],
      attempts: [{ kid_id: ids[0] ?? null, food_id: 'f1', attempted_at: '2026-03-14T12:00:00Z' }],
      loading: false,
      error: false,
      truncated: false,
    };
  },
}));

vi.mock('@/components/foodTracker/KidChips', () => ({
  KidChips: ({ ariaLabel }: { ariaLabel?: string }) => <div role="group" aria-label={ariaLabel} data-testid="kid-chips" />,
}));

vi.mock('@/components/ProgressDashboard', () => {
  const Stub = ({ kids }: { kids: readonly Kid[] }) => (
    <section aria-labelledby="stub-trajectory-title">
      <h2 id="stub-trajectory-title">Trajectory {kids.map((k) => k.name).join(',')}</h2>
    </section>
  );
  return { ProgressDashboard: Stub, ProgressTrajectory: Stub, default: Stub };
});

vi.mock('@/components/AchievementsView', () => ({
  AchievementsView: ({ kid }: { kid: Kid }) => <p>Badges for {kid.name}</p>,
}));

vi.mock('@/components/progress/HouseholdNumbers', () => ({
  HouseholdNumbers: ({ scopeKidId }: { scopeKidId: string | null }) => (
    <p>Numbers for {scopeKidId ?? 'family'}</p>
  ),
}));

vi.mock('@/components/ResultHistoryCard', () => ({
  ResultHistoryCard: ({ titleId, kidId }: { titleId?: string; kidId?: string | null }) => (
    <h2 id={titleId}>History {kidId ?? 'family'}</h2>
  ),
}));

import Progress from './Progress';

const maya = { id: 'k1', name: 'Maya', allergens: [] } as Kid;
const sam = { id: 'k2', name: 'Sam', allergens: [] } as Kid;

let search = '';
function Probe() {
  search = useLocation().search;
  return null;
}

function renderAt(url = '/dashboard/progress') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Progress />
      <Probe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.kids = [maya, sam];
  state.activeKidId = null;
  state.kidsHydrated = true;
  state.foodsHydrated = true;
  state.setActiveKid.mockReset();
  state.progressCalls = [];
  search = '';
});

describe('Progress', () => {
  it('renders family scope with KidChips and every section when no child is selected', () => {
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: 'Family progress' })).toBeInTheDocument();
    expect(screen.getByTestId('kid-chips')).toHaveAttribute('aria-label', 'Show progress for');
    for (const id of ['progress-milestones', 'progress-badges', 'progress-numbers', 'progress-history']) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(screen.queryByText(/No Child Selected/i)).toBeNull();
    expect(screen.getByText('Trajectory Maya,Sam')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "See Maya's badges" })).toBeInTheDocument();
    expect(screen.getByText('Numbers for family')).toBeInTheDocument();
  });

  it('reads the progress once, for every child, over all time', () => {
    renderAt();
    const ids = new Set(state.progressCalls.map((c) => c.ids.join(',')));
    expect([...ids]).toEqual(['k1,k2']);
    expect(state.progressCalls[0].opts).toMatchObject({ since: 'all' });
  });

  it('states the horizon from the earliest attempt', async () => {
    renderAt();
    expect(await screen.findByText("From what you've logged since March 2026")).toBeInTheDocument();
  });

  it('scopes to a child when activeKidId matches one', () => {
    state.activeKidId = 'k2';
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: "Sam's progress" })).toBeInTheDocument();
    expect(screen.getByText('Badges for Sam')).toBeInTheDocument();
    expect(screen.getByText('Numbers for k2')).toBeInTheDocument();
    expect(screen.getByText('Trajectory Sam')).toBeInTheDocument();
    // The read stays household-wide: the numbers section lists siblings too.
    expect(state.progressCalls.every((c) => c.ids.join(',') === 'k1,k2')).toBe(true);
  });

  it('falls back to family scope for a deleted activeKidId', () => {
    state.activeKidId = 'k-gone';
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: 'Family progress' })).toBeInTheDocument();
    expect(screen.getByText('Trajectory Maya,Sam')).toBeInTheDocument();
  });

  it('shows the gate skeleton before kids hydrate, not an empty state, with the title already set', () => {
    state.kidsHydrated = false;
    state.kids = [];
    renderAt();
    expect(screen.getByTestId('insights-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('No children yet')).toBeNull();
    expect(document.getElementById('progress-milestones')).toBeNull();
    expect(document.querySelector('title')?.textContent).toBe('Progress - EatPal');
  });

  it('links out instead of redrawing other screens', () => {
    renderAt();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '#progress-milestones',
        '#progress-numbers',
        '/dashboard/kids',
        '/dashboard/insights',
        '/dashboard/food-journal',
        '/dashboard/food-tracker',
      ])
    );
    expect(hrefs).not.toContain('/dashboard/analytics');
  });

  it('lands on ?section=numbers: focuses its h2 and removes the param', async () => {
    renderAt('/dashboard/progress?section=numbers');
    const heading = document.getElementById('progress-numbers-title');
    expect(heading).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(search).toBe(''));
  });

  it('waits for the gate before landing', async () => {
    state.kidsHydrated = false;
    renderAt('/dashboard/progress?section=numbers');
    await new Promise((r) => setTimeout(r, 30));
    expect(search).toBe('?section=numbers');
  });
});
