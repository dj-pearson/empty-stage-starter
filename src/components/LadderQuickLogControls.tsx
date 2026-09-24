/**
 * US-600: one-tap exposure logging, inline on a ladder row (web).
 *
 * The counterpart of the iOS `LadderQuickLogControls`. The detailed log asks
 * for mood, amount and notes, which is the right tool for a calm review and
 * the wrong one for 6pm on a Tuesday, when the exposure actually happens.
 * Because the row already knows the rung, the log collapses to three
 * buttons, with "Add detail" one tap away for the evenings that need it.
 *
 * Every tap goes through useFoodLadder.logAttempt, so the attempt row, the
 * rung, the plan-entry link, mastery and the plan-limit gate move together.
 *
 * Deliberately no "try again" affordance: the ladder decides when a food
 * comes back, and the answer after a refusal is never "right now".
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogDetailSheet } from '@/components/foodTracker/LogDetailSheet';
import {
  resultLabel,
  showLogFeedback,
  type UndoLog,
} from '@/components/foodTracker/ladderLogFeedback';
import { formatRelativeDay, localIsoDate } from '@/components/foodTracker/ladderDates';
import { cn } from '@/lib/utils';
import { RUNG_META, applyAttemptOutcome, type AttemptOutcome } from '@/lib/exposureLadder';
import {
  toLadderState,
  type LadderRow,
  type LogAttemptArgs,
  type LogResult,
  type QuickLogResult,
} from '@/hooks/useFoodLadder';
import '@/i18n/appLocale';

const RESULTS: QuickLogResult[] = ['accepted', 'held', 'refused'];

const OUTCOME: Record<QuickLogResult, AttemptOutcome> = {
  accepted: 'success',
  held: 'partial',
  refused: 'refused',
};

export interface LadderQuickLogControlsProps {
  row: LadderRow;
  foodName: string;
  /** The child's name, for the toast ("Logged peas for Maya"). */
  kidName: string;
  planEntryId?: string | null;
  mealSlot?: string | null;
  onLog: (args: LogAttemptArgs) => Promise<LogResult>;
  onUndo?: UndoLog;
  /** Renders the rung above the controls. Off where the caller shows it. */
  showRung?: boolean;
  /**
   * Where to announce the result. A logged row usually changes group and
   * unmounts these controls, taking their own live region with it, so a
   * caller with a stable region passes it here.
   */
  announce?: (message: string) => void;
  className?: string;
}

export function LadderQuickLogControls({
  row,
  foodName,
  kidName,
  planEntryId,
  mealSlot,
  onLog,
  onUndo,
  showRung = true,
  announce,
  className,
}: LadderQuickLogControlsProps) {
  const { t, i18n } = useTranslation();
  const [logging, setLogging] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const meta = RUNG_META[row.currentRung];
  const rungLabel = t(`foodLadder.rungs.${row.currentRung}`, meta.label);

  const say = (message: string) => {
    setLiveMessage(message);
    announce?.(message);
  };

  /**
   * The next date as the policy will set it. The hook may push it a day for
   * the per-day cap, so this is phrased as "next try", not a promise.
   */
  const describeNext = (result: QuickLogResult): string => {
    const today = localIsoDate();
    const next = applyAttemptOutcome(toLadderState(row), OUTCOME[result], { today });
    const label = resultLabel(t, result);
    if (next.status === 'mastered') {
      return t('foodTracker.ladderUi.announceSafe', {
        defaultValue: '{{food}}: {{result}}. {{food}} is a safe food now.',
        food: foodName,
        result: label,
      });
    }
    if (next.status === 'active' && next.nextDueOn) {
      return t('foodTracker.ladderUi.announceNext', {
        defaultValue: '{{food}}: {{result}}. Next try {{date}}.',
        food: foodName,
        result: label,
        date: formatRelativeDay(next.nextDueOn, today, i18n.language),
      });
    }
    return t('foodTracker.ladderUi.announceResting', {
      defaultValue: '{{food}}: {{result}}. It will rest for a while.',
      food: foodName,
      result: label,
    });
  };

  const handle = async (result: QuickLogResult) => {
    setLogging(true);
    try {
      const res = await onLog({ row, foodId: row.foodId, result, planEntryId, mealSlot });
      if (showLogFeedback({ t, res, kidName, foodName, onUndo })) say(describeNext(result));
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className={cn('space-y-1.5', className)} data-quick-log={row.id}>
      {showRung ? (
        <p className="text-xs text-muted-foreground">
          <span aria-hidden="true">{meta.emoji} </span>
          {rungLabel}
        </p>
      ) : null}

      <div className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto sm:flex-wrap">
        {RESULTS.map((result) => (
          <Button
            key={result}
            size="sm"
            // "Not today" stays neutral rather than destructive. A child
            // declining a food is information, not an error state, and
            // styling it as a failure is the pressure this feature removes.
            variant={result === 'accepted' ? 'default' : 'outline'}
            className="min-h-11"
            disabled={logging}
            onClick={() => handle(result)}
            aria-label={t('foodTracker.ladderUi.quickLogAria', {
              defaultValue: 'Log {{result}} for {{food}}',
              result: resultLabel(t, result),
              food: foodName,
            })}
            title={t('foodLadder.quickLog.srHint', { rung: rungLabel })}
          >
            {resultLabel(t, result)}
          </Button>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 px-2 text-muted-foreground"
        disabled={logging}
        onClick={() => setDetailOpen(true)}
        aria-label={t('foodTracker.ladderUi.addDetailFor', {
          defaultValue: 'Add detail for {{food}}',
          food: foodName,
        })}
      >
        <NotebookPen className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('foodTracker.ladderUi.addDetail', { defaultValue: 'Add detail' })}
      </Button>

      <p className="sr-only" aria-live="polite" role="status">
        {liveMessage}
      </p>

      <LogDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        row={row}
        foodName={foodName}
        kidName={kidName}
        planEntryId={planEntryId}
        mealSlot={mealSlot}
        onLog={onLog}
        onUndo={onUndo}
        onLogged={(result) => say(describeNext(result))}
      />
    </div>
  );
}
