/**
 * Kids page wiring: useKidsProgressSummary -> buildProgressByKid -> ChildProfileCard.
 *
 * Only the data boundary (contexts and the Supabase client) is faked. The hook,
 * the summarizer and the card are the real ones, so a contract break between
 * them (a ladder row the card cannot name, a missing hydrated flag) fails here
 * even when each unit test passes on hand-built fixtures.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';
import type { Kid } from '@/types';

const kids: Kid[] = [
  { id: 'k-maya', name: 'Maya', age: 4, allergens: ['peanuts'], always_eats_foods: ['toast'] },
  { id: 'k-leo', name: 'Leo', age: 6 },
];

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({
    kids,
    kidsHydrated: true,
    kidsLoadError: null,
    refreshKids: vi.fn(async () => {}),
    setActiveKid: vi.fn(),
    addKid: vi.fn(async () => true),
    updateKid: vi.fn(async () => true),
    deleteKid: vi.fn(async () => true),
  }),
  usePlan: () => ({ planEntries: [] }),
  useFoods: () => ({ foods: [{ id: 'f-carrot', name: 'Carrot' }] }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'u1', householdId: 'h1' }),
}));

vi.mock('@/hooks/useSignedProfilePicture', () => ({
  useSignedProfilePicture: (src?: string) => src,
}));

const ladderRows = [
  { kid_id: 'k-maya', food_id: 'f-carrot', status: 'active', current_rung: 'tiny_taste', last_attempt_at: null },
];

function query(result: { data: unknown; error: null }) {
  const chain = {
    select: () => chain,
    in: () => chain,
    gte: () => chain,
    eq: () => chain,
    order: () => chain,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) =>
      query({ data: table === 'kid_food_ladder' ? ladderRows : [], error: null }),
    storage: { from: () => ({}) },
  },
}));

import Kids from './Kids';

describe('Kids page progress wiring', () => {
  it('names a ladder food from the foods list, not the "A food" fallback', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <Kids />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(await screen.findByText('Carrot')).toBeInTheDocument();
    expect(screen.queryByText('A food')).not.toBeInTheDocument();
  });

  it('lists each child and folds allergens into the household strip', () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <Kids />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Household allergies', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByText('Maya').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Leo').length).toBeGreaterThan(0);
  });
});
