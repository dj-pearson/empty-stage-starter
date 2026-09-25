import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Food, Kid } from '@/types';
import type { LadderRow } from '@/hooks/useFoodLadder';
import { ladderRow } from './ladderTestFixtures';
import { localIsoDate, addDays } from './ladderDates';

const h = vi.hoisted(() => ({
  rowsByKid: {} as Record<string, LadderRow[]>,
  foods: [] as Food[],
  setActiveKid: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/hooks/useFoodLadder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useFoodLadder')>()),
  useFoodLadder: (kidId: string) => ({
    rows: h.rowsByKid[kidId] ?? [],
    loading: false,
    error: null,
    logAttempt: vi.fn(),
    undoLog: vi.fn(),
  }),
}));
vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: h.foods }),
  useKids: () => ({ kids: [], activeKidId: null, setActiveKid: h.setActiveKid }),
}));

import { FamilyLadderSummary } from './FamilyLadderSummary';

const maya: Kid = { id: 'kid-1', name: 'Maya', allergens: [] };
const leo: Kid = { id: 'kid-2', name: 'Leo', allergens: [] };

const today = localIsoDate();

beforeEach(() => {
  h.setActiveKid.mockReset();
  h.foods = ['Peas', 'Carrot', 'Rice', 'Kiwi'].map((name, i) => ({
    id: `food-${i + 1}`,
    name,
    category: 'vegetable',
    is_safe: false,
    is_try_bite: true,
  })) as Food[];
  h.rowsByKid = {};
});

describe('FamilyLadderSummary', () => {
  it('renders at most two due or close foods per kid', () => {
    h.rowsByKid['kid-1'] = [
      ladderRow({ id: 'r1', kidId: 'kid-1', foodId: 'food-1', nextDueOn: today }),
      ladderRow({ id: 'r2', kidId: 'kid-1', foodId: 'food-2', nextDueOn: today }),
      ladderRow({ id: 'r3', kidId: 'kid-1', foodId: 'food-3', nextDueOn: today }),
      ladderRow({
        id: 'r4',
        kidId: 'kid-1',
        foodId: 'food-4',
        currentRung: 'full_portion',
        nextDueOn: addDays(today, 3),
      }),
    ];
    h.rowsByKid['kid-2'] = [
      ladderRow({
        id: 'r5',
        kidId: 'kid-2',
        foodId: 'food-4',
        currentRung: 'full_portion',
        consecutiveSuccesses: 1,
        nextDueOn: addDays(today, 2),
      }),
    ];

    render(<FamilyLadderSummary kids={[maya, leo]} />);

    const mayaBlock = screen.getByRole('region', { name: /Maya/ });
    expect(within(mayaBlock).getAllByTestId('family-ladder-food')).toHaveLength(2);
    expect(within(mayaBlock).getByText(/2 more foods on the ladder/)).toBeInTheDocument();

    const leoBlock = screen.getByRole('region', { name: /Leo/ });
    expect(within(leoBlock).getAllByTestId('family-ladder-food')).toHaveLength(1);
    expect(within(leoBlock).getByText('Kiwi')).toBeInTheDocument();
  });

  it('tapping a kid name calls setActiveKid', async () => {
    h.rowsByKid['kid-2'] = [ladderRow({ id: 'r1', kidId: 'kid-2', nextDueOn: today })];
    render(<FamilyLadderSummary kids={[maya, leo]} />);
    await userEvent.setup().click(screen.getByRole('button', { name: "Open Leo's foods" }));
    expect(h.setActiveKid).toHaveBeenCalledWith('kid-2');
  });

  it('shows the kid picker when no kid has ladder rows', async () => {
    render(<FamilyLadderSummary kids={[maya, leo]} />);
    expect(await screen.findByText(/No foods are on a ladder yet/)).toBeInTheDocument();
    expect(screen.queryAllByTestId('family-ladder-food')).toHaveLength(0);
    await userEvent.setup().click(screen.getByRole('button', { name: /Maya/ }));
    expect(h.setActiveKid).toHaveBeenCalledWith('kid-1');
  });
});
