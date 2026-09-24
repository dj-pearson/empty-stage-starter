/**
 * Exposure Ladder board (US-601 / US-602).
 *
 * One screen showing where every food sits on the active child's ladder. The
 * app has always been able to answer "what happened last Tuesday"; this is
 * the surface that answers "where are we now", which is the question parents
 * actually carry around.
 *
 * The tone here matters as much as the data. Nothing on this screen tells a
 * parent to push. Backed-off and paused foods are presented as resting, not
 * as failures, and no control invites a retry on a food the child refused
 * twice — that decision stays entirely with the parent.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LadderReportDialog } from '@/components/LadderReportDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Pause,
  Play,
  ChevronDown,
  Trash2,
  Sparkles,
  CalendarPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFoods, useKids } from '@/contexts/AppContext';
import { usePickyWinSharePref } from '@/hooks/usePickyWinSharePref';
import { LadderQuickLogControls } from '@/components/LadderQuickLogControls';
import { formatRelativeDay, localIsoDate } from '@/components/foodTracker/ladderDates';
import { useFoodLadder, type LadderRow } from '@/hooks/useFoodLadder';
import { RUNGS, RUNG_META, rungIndex } from '@/lib/exposureLadder';
import { groupLadder, type LadderGroups } from '@/lib/ladderOverview';
import '@/i18n/appLocale';

type GroupKey = Exclude<keyof LadderGroups, 'stalledIds'>;

/**
 * Display order puts what is asked of the child today first and what is
 * finished last. Each row sits in exactly one group (groupLadder), so a food
 * due today is never listed a second time under "Working on".
 */
const GROUP_ORDER: GroupKey[] = ['dueToday', 'closeToSafe', 'workingOn', 'resting', 'safeNow'];

export interface RungTrackProps {
  rung: LadderRow['currentRung'];
  label: string;
  className?: string;
}

/**
 * Eight segments, one per rung, filled up to where the child is. A plain
 * progress bar would lose which *step* they are on, and the step is the
 * whole point.
 */
export function RungTrack({ rung, label, className }: RungTrackProps) {
  const reached = rungIndex(rung);

  return (
    <div className={cn('flex items-center gap-1', className)} role="img" aria-label={label}>
      {RUNGS.map((r, i) => (
        <span
          key={r}
          aria-hidden="true"
          className={cn(
            'h-1.5 w-4 rounded-full transition-colors motion-reduce:transition-none',
            i <= reached ? 'bg-safe-food' : 'bg-muted'
          )}
        />
      ))}
    </div>
  );
}

export interface LadderRowMenuProps {
  row: LadderRow;
  foodName: string;
  onPause: (row: LadderRow) => unknown;
  onResume: (row: LadderRow) => unknown;
  onStepDown: (row: LadderRow) => unknown;
  /** Optimistic in useFoodLadder: the row leaves the list before the round trip. */
  onRemove: (row: LadderRow) => Promise<boolean>;
  /** useFoodLadder.restoreRow, behind the Undo on the removal toast. */
  onRestore: (row: LadderRow) => Promise<boolean>;
}

/**
 * The per-row overflow menu. Remove sits apart, under a separator and in the
 * destructive token, and is undoable for a few seconds rather than guarded by
 * a confirm dialog: the row comes back with its id and counters intact.
 */
export function LadderRowMenu({
  row,
  foodName,
  onPause,
  onResume,
  onStepDown,
  onRemove,
  onRestore,
}: LadderRowMenuProps) {
  const { t } = useTranslation();

  const handleRemove = async () => {
    const removed = await onRemove(row);
    if (!removed) {
      toast.error(
        t('foodTracker.ladderUi.removeFailed', {
          defaultValue: "Couldn't remove {{food}} just now. It's still on the ladder.",
          food: foodName,
        })
      );
      return;
    }
    toast(
      t('foodTracker.ladderUi.removed', {
        defaultValue: '{{food}} is off the ladder.',
        food: foodName,
      }),
      {
        duration: 6000,
        action: {
          label: t('foodTracker.ladderUi.undo', { defaultValue: 'Undo' }),
          onClick: () => {
            void onRestore(row).then((restored) => {
              if (!restored) {
                toast.error(
                  t('foodTracker.ladderUi.restoreFailed', {
                    defaultValue: "Couldn't put {{food}} back just now.",
                    food: foodName,
                  })
                );
              }
            });
          },
        },
      }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={t('foodLadder.rowActionsLabel', { food: foodName })}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {row.status === 'active' ? (
          <DropdownMenuItem onSelect={() => void onPause(row)}>
            <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('foodLadder.actions.pause')}
          </DropdownMenuItem>
        ) : row.status !== 'mastered' ? (
          <DropdownMenuItem onSelect={() => void onResume(row)}>
            <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('foodLadder.actions.resume')}
          </DropdownMenuItem>
        ) : null}

        {row.status !== 'mastered' && rungIndex(row.currentRung) > 0 ? (
          <DropdownMenuItem onSelect={() => void onStepDown(row)}>
            <ChevronDown className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('foodLadder.actions.stepDown')}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => void handleRemove()}
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('foodLadder.actions.remove')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface LadderListRowProps {
  row: LadderRow;
  foodName: string;
  anchorName: string | null;
  today: string;
  menu: ReactNode;
}

function LadderListRow({ row, foodName, anchorName, today, menu }: LadderListRowProps) {
  const { t, i18n } = useTranslation();
  const meta = RUNG_META[row.currentRung];
  const rungLabel = t(`foodLadder.rungs.${row.currentRung}`, meta.label);

  return (
    <li className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{foodName}</span>
          <span className="text-sm text-muted-foreground">
            <span aria-hidden="true">{meta.emoji} </span>
            {rungLabel}
          </span>
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
          {anchorName
            ? t('foodLadder.servedWith', { food: anchorName })
            : t('foodLadder.noAnchorYet')}
          {row.status === 'active' && row.nextDueOn ? (
            <span>
              {' · '}
              {t('foodTracker.ladderUi.nextDue', {
                defaultValue: 'next try {{date}}',
                date: formatRelativeDay(row.nextDueOn, today, i18n.language),
              })}
            </span>
          ) : null}
          {row.status === 'paused' && row.pausedReason === 'two_refusals' ? (
            <span> · {t('foodLadder.restingAfterRefusals')}</span>
          ) : null}
          {row.status === 'backed_off' ? <span> · {t('foodLadder.restingAfterUpset')}</span> : null}
        </p>
      </div>

      {menu}
    </li>
  );
}

export function FoodLadderBoard() {
  const { t } = useTranslation();
  const { activeKidId, kids } = useKids();
  const { foods } = useFoods();
  const { enabled: shareWins } = usePickyWinSharePref();
  const activeKidRecord = kids.find((k) => k.id === activeKidId) ?? null;
  const {
    rows,
    loading,
    logAttempt,
    undoLog,
    pause,
    resume,
    pauseAll,
    stepDown,
    removeFromLadder,
    restoreRow,
    backfillFromHistory,
    scheduleDueExposures,
    masteryCandidates,
    masteredFoodName,
    dismissMastery,
    startFood,
  } = useFoodLadder(activeKidId, {
    kid: activeKidRecord,
    foods,
    shareWins,
  });

  const [backfilling, setBackfilling] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const activeKid = activeKidRecord;
  const foodNameById = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);
  // Read once per render from local calendar parts. The board is no longer
  // the primary surface (LadderOverview on Food Tracker is), so it does not
  // track midnight itself.
  const today = localIsoDate();
  const groups = useMemo(() => groupLadder(rows, today), [rows, today]);
  const hasActive = groups.dueToday.length + groups.closeToSafe.length + groups.workingOn.length > 0;

  const handleSchedule = async () => {
    if (!activeKid) return;
    setScheduling(true);
    try {
      const result = await scheduleDueExposures({ foods, kid: activeKid });
      if (!result) {
        toast.error(t('foodLadder.scheduleFailed'));
        return;
      }
      toast.success(
        result.scheduled.length > 0
          ? t('foodLadder.scheduled', { count: result.scheduled.length })
          : t('foodLadder.nothingDue')
      );
    } finally {
      setScheduling(false);
    }
  };

  const handleBackfill = async () => {
    if (!activeKidId) return;
    setBackfilling(true);
    try {
      const count = await backfillFromHistory(activeKidId);
      toast.success(
        count > 0
          ? t('foodLadder.backfillFound', { count })
          : t('foodLadder.backfillEmpty')
      );
    } finally {
      setBackfilling(false);
    }
  };

  const handlePauseAll = async () => {
    if (await pauseAll()) toast.success(t('foodLadder.pausedAll'));
  };

  if (!activeKidId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t('foodLadder.selectAChild')}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('foodLadder.emptyTitle')}</CardTitle>
          <CardDescription>{t('foodLadder.emptyBody')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleBackfill} disabled={backfilling}>
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            {backfilling ? t('foodLadder.backfilling') : t('foodLadder.backfillCta')}
          </Button>
          <p className="text-sm text-muted-foreground">{t('foodLadder.disclaimer')}</p>
        </CardContent>
      </Card>
    );
  }

  const kidName = activeKid?.name ?? '';
  const groupTitle: Record<GroupKey, string> = {
    dueToday: t('foodLadder.dueTodayTitle'),
    closeToSafe: t('foodTracker.ladderUi.groups.closeToSafe', { defaultValue: 'Close to safe' }),
    workingOn: t('foodLadder.sections.active.title'),
    resting: t('foodLadder.sections.backed_off.title'),
    safeNow: t('foodTracker.ladderUi.groups.safeNow', { defaultValue: 'Safe now' }),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            {activeKid
              ? t('foodLadder.titleFor', { name: activeKid.name })
              : t('foodLadder.title')}
          </h2>
          <p className="max-w-[68ch] text-sm text-muted-foreground">
            {t('foodLadder.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* US-605: available whenever there is a ladder at all — a paused or
              mastered-only board is still worth taking to an appointment. */}
          {activeKid ? (
            <LadderReportDialog
              kidId={activeKid.id}
              /* First token only: kids.name is free text and some families
                 store a full name there. The report must not carry one. */
              kidFirstName={activeKid.name.trim().split(/\s+/)[0] || activeKid.name}
              ladderRows={rows.map((row) => ({
                foodId: row.foodId,
                currentRung: row.currentRung,
                status: row.status,
              }))}
              foodNameById={foodNameById}
            />
          ) : null}
          {hasActive ? (
            <>
              <Button variant="outline" onClick={handleSchedule} disabled={scheduling}>
                <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                {scheduling ? t('foodLadder.scheduling') : t('foodLadder.planToday')}
              </Button>
              <Button variant="outline" onClick={handlePauseAll}>
                <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('foodLadder.pauseEverything')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {masteryCandidates.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {masteredFoodName
                ? t('foodLadder.mastery.titleFor', { food: masteredFoodName })
                : t('foodLadder.mastery.title')}
            </CardTitle>
            <CardDescription>{t('foodLadder.mastery.body')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y divide-border">
              {masteryCandidates.map((candidate) => (
                <li
                  key={candidate.foodId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{candidate.foodName}</p>
                    {candidate.reasons.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('foodLadder.mastery.because', {
                          reasons: candidate.reasons.join(', '),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const started = await startFood(candidate.foodId, {
                        pairedSafeFoodId: candidate.anchorFoodId,
                        kidId: candidate.kidId ?? undefined,
                      });
                      if (started.ok) {
                        toast.success(
                          t('foodLadder.mastery.started', { food: candidate.foodName })
                        );
                        dismissMastery();
                      }
                    }}
                  >
                    {t('foodLadder.mastery.start')}
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" onClick={dismissMastery}>
              {t('foodLadder.mastery.notNow')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {GROUP_ORDER.map((key) => {
        const section = groups[key];
        if (section.length === 0) return null;

        return (
          <Card key={key}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{groupTitle[key]}</CardTitle>
                <Badge variant="secondary">{section.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {section.map((row) => {
                  const foodName = foodNameById.get(row.foodId) ?? t('foodLadder.unknownFood');
                  const menu = (
                    <div className="flex flex-col items-end gap-2">
                      <LadderRowMenu
                        row={row}
                        foodName={foodName}
                        onPause={pause}
                        onResume={resume}
                        onStepDown={stepDown}
                        onRemove={removeFromLadder}
                        onRestore={restoreRow}
                      />
                      {key === 'dueToday' ? (
                        <LadderQuickLogControls
                          row={row}
                          foodName={foodName}
                          kidName={kidName}
                          mealSlot={row.preferredMealSlot}
                          onLog={logAttempt}
                          onUndo={undoLog}
                          showRung={false}
                        />
                      ) : null}
                    </div>
                  );
                  return (
                    <LadderListRow
                      key={row.id}
                      row={row}
                      foodName={foodName}
                      today={today}
                      anchorName={
                        row.pairedSafeFoodId
                          ? foodNameById.get(row.pairedSafeFoodId) ?? null
                          : null
                      }
                      menu={menu}
                    />
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      <p className="max-w-[68ch] text-sm text-muted-foreground">{t('foodLadder.disclaimer')}</p>
    </div>
  );
}
