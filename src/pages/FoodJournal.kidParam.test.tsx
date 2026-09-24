import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { Kid } from '@/types';

const mocks = vi.hoisted(() => ({
  kids: [] as Kid[],
  activeKidId: null as string | null,
  kidsHydrated: true,
  setActiveKidId: vi.fn(),
}));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({
    kids: mocks.kids,
    activeKidId: mocks.activeKidId,
    kidsHydrated: mocks.kidsHydrated,
    setActiveKidId: mocks.setActiveKidId,
  }),
  useFoods: () => ({ foods: [], foodsHydrated: true }),
  useRecipes: () => ({ recipes: [] }),
  usePlan: () => ({ planEntries: [], updatePlanEntry: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: 'user-me', householdId: 'hh-1' }) }));
vi.mock('@/contexts/QuickLogContext', () => ({ useQuickLog: () => ({ openQuickLog: vi.fn() }) }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ members: [] }) }));
vi.mock('@/hooks/useJournalFeedback', () => ({
  useJournalFeedback: () => ({ feedback: [], attempts: [], status: 'ready', reload: vi.fn() }),
}));
vi.mock('@/hooks/useKidsProgressSummary', () => ({
  useKidsProgressSummary: () => ({ ladderRows: [], attempts: [], loading: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import FoodJournal from './FoodJournal';

const k1: Kid = { id: 'k1', name: 'Maya', allergens: [] } as Kid;
const k2: Kid = { id: 'k2', name: 'Sam', allergens: [] } as Kid;

let search = '';
function Probe() {
  search = useLocation().search;
  return null;
}

function renderAt(url: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <FoodJournal />
        <Probe />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.kids = [k1, k2];
  mocks.activeKidId = 'k1';
  mocks.kidsHydrated = true;
  search = '';
});

describe('FoodJournal ?kid=', () => {
  it('selects the named child and removes the param', async () => {
    renderAt('/dashboard/food-journal?kid=k2&range=7');
    await waitFor(() => expect(mocks.setActiveKidId).toHaveBeenCalledWith('k2'));
    await waitFor(() => expect(search).toBe('?range=7'));
  });

  it('ignores an id that is not one of the kids, and still drops it', async () => {
    renderAt('/dashboard/food-journal?kid=nope');
    await waitFor(() => expect(search).toBe(''));
    expect(mocks.setActiveKidId).not.toHaveBeenCalled();
  });

  it('waits for the kids to load before deciding', async () => {
    mocks.kidsHydrated = false;
    mocks.kids = [];
    renderAt('/dashboard/food-journal?kid=k2');
    await new Promise((r) => setTimeout(r, 20));
    expect(search).toBe('?kid=k2');
    expect(mocks.setActiveKidId).not.toHaveBeenCalled();
  });
});
