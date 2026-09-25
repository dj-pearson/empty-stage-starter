/**
 * Cross-module contract test for the Food Chaining page body.
 *
 * FoodChainingRecommendations.test.tsx stubs the scorer, the anchor hook and
 * the Win Network panel so each branch can be driven directly. This file keeps
 * them all real (useChainAnchors -> buildChainAnchors, scoreChainCandidates,
 * selectHandoffCandidates, WinNetworkPanel -> fetchTopChainNetworkTargets ->
 * filterNetworkTargetsForKid) and mocks only the edges: Supabase, contexts and
 * the ladder hook. It pins the contracts that cross those modules:
 *   - an always-eats name becomes the anchor, and the real scorer offers a
 *     pantry neighbour of it;
 *   - the allergen floor holds for both suggestion sources on an untagged
 *     name ("Peanut butter pasta", "peanut noodles");
 *   - the panel's onStartFood(foodId, kidId, pairedSafeFoodId) reaches
 *     useFoodLadder.startFood(foodId, { pairedSafeFoodId, kidId }).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food, Kid } from '@/types';

const h = vi.hoisted(() => ({
  foods: [] as Food[],
  startFood: vi.fn(),
  rpc: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/analytics', () => ({ analytics: { trackEvent: vi.fn() } }));
vi.mock('@/hooks/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('@/hooks/useCommon', () => ({ useOnline: () => true }));

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: h.foods, addFood: vi.fn(async () => true), foodsHydrated: true }),
  useKids: () => ({ kidsHydrated: true }),
  usePlan: () => ({ planEntries: [] }),
}));

vi.mock('@/contexts/PlanContext', () => ({
  usePlan: () => ({ planEntries: [], addPlanEntry: vi.fn(), deletePlanEntry: vi.fn() }),
}));

// Same loading shape as the real hook: false on first render, true while the
// load runs, then false with the rows.
vi.mock('@/hooks/useFoodLadder', () => ({
  useFoodLadder: () => {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    useEffect(() => {
      if (done) return;
      setLoading(true);
      const id = setTimeout(() => {
        setLoading(false);
        setDone(true);
      }, 0);
      return () => clearTimeout(id);
    }, [done]);
    return { rows: [], loading, startFood: h.startFood, removeFromLadder: vi.fn() };
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const empty = { data: [], error: null };
  return {
    supabase: {
      rpc: (...args: unknown[]) => h.rpc(...args),
      from: () => ({
        select: () => ({
          eq: async () => empty,
          in: async () => empty,
        }),
      }),
    },
  };
});

import { FoodChainingRecommendations } from './FoodChainingRecommendations';
import { clearChainNetworkTargetsCache } from '@/lib/chainNetwork';

function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return { id, name, category: 'carb', is_safe: false, is_try_bite: false, allergens: [], ...extra };
}

const PASTA = food('f-pasta', 'Plain pasta');
const BUTTERED = food('f-butter', 'Buttered pasta');
const PB_PASTA = food('f-pb', 'Peanut butter pasta');

const KID: Kid = {
  id: 'kid-1',
  name: 'Maya',
  allergens: ['peanut'],
  always_eats_foods: ['Plain pasta'],
};

function networkRow(key: string) {
  return {
    target_food_key: key,
    pickiness_bucket: 'unknown',
    success_count: 8,
    partial_count: 0,
    refused_count: 2,
    total_count: 10,
    success_rate: '80.0',
    last_observed_at: '2026-09-01T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearChainNetworkTargetsCache();
  h.foods = [PASTA, BUTTERED, PB_PASTA];
  h.startFood.mockResolvedValue({ ok: false, reason: 'duplicate' });
  h.rpc.mockImplementation(async (name: string) => {
    if (name === 'fetch_chain_network_targets') {
      return { data: [networkRow('buttered pasta'), networkRow('peanut noodles')], error: null };
    }
    return { data: [], error: null };
  });
});

describe('FoodChainingRecommendations (real scorer, anchors and Win Network)', () => {
  it('suggests a real pantry neighbour, holds the allergen floor, and starts through the ladder contract', async () => {
    render(
      <MemoryRouter>
        <FoodChainingRecommendations kid={KID} />
      </MemoryRouter>,
    );

    // Anchor from always_eats_foods (a name, resolved to the household food).
    const anchorChip = await screen.findByRole('button', { name: /Plain pasta/ });
    expect(anchorChip).toHaveAttribute('aria-pressed', 'true');

    // Real scorer: shares "pasta". The untagged peanut food never shows.
    const chain = await screen.findByRole('list', { name: 'Next links from Plain pasta' });
    expect(await within(chain).findByText('Buttered pasta')).toBeInTheDocument();
    expect(screen.queryByText('Peanut butter pasta')).not.toBeInTheDocument();

    // Win Network asked for the anchor's name, and hid the name-only hit.
    const wins = await screen.findByRole('region', { name: "Other families' wins" });
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith(
        'fetch_chain_network_targets',
        expect.objectContaining({ p_source_food_name: 'Plain pasta', p_limit: 25 }),
      ),
    );
    expect(await within(wins).findByText('Buttered pasta')).toBeInTheDocument();
    expect(within(wins).queryByText(/peanut noodles/i)).not.toBeInTheDocument();
    expect(within(wins).getByText("1 food hidden for Maya's allergies.")).toBeInTheDocument();

    // Panel -> page -> useFoodLadder.startFood: argument order and keys agree.
    fireEvent.click(within(wins).getByRole('button', { name: "Start Buttered pasta on Maya's ladder" }));
    await waitFor(() =>
      expect(h.startFood).toHaveBeenCalledWith('f-butter', { pairedSafeFoodId: 'f-pasta', kidId: 'kid-1' }),
    );
  });
});
