import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';

const h = vi.hoisted(() => ({
  logAttempt: vi.fn(),
  activeKidId: 'kid-1' as string | null,
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({
    activeKidId: h.activeKidId,
    kids: [{ id: 'kid-1', name: 'Maya', allergens: [] }],
  }),
  useFoods: () => ({
    foods: [
      { id: 'food-1', name: 'Broccoli', category: 'vegetable', is_try_bite: true },
      { id: 'food-2', name: 'Peas', category: 'vegetable' },
    ],
  }),
}));
vi.mock('@/hooks/useFoodLadder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useFoodLadder')>()),
  useFoodLadder: () => ({ logAttempt: h.logAttempt }),
}));
vi.mock('@/components/foodTracker/FoodHistoryList', () => ({
  FoodHistoryList: () => <div data-testid="history-list" />,
}));

import { FoodSuccessTracker } from './FoodSuccessTracker';

function renderTracker() {
  return render(
    <MemoryRouter>
      <FoodSuccessTracker />
    </MemoryRouter>
  );
}

function openAndFill() {
  fireEvent.click(screen.getByRole('button', { name: 'Log attempt' }));
  fireEvent.click(screen.getByRole('button', { name: /Broccoli/ }));
  fireEvent.click(screen.getByRole('radio', { name: 'Took it' }));
}

beforeEach(() => {
  h.logAttempt.mockReset();
  h.activeKidId = 'kid-1';
});

describe('FoodSuccessTracker (legacy view)', () => {
  it('renders the per-food history instead of the old stat tiles', () => {
    renderTracker();
    expect(screen.getByTestId('history-list')).toBeInTheDocument();
    expect(screen.queryByText('Success Rate')).not.toBeInTheDocument();
    expect(screen.queryByText('Tantrum Only')).not.toBeInTheDocument();
  });

  it('renders nothing without an active kid (the page gates that)', () => {
    h.activeKidId = null;
    const { container } = renderTracker();
    expect(container).toBeEmptyDOMElement();
  });

  it('preselects no result, so Save stays off until one is picked', () => {
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: 'Log attempt' }));
    fireEvent.click(screen.getByRole('button', { name: /Broccoli/ }));
    for (const name of ['Took it', 'Partway', 'Not today']) {
      expect(screen.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.getByRole('button', { name: 'Save attempt' })).toBeDisabled();
  });

  it('saves through logAttempt with null mood and amount, and the reaction note', async () => {
    h.logAttempt.mockResolvedValue({ ok: true, attemptId: 'a1', previous: null, ladderSynced: true });
    renderTracker();
    openAndFill();
    fireEvent.change(screen.getByLabelText('Reaction'), { target: { value: 'Gagged once' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save attempt' }));
    });

    expect(h.logAttempt).toHaveBeenCalledTimes(1);
    const args = h.logAttempt.mock.calls[0][0];
    expect(args).toMatchObject({ foodId: 'food-1', result: 'accepted', hardTime: false });
    expect(args.details).toMatchObject({
      reactionNotes: 'Gagged once',
      moodBefore: null,
      moodAfter: null,
      amountConsumed: null,
      bitesTaken: null,
    });
    expect(args).not.toHaveProperty('stage');
  });

  it('calls logAttempt once on a double click', async () => {
    let resolve: (v: unknown) => void = () => {};
    h.logAttempt.mockImplementation(() => new Promise((r) => (resolve = r)));
    renderTracker();
    openAndFill();
    const save = screen.getByRole('button', { name: 'Save attempt' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(h.logAttempt).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true, attemptId: 'a1', previous: null, ladderSynced: true });
    });
  });

  it('keeps what was typed when the dialog is dismissed without saving', () => {
    renderTracker();
    openAndFill();
    fireEvent.change(screen.getByLabelText('Reaction'), { target: { value: 'Rash' } });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Log attempt' }));
    expect(screen.getByLabelText('Reaction')).toHaveValue('Rash');
  });

  it('uses no palette classes', () => {
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: 'Log attempt' }));
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/text-yellow|bg-gray|text-white|bg-yellow|text-orange|from-yellow/);
  });
});
