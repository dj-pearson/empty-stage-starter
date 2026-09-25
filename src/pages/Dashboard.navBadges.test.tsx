import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';
import type { NavBadges } from '@/lib/navigation';

/**
 * Item 33 on a phone: the bottom bar and the More sheet read the same badges
 * the sidebar does, and a badge on something behind More puts a dot on More.
 * Everything else the shell reads is stubbed at the hook boundary.
 */

const h = vi.hoisted(() => ({ badges: {} as NavBadges }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({ kids: [{ id: 'k1', name: 'Ada' }], activeKidId: null, setActiveKid: vi.fn(), kidsHydrated: true }),
  usePlan: () => ({ planEntries: [], updatePlanEntry: vi.fn() }),
  useFoods: () => ({ foods: [] }),
  useRecipes: () => ({ recipes: [] }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: 'u1', householdId: 'h1' }) }));
vi.mock('@/contexts/AccessibilityContext', () => ({
  useAccessibility: () => ({ preferences: { keyboardShortcuts: false } }),
}));
vi.mock('@/lib/onboardingStatus', () => ({
  readLocalOnboardingFlag: () => true,
  fetchOnboardingCompleted: vi.fn(),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/hooks/useNavEntitlements', () => ({
  useNavEntitlements: () => ({ isAdmin: false, isProfessional: false }),
}));
vi.mock('@/hooks/useWhiteLabelTheme', () => ({ useWhiteLabelTheme: () => {} }));
vi.mock('@/hooks/useNavBadges', () => ({ useNavBadges: () => h.badges }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/components/auth/BindEmailBanner', () => ({ BindEmailBanner: () => null }));
vi.mock('@/components/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('@/components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('@/components/KidSelector', () => ({ KidSelector: () => null }));
vi.mock('@/components/QuickActionsFab', () => ({ QuickActionsFab: () => null }));

import Dashboard from './Dashboard';

function renderShell() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />}>
            <Route index element={<p>home page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  h.badges = {};
});

describe('mobile nav badges', () => {
  it('names bottom-bar links with their status', () => {
    h.badges = {
      groceryLeft: { kind: 'count', count: 6 },
      dinnerUnplanned: { kind: 'dot' },
      unloggedMeals: { kind: 'count', count: 2 },
    };
    renderShell();
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    const grocery = within(bar).getByRole('link', { name: 'Grocery, 6 items left' });
    expect(within(grocery).getByTestId('nav-badge-count')).toHaveTextContent('6');
    expect(within(bar).getByRole('link', { name: 'Planner, no dinner planned today' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Home, 2 meals to log' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Pantry' })).toBeInTheDocument();
  });

  it('leaves More plain when nothing behind it has a badge', () => {
    h.badges = { groceryLeft: { kind: 'count', count: 6 } };
    renderShell();
    const more = screen.getByRole('button', { name: 'More navigation options' });
    expect(within(more).queryByTestId('nav-badge-dot')).toBeNull();
  });

  it('dots More for the Food Tracker count and shows it on the tile', async () => {
    h.badges = { ladderDue: { kind: 'count', count: 3 } };
    renderShell();
    const more = screen.getByRole('button', { name: 'More navigation options, something needs attention' });
    expect(within(more).getByTestId('nav-badge-dot')).toBeInTheDocument();
    await userEvent.click(more);
    const tile = await screen.findByRole('link', { name: 'Food Tracker, 3 foods to offer today' });
    expect(within(tile).getByTestId('nav-badge-count')).toHaveTextContent('3');
  });
});
