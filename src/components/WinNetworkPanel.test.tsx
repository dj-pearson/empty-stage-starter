import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';
import type { ChainNetworkFetchResult, ChainNetworkTarget } from '@/lib/chainNetwork';
import type { StartFoodResult } from '@/hooks/useFoodLadder';

const h = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() });
  return {
    toast,
    fetch: vi.fn(),
    track: vi.fn(),
  };
});

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/hooks/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('@/lib/analytics', () => ({ analytics: { trackEvent: h.track } }));
vi.mock('@/lib/chainNetwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/chainNetwork')>();
  return {
    ...actual,
    fetchTopChainNetworkTargets: (...args: unknown[]) => h.fetch(...args),
  };
});

import { WinNetworkPanel, type WinNetworkPanelProps } from './WinNetworkPanel';

function target(over: Partial<ChainNetworkTarget> & { targetFoodKey: string }): ChainNetworkTarget {
  return {
    pickinessBucket: 'high',
    successCount: 9,
    partialCount: 0,
    refusedCount: 1,
    totalCount: 10,
    successRate: 90,
    lastObservedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function food(id: string, name: string, allergens: string[] = []): Food {
  return { id, name, allergens, category: 'carb', is_safe: true, is_try_bite: false } as Food;
}

const kidA = {
  id: 'kid-a',
  name: 'Maya',
  allergens: ['peanuts'],
  pickiness_level: 'very_picky',
};
const kidB = { id: 'kid-b', name: 'Leo', allergens: [], pickiness_level: 'very_picky' };

function props(over: Partial<WinNetworkPanelProps> = {}): WinNetworkPanelProps {
  return {
    kid: kidA,
    sourceFoodId: 'pasta',
    sourceFoodName: 'Plain pasta',
    foods: [food('pasta', 'Plain pasta'), food('bp', 'Buttered pasta')],
    ladderFoodIds: [],
    onStartFood: vi.fn(async (): Promise<StartFoodResult> => ({ ok: false, reason: 'error' })),
    onCreateFood: vi.fn(async () => null),
    ...over,
  };
}

function answer(rows: ChainNetworkTarget[]): ChainNetworkFetchResult {
  return { ok: true, rows };
}

function renderPanel(p: WinNetworkPanelProps) {
  return render(
    <MemoryRouter>
      <WinNetworkPanel {...p} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.fetch.mockReset();
  h.track.mockReset();
  h.toast.mockReset();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
});

describe('WinNetworkPanel', () => {
  it("'Try this' on a household food starts it for this kid, and toasts only on ok", async () => {
    h.fetch.mockResolvedValue(answer([target({ targetFoodKey: 'buttered pasta' })]));
    const onStartFood = vi
      .fn<WinNetworkPanelProps['onStartFood']>()
      .mockResolvedValueOnce({ ok: false, reason: 'error' })
      .mockResolvedValueOnce({ ok: true, row: {} as never });
    renderPanel(props({ onStartFood }));

    const button = await screen.findByRole('button', {
      name: "Start Buttered pasta on Maya's ladder",
    });
    fireEvent.click(button);
    await waitFor(() => expect(onStartFood).toHaveBeenCalledWith('bp', 'kid-a', 'pasta'));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.track).not.toHaveBeenCalledWith('picky_win_chain_adopted', expect.anything());

    fireEvent.click(button);
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledTimes(1));
    expect(h.track).toHaveBeenCalledWith('picky_win_chain_adopted', expect.anything());
  });

  it("shows 'On ladder' with a tracker link when the food is already on the ladder", async () => {
    h.fetch.mockResolvedValue(answer([target({ targetFoodKey: 'buttered pasta' })]));
    renderPanel(props({ ladderFoodIds: ['bp'] }));
    const link = await screen.findByRole('link', { name: 'Open Buttered pasta on the ladder' });
    expect(link.getAttribute('href')).toBe('/dashboard/food-tracker?food=bp');
    expect(screen.queryByRole('button', { name: /Start Buttered pasta/ })).toBeNull();
  });

  it('creates an unknown food, then starts it', async () => {
    h.fetch.mockResolvedValue(answer([target({ targetFoodKey: 'cheesy rice' })]));
    const created = food('new-1', 'Cheesy rice');
    const onCreateFood = vi.fn(async () => created);
    const onStartFood = vi.fn(
      async (): Promise<StartFoodResult> => ({ ok: true, row: {} as never })
    );
    // A kid with no allergens: an unresolved name is only shown when nothing can hit.
    renderPanel(props({ kid: kidB, onCreateFood, onStartFood }));

    const button = await screen.findByRole('button', {
      name: "Add Cheesy rice to your foods and start it on Leo's ladder",
    });
    expect(button.textContent).toBe('Add and start');
    fireEvent.click(button);
    await waitFor(() => expect(onStartFood).toHaveBeenCalledWith('new-1', 'kid-b', 'pasta'));
    expect(onCreateFood).toHaveBeenCalledWith('Cheesy rice');
    expect(h.toast.success).toHaveBeenCalledTimes(1);
  });

  it('does not render an allergen-hit target and says how many were hidden', async () => {
    h.fetch.mockResolvedValue(
      answer([
        target({ targetFoodKey: 'peanut butter toast' }),
        target({ targetFoodKey: 'buttered pasta', successCount: 7 }),
      ])
    );
    renderPanel(props({ foods: [...props().foods, food('pbt', 'Peanut butter toast')] }));
    await screen.findByText('Buttered pasta');
    expect(screen.queryByText(/Peanut butter toast/i)).toBeNull();
    expect(screen.getByText("1 food hidden for Maya's allergies.")).toBeTruthy();
  });

  it('shows a profile link and fetches nothing when allergies were never set', async () => {
    renderPanel(props({ kid: { ...kidA, allergens: undefined } }));
    expect(await screen.findByRole('link', { name: 'Set allergies' })).toBeTruthy();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('shows a retry line on error instead of early days', async () => {
    h.fetch.mockResolvedValueOnce({ ok: false });
    h.fetch.mockResolvedValueOnce(answer([]));
    renderPanel(props());
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText(/Early days/)).toBeNull();
    fireEvent.click(retry);
    expect(await screen.findByText(/Early days/)).toBeTruthy();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not show kid A's rows after the kid prop changes", async () => {
    h.fetch.mockResolvedValueOnce(answer([target({ targetFoodKey: 'buttered pasta' })]));
    let resolveB: (v: ChainNetworkFetchResult) => void = () => {};
    h.fetch.mockReturnValueOnce(new Promise((r) => (resolveB = r)));
    const { rerender } = renderPanel(props());
    await screen.findByText('Buttered pasta');

    rerender(
      <MemoryRouter>
        <WinNetworkPanel {...props({ kid: kidB })} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Buttered pasta')).toBeNull();

    resolveB(answer([target({ targetFoodKey: 'fish sticks' })]));
    expect(await screen.findByText('Fish sticks')).toBeTruthy();
  });

  it('sends one card-shown event per distinct set of rows', async () => {
    h.fetch.mockResolvedValue(answer([target({ targetFoodKey: 'buttered pasta' })]));
    const { rerender } = renderPanel(props());
    await screen.findByText('Buttered pasta');
    rerender(
      <MemoryRouter>
        <WinNetworkPanel {...props()} />
      </MemoryRouter>
    );
    const shown = h.track.mock.calls.filter((c) => c[0] === 'picky_win_card_shown');
    expect(shown).toHaveLength(1);
    expect(shown[0][1]).toMatchObject({ target_count: 1, keys: ['buttered pasta'] });
  });

  it('renders no raw palette color classes', async () => {
    h.fetch.mockResolvedValue(
      answer([target({ targetFoodKey: 'buttered pasta' }), target({ targetFoodKey: 'plain rice' })])
    );
    const { container } = renderPanel(props({ kid: kidB }));
    await screen.findByText('Buttered pasta');
    expect(container.innerHTML).not.toMatch(
      /\b(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:emerald|amber|rose|red|green|blue|yellow|orange|purple|pink|slate|gray|zinc|neutral|stone|lime|teal|cyan|sky|indigo|violet|fuchsia)-\d{2,3}\b/
    );
    expect(container.querySelector('section h2')).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/\bcapitalize\b/);
  });
});
