import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Food, Kid } from '@/types';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  foods: [] as Food[],
}));
vi.mock('sonner', () => ({
  toast: Object.assign(h.toast, { success: h.toastSuccess, error: h.toastError }),
}));
vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: h.foods }),
  usePlan: () => ({ planEntries: [] }),
}));

import { LadderFoodPicker } from './LadderFoodPicker';
import { ladderRow } from './ladderTestFixtures';
import { localIsoDate, addDays } from './ladderDates';
import type { StartFoodResult } from '@/hooks/useFoodLadder';

const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  id,
  name,
  category: 'protein',
  is_safe: false,
  is_try_bite: false,
  ...extra,
});

const kid: Kid = { id: 'kid-1', name: 'Maya', allergens: ['dairy'], disliked_foods: ['Beans'] };

interface ToastOptions {
  action?: { label: string; onClick: () => void };
}

function setup(startResult: StartFoodResult, rows = [ladderRow({ foodId: 'peas', currentRung: 'touching' })]) {
  const startFood = vi.fn().mockResolvedValue(startResult);
  const onJump = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <LadderFoodPicker
      open
      onOpenChange={onOpenChange}
      kid={kid}
      rows={rows}
      masteryCandidates={[]}
      startFood={startFood}
      onJump={onJump}
    />
  );
  return { startFood, onJump, onOpenChange, user: userEvent.setup() };
}

const option = (name: RegExp) => screen.getByRole('option', { name });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  h.toast.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.foods = [
    food('cheese', 'Cheese', { allergens: ['milk'] }),
    food('peas', 'Peas'),
    food('carrot', 'Carrot', { is_try_bite: true }),
    food('beans', 'Beans'),
  ];
});

describe('LadderFoodPicker', () => {
  it('flags a milk food for a dairy-allergic kid and needs a confirm before starting', async () => {
    const { startFood, user } = setup({ ok: true, row: ladderRow({ foodId: 'cheese' }) });
    const cheese = option(/Cheese/);
    expect(cheese).toHaveTextContent('Contains milk');

    await user.click(cheese);
    expect(startFood).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Cheese contains milk');

    await user.click(screen.getByRole('button', { name: 'Start anyway' }));
    await waitFor(() =>
      expect(startFood).toHaveBeenCalledWith('cheese', { pairedSafeFoodId: null, kidId: 'kid-1' })
    );
  });

  it('shows the rung for a food already on the ladder and jumps instead of starting it', async () => {
    const { startFood, onJump, user } = setup({ ok: false, reason: 'duplicate' });
    const peas = option(/Peas/);
    expect(peas).toHaveTextContent('On the ladder: Touching');
    await user.click(peas);
    expect(onJump).toHaveBeenCalledWith('peas');
    expect(startFood).not.toHaveBeenCalled();
  });

  it('groups try-bite foods ahead of everything else and tags a dislike neutrally', () => {
    setup({ ok: false, reason: 'error' });
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Try-bite foods')).toBeLessThan(text.indexOf('Everything else'));
    expect(option(/Beans/)).toHaveTextContent('Disliked');
  });

  it('matches a search on the allergen name', async () => {
    const { user } = setup({ ok: false, reason: 'error' });
    await user.type(screen.getByRole('combobox'), 'milk');
    await waitFor(() => expect(screen.queryByRole('option', { name: /Carrot/ })).toBeNull());
    expect(option(/Cheese/)).toBeInTheDocument();
  });

  it('turns a duplicate into "Already on the ladder" with a jump', async () => {
    const { onJump, user } = setup({ ok: false, reason: 'duplicate' }, []);
    await user.click(option(/Carrot/));
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    const [message, options] = h.toast.mock.calls[0] as [string, ToastOptions];
    expect(message).toBe('Already on the ladder');
    options.action?.onClick();
    expect(onJump).toHaveBeenCalledWith('carrot');
  });

  it('explains the per-day cap with the date it will start', async () => {
    const { user } = setup({ ok: false, reason: 'cap' }, []);
    await user.click(option(/Carrot/));
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(h.toast.mock.calls[0][0]).toBe(
      'Three foods are already due today; starting it tomorrow'
    );
  });

  it('uses the same cap message when the hook slid the start to a later day', async () => {
    const later = addDays(localIsoDate(), 1);
    const { user } = setup({ ok: true, row: ladderRow({ foodId: 'carrot', nextDueOn: later }) }, []);
    await user.click(option(/Carrot/));
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(h.toast.mock.calls[0][0]).toBe(
      'Three foods are already due today; starting it tomorrow'
    );
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });
});
