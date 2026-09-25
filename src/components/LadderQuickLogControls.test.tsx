import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(h.toast, { success: h.toastSuccess, error: h.toastError }),
}));

import { LadderQuickLogControls } from './LadderQuickLogControls';
import { ladderRow } from './foodTracker/ladderTestFixtures';
import type { LogResult } from '@/hooks/useFoodLadder';

interface ToastOptions {
  action?: { label: string; onClick: () => void };
}

function setup(result: LogResult) {
  const row = ladderRow();
  const onLog = vi.fn().mockResolvedValue(result);
  const onUndo = vi.fn().mockResolvedValue(true);
  render(
    <LadderQuickLogControls
      row={row}
      foodName="Peas"
      kidName="Maya"
      onLog={onLog}
      onUndo={onUndo}
    />
  );
  return { row, onLog, onUndo, user: userEvent.setup() };
}

beforeEach(() => {
  h.toast.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe('LadderQuickLogControls', () => {
  it('renders 44px buttons with one localized aria-label each', () => {
    setup({ ok: true, attemptId: 'a1', previous: null, ladderSynced: true });
    const buttons = [
      screen.getByRole('button', { name: 'Log Took it for Peas' }),
      screen.getByRole('button', { name: 'Log Partway for Peas' }),
      screen.getByRole('button', { name: 'Log Not today for Peas' }),
    ];
    for (const button of buttons) {
      expect(button.className).toContain('min-h-11');
      expect(button.getAttribute('aria-label')).not.toMatch(/\u2014/);
    }
    // "Not today" is neutral, never the destructive variant.
    expect(buttons[2].className).not.toContain('bg-destructive');
  });

  it('logs through onLog and offers an Undo that calls undoLog with the attempt', async () => {
    const { row, onLog, onUndo, user } = setup({
      ok: true,
      attemptId: 'attempt-9',
      previous: ladderRow({ id: 'row-1', currentRung: 'looking' }),
      ladderSynced: true,
    });

    await user.click(screen.getByRole('button', { name: 'Log Took it for Peas' }));

    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({ row, foodId: 'food-1', result: 'accepted' })
    );
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
    const [message, options] = h.toastSuccess.mock.calls[0] as [string, ToastOptions];
    expect(message).toBe('Logged Peas for Maya');
    expect(options.action?.label).toBe('Undo');

    options.action?.onClick();
    expect(onUndo).toHaveBeenCalledWith({
      attemptId: 'attempt-9',
      previous: ladderRow({ id: 'row-1', currentRung: 'looking' }),
    });
  });

  it('announces the result in a polite live region', async () => {
    const { user } = setup({ ok: true, attemptId: 'a1', previous: null, ladderSynced: true });
    await user.click(screen.getByRole('button', { name: 'Log Partway for Peas' }));
    const region = await screen.findByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(region.textContent).toMatch(/^Peas: Partway\. /));
  });

  it('shows the pending toast, not the failure toast, when the ladder did not sync', async () => {
    const { user } = setup({ ok: true, attemptId: 'a1', previous: null, ladderSynced: false });
    await user.click(screen.getByRole('button', { name: 'Log Took it for Peas' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(h.toast.mock.calls[0][0]).toBe(
      "Saved. Peas's step will update when the connection catches up."
    );
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('says nothing extra when the plan limit stopped the log', async () => {
    const { user } = setup({ ok: false, reason: 'limit' });
    await user.click(screen.getByRole('button', { name: 'Log Took it for Peas' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log Took it for Peas' })).toBeEnabled());
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('opens the detail sheet from Add detail', async () => {
    const { user } = setup({ ok: true, attemptId: 'a1', previous: null, ladderSynced: true });
    await user.click(screen.getByRole('button', { name: 'Add detail for Peas' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('How did Peas go?')).toBeInTheDocument();
  });
});
