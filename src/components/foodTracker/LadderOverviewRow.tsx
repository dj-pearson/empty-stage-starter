/**
 * One food on the Food Tracker ladder overview.
 *
 * A row in a divided list, not a card: the page is a list of foods, and
 * nesting a card per food inside a card per group is how the old board read
 * as a wall of boxes. The quick-log buttons are inline only where a parent
 * can act on them today (Due today, Close to safe); everywhere else the row
 * says where the food is and leaves it alone.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LadderQuickLogControls } from '@/components/LadderQuickLogControls';
import { LadderRowMenu, RungTrack } from '@/components/FoodLadderBoard';
import { matchingAllergen } from '@/lib/allergens';
import { RUNGS, RUNG_META, rungIndex } from '@/lib/exposureLadder';
import { exposuresToSafe } from '@/lib/ladderOverview';
import type { LadderRow, LogAttemptArgs, LogResult } from '@/hooks/useFoodLadder';
import type { Food, Kid } from '@/types';
import { formatRelativeDay } from './ladderDates';
import type { UndoLog } from './ladderLogFeedback';
import '@/i18n/appLocale';

export type OverviewGroup = 'dueToday' | 'closeToSafe' | 'workingOn' | 'resting' | 'safeNow';

export interface LadderOverviewRowProps {
  row: LadderRow;
  group: OverviewGroup;
  kid: Pick<Kid, 'id' | 'name' | 'allergens' | 'always_eats_foods'>;
  food: Pick<Food, 'id' | 'name' | 'allergens'> | undefined;
  anchorName: string | null;
  stalled: boolean;
  today: string;
  onLog: (args: LogAttemptArgs) => Promise<LogResult>;
  onUndo: UndoLog;
  onPause: (row: LadderRow) => unknown;
  onResume: (row: LadderRow) => unknown;
  onStepDown: (row: LadderRow) => unknown;
  onRemove: (row: LadderRow) => Promise<boolean>;
  onRestore: (row: LadderRow) => Promise<boolean>;
  /** Safe now: add to the child's always-eats list. Absent once it is there. */
  onAddToAlwaysEats?: (row: LadderRow) => void;
  announce?: (message: string) => void;
}

export function LadderOverviewRow({
  row,
  group,
  kid,
  food,
  anchorName,
  stalled,
  today,
  onLog,
  onUndo,
  onPause,
  onResume,
  onStepDown,
  onRemove,
  onRestore,
  onAddToAlwaysEats,
  announce,
}: LadderOverviewRowProps) {
  const { t, i18n } = useTranslation();
  const meta = RUNG_META[row.currentRung];
  const rungLabel = t(`foodLadder.rungs.${row.currentRung}`, meta.label);
  const foodName = food?.name ?? t('foodLadder.unknownFood');
  const allergen = food ? matchingAllergen(kid.allergens, food.allergens) : null;
  const toSafe = exposuresToSafe(row);
  const showControls = group === 'dueToday' || group === 'closeToSafe';

  let when: string | null = null;
  if (group === 'resting') {
    when = row.nextDueOn
      ? t('foodTracker.ladderUi.row.backOn', {
          defaultValue: 'back {{date}}',
          date: formatRelativeDay(row.nextDueOn, today, i18n.language),
        })
      : row.pausedReason === 'two_refusals'
        ? t('foodLadder.restingAfterRefusals')
        : row.status === 'backed_off'
          ? t('foodLadder.restingAfterUpset')
          : t('foodTracker.ladderUi.row.restingUntilYou', {
              defaultValue: 'resting until you bring it back',
            });
  } else if ((group === 'workingOn' || group === 'closeToSafe') && row.nextDueOn) {
    when = t('foodTracker.ladderUi.nextDue', {
      defaultValue: 'next try {{date}}',
      date: formatRelativeDay(row.nextDueOn, today, i18n.language),
    });
  }

  return (
    <li className="py-4" data-ladder-row={row.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-foreground">{foodName}</span>
            <span className="text-sm text-muted-foreground">
              <span aria-hidden="true">{meta.emoji} </span>
              {rungLabel}
            </span>
            {allergen ? (
              <Badge variant="outline" className="border-destructive text-destructive">
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                {t('foodTracker.ladderUi.contains', {
                  defaultValue: 'Contains {{allergen}}',
                  allergen,
                })}
              </Badge>
            ) : null}
          </div>

          <RungTrack
            rung={row.currentRung}
            label={t('foodLadder.rungTrackLabel', {
              rung: rungLabel,
              step: rungIndex(row.currentRung) + 1,
              total: RUNGS.length,
            })}
          />

          <p className="text-sm text-muted-foreground">
            {group === 'safeNow'
              ? t('foodTracker.ladderUi.row.safe', { defaultValue: 'Eaten as a full portion' })
              : t('foodTracker.ladderUi.row.toSafe', { count: toSafe })}
            {anchorName && group !== 'safeNow' ? (
              <span> · {t('foodLadder.servedWith', { food: anchorName })}</span>
            ) : null}
            {when ? <span> · {when}</span> : null}
          </p>

          {stalled && group !== 'safeNow' ? (
            <p className="text-sm text-foreground">
              {t('foodTracker.ladderUi.row.stalled', {
                defaultValue: 'Stalled: try a smaller step',
              })}
            </p>
          ) : null}
        </div>

        <LadderRowMenu
          row={row}
          foodName={foodName}
          onPause={onPause}
          onResume={onResume}
          onStepDown={onStepDown}
          onRemove={onRemove}
          onRestore={onRestore}
        />
      </div>

      {showControls ? (
        <LadderQuickLogControls
          className="mt-3"
          row={row}
          foodName={foodName}
          kidName={kid.name}
          mealSlot={row.preferredMealSlot}
          onLog={onLog}
          onUndo={onUndo}
          showRung={false}
          announce={announce}
        />
      ) : null}

      {group === 'resting' ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 min-h-11"
          onClick={() => void onResume(row)}
        >
          <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('foodTracker.ladderUi.row.resume', {
            defaultValue: 'Bring {{food}} back',
            food: foodName,
          })}
        </Button>
      ) : null}

      {group === 'safeNow' && onAddToAlwaysEats ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 min-h-11"
          onClick={() => onAddToAlwaysEats(row)}
        >
          {t('foodTracker.ladderUi.row.addToAlwaysEats', {
            defaultValue: "Add to {{name}}'s always-eats",
            name: kid.name,
          })}
        </Button>
      ) : null}
    </li>
  );
}
