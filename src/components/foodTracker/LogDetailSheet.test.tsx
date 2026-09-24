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

import { LogDetailSheet } from './LogDetailSheet';
import { draftKey } from './logDetailDraft';
import { ladderRow } from './ladderTestFixtures';
import type { LogAttemptArgs, LogResult } from '@/hooks/useFoodLadder';

const row = ladderRow();
const OK: LogResult = { ok: true, attemptId: 'a1', previous: row, ladderSynced: true };

function renderSheet(onLog = vi.fn<(args: LogAttemptArgs) => Promise<LogResult>>().mockResolvedValue(OK)) {
  const onOpenChange = vi.fn();
  const props = {
    row,
    foodName: 'Peas',
    kidName: 'Maya',
    onLog,
    onOpenChange,
  };
  const utils = render(<LogDetailSheet open {...props} />);
  const reopen = () => {
    utils.rerender(<LogDetailSheet open={false} {...props} />);
    utils.rerender(<LogDetailSheet open {...props} />);
  };
  return { ...utils, onLog, onOpenChange, reopen, props, user: userEvent.setup() };
}

const save = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  sessionStorage.clear();
  h.toast.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe('LogDetailSheet', () => {
  it('keeps Save disabled until a result is picked, with none preselected', async () => {
    const { user } = renderSheet();
    for (const name of ['Took it', 'Partway', 'Not today']) {
      expect(screen.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'false');
    }
    expect(save()).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Partway' }));
    expect(save()).toBeEnabled();
  });

  it('sends an unset mood and amount as null, not a default', async () => {
    const { user, onLog } = renderSheet();
    await user.click(screen.getByRole('radio', { name: 'Took it' }));
    await user.click(save());
    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    const args = onLog.mock.calls[0][0];
    expect(args).toMatchObject({ row, foodId: 'food-1', result: 'accepted', hardTime: false });
    expect(args.details).toMatchObject({
      moodBefore: null,
      moodAfter: null,
      amountConsumed: null,
      reactionNotes: null,
      parentNotes: null,
      isMilestone: false,
    });
  });

  it('appends reaction chips to the reaction note', async () => {
    const { user } = renderSheet();
    const note = screen.getByLabelText('Any reaction?');
    await user.click(screen.getByRole('button', { name: 'Add "Gagged" to the reaction note' }));
    expect(note).toHaveValue('Gagged');
    await user.click(screen.getByRole('button', { name: 'Add "Rash" to the reaction note' }));
    expect(note).toHaveValue('Gagged, rash');
  });

  it('sends hardTime true when Hard time is switched on', async () => {
    const { user, onLog } = renderSheet();
    await user.click(screen.getByRole('radio', { name: 'Not today' }));
    await user.click(screen.getByRole('switch', { name: 'Hard time' }));
    await user.click(screen.getByRole('checkbox', { name: 'First time ever' }));
    await user.click(save());
    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    expect(onLog.mock.calls[0][0]).toMatchObject({ hardTime: true, result: 'refused' });
    expect(onLog.mock.calls[0][0].details).toMatchObject({ isMilestone: true });
  });

  it('keeps the draft across close and reopen, and clears it once the log lands', async () => {
    const { user, reopen, onOpenChange } = renderSheet();
    await user.type(screen.getByLabelText('Any reaction?'), 'went pale');
    expect(sessionStorage.getItem(draftKey('kid-1', 'food-1'))).toContain('went pale');

    reopen();
    await waitFor(() => expect(screen.getByLabelText('Any reaction?')).toHaveValue('went pale'));

    await user.click(screen.getByRole('radio', { name: 'Took it' }));
    await user.click(save());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(sessionStorage.getItem(draftKey('kid-1', 'food-1'))).toBeNull();
  });

  it('keeps the draft when the log fails', async () => {
    const onLog = vi.fn<(args: LogAttemptArgs) => Promise<LogResult>>().mockResolvedValue({
      ok: false,
      reason: 'error',
    });
    const { user } = renderSheet(onLog);
    await user.type(screen.getByLabelText('Note for yourself'), 'at grandma');
    await user.click(screen.getByRole('radio', { name: 'Took it' }));
    await user.click(save());
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(sessionStorage.getItem(draftKey('kid-1', 'food-1'))).toContain('at grandma');
  });

  it('says the draft was kept when dismissed with text', async () => {
    const { user, onOpenChange } = renderSheet();
    await user.type(screen.getByLabelText('Any reaction?'), 'coughed');
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(h.toast).toHaveBeenCalledWith('Draft kept');
  });
});
