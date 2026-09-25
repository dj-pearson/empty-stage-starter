import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food, Kid, PlanEntry } from '@/types';

interface ScoredLike {
  foodId: string;
  foodName: string;
  similarityScore: number;
  reasons: string[];
}

interface AnchorLike {
  foodId: string;
  name: string;
  source: 'always' | 'mastered' | 'reliable' | 'climbing' | 'household';
  ate?: number;
  tries?: number;
}

interface RpcRowLike {
  food_id: string;
  food_name: string;
  similarity_score: number | null;
  reasons: string[] | null;
}

type RpcAnswer = { data: RpcRowLike[] | null; error: unknown };

const h = vi.hoisted(() => ({
  foods: [] as Food[],
  planEntries: [] as PlanEntry[],
  anchors: [] as AnchorLike[],
  anchorStatus: 'ready' as 'loading' | 'ready' | 'error' | 'offline',
  retry: vi.fn(),
  startFood: vi.fn(),
  removeFromLadder: vi.fn(async () => true),
  addPlanEntry: vi.fn(),
  deletePlanEntry: vi.fn(async () => ({ error: null, removed: [] })),
  addFood: vi.fn(async () => true),
  /** Client scores per anchor id. */
  scores: new Map<string, ScoredLike[]>(),
  rpc: vi.fn(),
  insert: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: h.toast }));

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: h.foods, addFood: h.addFood }),
}));

vi.mock('@/contexts/PlanContext', () => ({
  usePlan: () => ({
    planEntries: h.planEntries,
    addPlanEntry: h.addPlanEntry,
    deletePlanEntry: h.deletePlanEntry,
  }),
}));

vi.mock('@/hooks/useFoodLadder', () => ({
  useFoodLadder: () => ({
    rows: [],
    loading: false,
    startFood: h.startFood,
    removeFromLadder: h.removeFromLadder,
  }),
}));

vi.mock('@/hooks/useChainAnchors', () => ({
  useChainAnchors: () => ({ status: h.anchorStatus, anchors: h.anchors, retry: h.retry }),
}));

vi.mock('@/lib/chainSimilarity', () => ({
  scoreChainCandidates: (anchor: { id: string }, pantry: readonly { id: string }[]) => {
    const ids = new Set(pantry.map((f) => f.id));
    return (h.scores.get(anchor.id) ?? []).filter((s) => ids.has(s.foodId));
  },
  mergeRpcSuggestions: (client: ScoredLike[], rows: readonly RpcRowLike[]) => {
    const out = [...client];
    for (const r of rows) {
      if (out.some((c) => c.foodId === r.food_id)) continue;
      out.push({
        foodId: r.food_id,
        foodName: r.food_name,
        similarityScore: r.similarity_score ?? 0,
        reasons: [],
      });
    }
    return out.sort((a, b) => b.similarityScore - a.similarityScore);
  },
  normalizeReason: (raw: string) =>
    ['taste', 'texture', 'color', 'shape', 'type'].includes(raw) ? raw : null,
  closenessLevel: (score: number) => (score >= 70 ? 'small' : score >= 50 ? 'medium' : 'big'),
}));

vi.mock('@/components/WinNetworkPanel', () => ({
  WinNetworkPanel: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: (table: string) => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
      insert: (...args: unknown[]) => h.insert(table, ...args),
    }),
  },
}));

import { FoodChainingRecommendations } from './FoodChainingRecommendations';

function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return { id, name, category: 'carb', is_safe: false, is_try_bite: false, allergens: [], ...extra };
}

function kidFixture(extra: Partial<Kid> = {}): Kid {
  return { id: 'kid-1', name: 'Maya', allergens: [], ...extra };
}

function scored(foodId: string, foodName: string, score: number, reasons: string[] = ['texture']): ScoredLike {
  return { foodId, foodName, similarityScore: score, reasons };
}

function renderIt(kid: Kid, targetFoodId: string | null = null) {
  return render(
    <MemoryRouter>
      <FoodChainingRecommendations kid={kid} targetFoodId={targetFoodId} />
    </MemoryRouter>,
  );
}

const PASTA = food('f-pasta', 'Plain pasta', { is_safe: true });

beforeEach(() => {
  vi.clearAllMocks();
  h.foods = [PASTA];
  h.planEntries = [];
  h.anchors = [{ foodId: PASTA.id, name: PASTA.name, source: 'always' }];
  h.anchorStatus = 'ready';
  h.scores = new Map();
  h.rpc.mockImplementation(async (): Promise<RpcAnswer> => ({ data: [], error: null }));
  h.startFood.mockResolvedValue({ ok: false, reason: 'error' });
  h.addPlanEntry.mockResolvedValue({ error: null, insertedIds: ['pe-1'] });
});

describe('FoodChainingRecommendations', () => {
  it('never shows a name-only peanut food to a peanut-allergic kid (severe)', async () => {
    const crackers = food('f-pb', 'Peanut butter crackers', { allergens: [] });
    const buttered = food('f-butter', 'Buttered pasta');
    h.foods = [PASTA, crackers, buttered];
    h.scores.set(PASTA.id, [scored(crackers.id, crackers.name, 95), scored(buttered.id, buttered.name, 80)]);

    renderIt(kidFixture({ allergens: ['peanut'], allergen_severity: { peanut: 'severe' } }));

    expect(await screen.findByText('Buttered pasta')).toBeInTheDocument();
    expect(screen.queryByText('Peanut butter crackers')).not.toBeInTheDocument();
    expect(screen.getByText(/Checked against Maya's allergies \(peanut\)/)).toBeInTheDocument();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
  });

  it('drops the peanut food when the allergy has no recorded severity', async () => {
    const crackers = food('f-pb', 'Peanut butter crackers', { allergens: [] });
    h.foods = [PASTA, crackers];
    h.scores.set(PASTA.id, [scored(crackers.id, crackers.name, 95)]);
    // RPC also returns it; that source must be filtered too.
    h.rpc.mockImplementation(async () => ({
      data: [{ food_id: crackers.id, food_name: crackers.name, similarity_score: 99, reasons: [] }],
      error: null,
    }));

    renderIt(kidFixture({ allergens: ['peanut'] }));

    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await screen.findByText(/Nothing in your pantry is close enough/);
    expect(screen.queryByText('Peanut butter crackers')).not.toBeInTheDocument();
  });

  it('renders at most 3 steps', async () => {
    const others = [1, 2, 3, 4, 5].map((n) => food(`f-${n}`, `Pasta step ${n}`));
    h.foods = [PASTA, ...others];
    h.scores.set(
      PASTA.id,
      others.map((f, i) => scored(f.id, f.name, 90 - i)),
    );

    renderIt(kidFixture());

    await screen.findByText('Pasta step 1');
    expect(screen.getAllByRole('button', { name: /on Maya's ladder/ })).toHaveLength(3);
    expect(screen.queryByText('Pasta step 4')).not.toBeInTheDocument();
  });

  it('starts the food on the ladder with the anchor paired and the kid captured', async () => {
    const buttered = food('f-butter', 'Buttered pasta');
    h.foods = [PASTA, buttered];
    h.scores.set(PASTA.id, [scored(buttered.id, buttered.name, 85)]);
    h.startFood.mockResolvedValue({ ok: true, row: { id: 'row-1', kidId: 'kid-1', foodId: buttered.id } });

    renderIt(kidFixture());

    fireEvent.click(await screen.findByRole('button', { name: "Start Buttered pasta on Maya's ladder" }));
    await waitFor(() =>
      expect(h.startFood).toHaveBeenCalledWith(buttered.id, { pairedSafeFoodId: PASTA.id, kidId: 'kid-1' }),
    );
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
  });

  it('shows the already-on-ladder copy on a duplicate', async () => {
    const buttered = food('f-butter', 'Buttered pasta');
    h.foods = [PASTA, buttered];
    h.scores.set(PASTA.id, [scored(buttered.id, buttered.name, 85)]);
    h.startFood.mockResolvedValue({ ok: false, reason: 'duplicate' });

    renderIt(kidFixture());

    fireEvent.click(await screen.findByRole('button', { name: "Start Buttered pasta on Maya's ladder" }));
    await waitFor(() =>
      expect(h.toast.info).toHaveBeenCalledWith('Buttered pasta is already on the ladder', expect.anything()),
    );
  });

  it('adds a try bite to the plan for the candidate kid', async () => {
    const buttered = food('f-butter', 'Buttered pasta');
    h.foods = [PASTA, buttered];
    h.scores.set(PASTA.id, [scored(buttered.id, buttered.name, 85)]);

    renderIt(kidFixture({ id: 'kid-7' }));

    fireEvent.click(await screen.findByRole('button', { name: "Add Buttered pasta to Maya's plan as a try bite" }));
    await waitFor(() => expect(h.addPlanEntry).toHaveBeenCalledTimes(1));
    expect(h.addPlanEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kid_id: 'kid-7', food_id: buttered.id, meal_slot: 'try_bite', result: null }),
    );
  });

  it('does not render a slow answer for anchor A after switching to anchor B', async () => {
    const nuggets = food('f-nug', 'Chicken nuggets', { is_safe: true });
    const stale = food('f-stale', 'Stale suggestion');
    const fresh = food('f-fresh', 'Fresh suggestion');
    h.foods = [PASTA, nuggets, stale, fresh];
    h.anchors = [
      { foodId: PASTA.id, name: PASTA.name, source: 'always' },
      { foodId: nuggets.id, name: nuggets.name, source: 'mastered' },
    ];
    let resolveA: (v: RpcAnswer) => void = () => {};
    h.rpc.mockImplementation((_fn: string, args: { source_food: string }) => {
      if (args.source_food === PASTA.id) {
        return new Promise<RpcAnswer>((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve({
        data: [{ food_id: fresh.id, food_name: fresh.name, similarity_score: 70, reasons: [] }],
        error: null,
      });
    });

    renderIt(kidFixture());

    fireEvent.click(screen.getByRole('button', { name: /Chicken nuggets/, pressed: false }));
    expect(await screen.findByText('Fresh suggestion')).toBeInTheDocument();

    await act(async () => {
      resolveA({
        data: [{ food_id: stale.id, food_name: stale.name, similarity_score: 99, reasons: [] }],
        error: null,
      });
    });

    expect(screen.queryByText('Stale suggestion')).not.toBeInTheDocument();
    expect(screen.getByText('Fresh suggestion')).toBeInTheDocument();
  });

  it('bridge mode with an allergen target shows only the pediatrician copy', async () => {
    const pb = food('f-pb', 'Peanut butter toast', { allergens: ['peanut'] });
    h.foods = [PASTA, pb];

    renderIt(kidFixture({ allergens: ['peanut'] }), pb.id);

    expect(await screen.findByText(/pediatrician/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start on ladder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start .* on Maya's ladder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add .* to Maya's plan/ })).not.toBeInTheDocument();
  });

  it('bridge mode starts the target paired with the chosen anchor', async () => {
    const sauce = food('f-sauce', 'Pasta with sauce');
    h.foods = [PASTA, sauce];
    h.scores.set(PASTA.id, [scored(sauce.id, sauce.name, 80)]);
    h.startFood.mockResolvedValue({ ok: true, row: { id: 'row-2', kidId: 'kid-1', foodId: sauce.id } });

    renderIt(kidFixture(), sauce.id);

    const row = (await screen.findByText('Start Pasta with sauce with Plain pasta')).closest('li');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /Start on ladder/ }));
    await waitFor(() =>
      expect(h.startFood).toHaveBeenCalledWith(sauce.id, { pairedSafeFoodId: PASTA.id, kidId: 'kid-1' }),
    );
  });

  it('never inserts into food_chain_suggestions, even with no suggestions', async () => {
    renderIt(kidFixture());
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await screen.findByText(/Nothing in your pantry is close enough/);
    expect(h.insert).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Generate/ })).not.toBeInTheDocument();
  });

  it('keeps suggestions visible with an inline notice when allergies are unknown', async () => {
    const buttered = food('f-butter', 'Buttered pasta');
    h.foods = [PASTA, buttered];
    h.scores.set(PASTA.id, [scored(buttered.id, buttered.name, 85)]);

    renderIt(kidFixture({ allergens: undefined }));

    expect(await screen.findByText(/allergies aren't recorded yet/)).toBeInTheDocument();
    expect(screen.getByText('Buttered pasta')).toBeInTheDocument();
  });

  it('shows an inline retry on an anchor load error', () => {
    h.anchorStatus = 'error';
    h.anchors = [];
    renderIt(kidFixture());
    const alert = screen.getByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(h.retry).toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});
