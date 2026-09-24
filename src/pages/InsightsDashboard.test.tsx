/**
 * The Insights shell: scope resolution, gate states, link-outs and the ?from
 * landing. Section components are stubbed so this pins the page, not them.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Kid } from '@/types';

const state = vi.hoisted(() => ({
  kids: [] as Kid[],
  activeKidId: null as string | null,
  kidsHydrated: true,
  foodsHydrated: true,
  kidsLoadError: null as string | null,
  refreshKids: vi.fn(() => Promise.resolve()),
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
    kidsLoadError: state.kidsLoadError,
    refreshKids: state.refreshKids,
    setActiveKid: state.setActiveKid,
    setActiveKidId: vi.fn(),
  }),
  useFoods: () => ({ foods: [], foodsHydrated: state.foodsHydrated }),
  usePlan: () => ({ planEntries: [] }),
  useRecipes: () => ({ recipes: [] }),
  useGrocery: () => ({ groceryItems: [] }),
}));

vi.mock('@/hooks/useKidsProgressSummary', () => ({
  useKidsProgressSummary: (ids: readonly string[], opts: unknown) => {
    state.progressCalls.push({ ids, opts });
    return { ladderRows: [], attempts: [], loading: false, error: false };
  },
}));

vi.mock('@/hooks/useFeatureFlag', () => ({ useFeatureFlag: () => false }));

function stubSection(id: string, title: string) {
  return ({ kid, kids, compact }: { kid?: Kid; kids?: readonly Kid[]; compact?: boolean }) => (
    <section id={id} aria-labelledby={`${id}-title`} data-compact={compact ? 'yes' : 'no'}>
      <h2 id={`${id}-title`}>
        {title} {kid?.name ?? kids?.map((k) => k.name).join(',')}
      </h2>
    </section>
  );
}

vi.mock('@/components/insights/WeekTrendSection', () => ({
  WeekTrendSection: stubSection('insights-trend', 'Trend'),
}));
vi.mock('@/components/insights/NextStepSection', () => ({
  NextStepSection: stubSection('insights-next', 'Next'),
}));
vi.mock('@/components/insights/WorkingSection', () => ({
  WorkingSection: stubSection('insights-working', 'Working'),
}));
vi.mock('@/components/insights/VarietySection', () => ({
  VarietySection: stubSection('insights-variety', 'Variety'),
}));
vi.mock('@/components/insights/AllergyCheckSection', () => ({
  AllergyCheckSection: stubSection('insights-allergy', 'Allergy'),
}));

import InsightsDashboard from './InsightsDashboard';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{`${loc.pathname}${loc.search}`}</div>;
}

function renderPage(url = '/dashboard/insights') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <InsightsDashboard />
      <Where />
    </MemoryRouter>,
  );
}

const sam: Kid = { id: 'k1', name: 'Sam' };
const ada: Kid = { id: 'k2', name: 'Ada' };

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

describe('InsightsDashboard shell', () => {
  beforeEach(() => {
    state.kids = [sam, ada];
    state.activeKidId = null;
    state.kidsHydrated = true;
    state.foodsHydrated = true;
    state.kidsLoadError = null;
    state.refreshKids.mockClear();
    state.setActiveKid.mockClear();
    state.progressCalls.length = 0;
    // jsdom has no scrolling; the page falls back to scrollTo for top-of-page landings.
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it('renders family scope with both children when no child is selected', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Family insights' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const samButton = screen.getByRole('button', { name: "Open Sam's insights" });
    expect(samButton).toHaveTextContent('Sam');
    expect(screen.getByRole('button', { name: "Open Ada's insights" })).toBeInTheDocument();
    // Nothing pooled: each row gets its own compact sections.
    expect(within(rows[0]).getByText(/Trend Sam/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Next Ada/)).toBeInTheDocument();
    expect(document.getElementById('insights-working')).toBeNull();

    await userEvent.click(samButton);
    expect(state.setActiveKid).toHaveBeenCalledWith('k1');

    const last = state.progressCalls[state.progressCalls.length - 1];
    expect([...last.ids].sort()).toEqual(['k1', 'k2']);
    expect(last.opts).toMatchObject({ windowDays: 28 });
  });

  it("reads a selected id that no longer exists as family scope", () => {
    state.activeKidId = 'gone';
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Family insights' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders the kid sections in order for a selected child', () => {
    state.activeKidId = 'k1';
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: "Sam's insights" })).toBeInTheDocument();
    const ids = Array.from(document.querySelectorAll('section[id^="insights-"]')).map((s) => s.id);
    expect(ids).toEqual([
      'insights-trend',
      'insights-next',
      'insights-working',
      'insights-variety',
      'insights-allergy',
    ]);
    expect(state.progressCalls[state.progressCalls.length - 1].ids).toEqual(['k1']);
  });

  it('shows a loading status, not the empty state, before kids hydrate', () => {
    state.kids = [];
    state.kidsHydrated = false;
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading insights');
    expect(screen.queryByText('No children yet')).not.toBeInTheDocument();
  });

  it('holds the sections back until foods hydrate too', () => {
    state.foodsHydrated = false;
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading insights');
    expect(document.getElementById('insights-trend')).toBeNull();
  });

  it('links the empty state to the add-child flow', () => {
    state.kids = [];
    renderPage();
    expect(screen.getByRole('link', { name: 'Add child' })).toHaveAttribute('href', '/dashboard/kids?add=1');
  });

  it('offers Retry when the kids load failed with nothing cached', async () => {
    state.kids = [];
    state.kidsLoadError = 'network';
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.refreshKids).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Add child' })).not.toBeInTheDocument();
  });

  it('keeps cached kids on a failed refresh and says it may be stale', () => {
    state.kidsLoadError = 'network';
    renderPage();
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows no review hint for an unparseable review date', () => {
    state.kids = [{ ...sam, profile_last_reviewed: 'not-a-date' }, ada];
    state.activeKidId = 'k1';
    expect(() => renderPage()).not.toThrow();
    expect(screen.queryByText(/last reviewed/)).not.toBeInTheDocument();
  });

  it('shows a review hint for a profile reviewed 120 days ago', () => {
    state.kids = [{ ...sam, profile_last_reviewed: isoDaysAgo(120) }, ada];
    state.activeKidId = 'k1';
    renderPage();
    expect(screen.getByText(/last reviewed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Review Sam's profile" })).toHaveAttribute(
      'href',
      '/dashboard/kids?kid=k1&intake=1',
    );
  });

  it("links to the child's profile editor", () => {
    state.activeKidId = 'k1';
    renderPage();
    expect(screen.getByRole('link', { name: "Sam's profile" })).toHaveAttribute(
      'href',
      '/dashboard/kids?kid=k1&edit=1',
    );
    expect(screen.getByRole('link', { name: 'Food Tracker' })).toHaveAttribute('href', '/dashboard/food-tracker');
  });

  it('lands ?from=fatigue on the variety heading and clears the param', async () => {
    state.activeKidId = 'k1';
    renderPage('/dashboard/insights?from=fatigue');
    const heading = document.getElementById('insights-variety-title');
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/dashboard\/insights$/);
  });

  it('drops an unknown ?from value without moving focus', async () => {
    state.activeKidId = 'k1';
    renderPage('/dashboard/insights?from=bogus');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/dashboard\/insights$/));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(document.body).toHaveFocus();
  });
});
