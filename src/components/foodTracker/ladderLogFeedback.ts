/**
 * What a parent is told after a ladder log, shared by the one-tap controls
 * and the detail sheet so both say the same thing the same way.
 */

import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import '@/i18n/appLocale';
import type { LadderRow, LogResult, QuickLogResult } from '@/hooks/useFoodLadder';

/** How long the Undo on a log stays offered. Matches MASTERY_UNDO_WINDOW_MS. */
export const LOG_UNDO_MS = 6000;

export type UndoLog = (args: { attemptId: string; previous: LadderRow | null }) => Promise<boolean>;

export function resultLabel(t: TFunction, result: QuickLogResult): string {
  switch (result) {
    case 'accepted':
      return t('foodTracker.ladderUi.result.accepted', { defaultValue: 'Took it' });
    case 'held':
      return t('foodTracker.ladderUi.result.held', { defaultValue: 'Partway' });
    default:
      return t('foodTracker.ladderUi.result.refused', { defaultValue: 'Not today' });
  }
}

/**
 * Toast for a finished log. Returns true when the log landed.
 *
 * - `limit`: the hook already raised the upgrade prompt; saying more here
 *   would stack two messages about the same thing.
 * - `in_flight`: a double tap. The first tap's toast is the answer.
 * - `ladderSynced: false`: the attempt is saved and the rung will catch up.
 *   That is not a failure and must not read like one.
 */
export function showLogFeedback(args: {
  t: TFunction;
  res: LogResult;
  kidName: string;
  foodName: string;
  onUndo?: UndoLog;
}): boolean {
  const { t, res, kidName, foodName, onUndo } = args;

  if (!res.ok) {
    if (res.reason === 'limit' || res.reason === 'in_flight') return false;
    toast.error(
      t('foodTracker.ladderUi.logFailed', {
        defaultValue: "That didn't save. Nothing was lost; try again in a moment.",
      })
    );
    return false;
  }

  const { attemptId, previous } = res;
  const action = onUndo
    ? {
        label: t('foodTracker.ladderUi.undo', { defaultValue: 'Undo' }),
        onClick: () => {
          void onUndo({ attemptId, previous }).then((undone) => {
            if (!undone) {
              toast.error(
                t('foodTracker.ladderUi.undoFailed', {
                  defaultValue: "Couldn't undo that just now. The log is still saved.",
                })
              );
            }
          });
        },
      }
    : undefined;

  if (!res.ladderSynced) {
    toast(
      t('foodTracker.ladderUi.savedLadderPending', {
        defaultValue: "Saved. {{food}}'s step will update when the connection catches up.",
        food: foodName,
      }),
      { duration: LOG_UNDO_MS, action }
    );
    return true;
  }

  toast.success(
    t('foodTracker.ladderUi.logged', {
      defaultValue: 'Logged {{food}} for {{kid}}',
      food: foodName,
      kid: kidName,
    }),
    { duration: LOG_UNDO_MS, action }
  );
  return true;
}
