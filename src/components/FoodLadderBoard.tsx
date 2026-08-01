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

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useFoodLadder, todayIsoDate, type LadderRow } from '@/hooks/useFoodLadder';
import { RUNGS, RUNG_META, rungIndex, type LadderStatus } from '@/lib/exposureLadder';

/** Display order puts what is moving first and what is finished last. */
const SECTION_ORDER: LadderStatus[] = ['active', 'backed_off', 'paused', 'mastered'];

interface RungTrackProps {
  rung: LadderRow['currentRung'];
  label: string;
}

/**
 * Eight segments, one per rung, filled up to where the child is. A plain
 * progress bar would lose which *step* they are on, and the step is the
 * whole point.
 */
function RungTrack({ rung, label }: RungTrackProps) {
  const reached = rungIndex(rung);

  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={label}
    >
      {RUNGS.map((r, i) => (
        <span
          key={r}
          aria-hidden="true"
          className={cn(
            'h-1.5 w-4 rounded-full transition-colors',
            i <= reached ? 'bg-safe-food' : 'bg-muted'
          )}
        />
      ))}
    </div>
  );
}

interface LadderListRowProps {
  row: LadderRow;
  foodName: string;
  anchorName: string | null;
  onPause: (row: LadderRow) => void;
  onResume: (row: LadderRow) => void;
  onStepDown: (row: LadderRow) => void;
  onRemove: (row: LadderRow) => void;
}

function LadderListRow({
  row,
  foodName,
  anchorName,
  onPause,
  onResume,
  onStepDown,
  onRemove,
}: LadderListRowProps) {
  const { t } = useTranslation();
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
            <span> · {t('foodLadder.nextDue', { date: row.nextDueOn })}</span>
          ) : null}
          {row.status === 'paused' && row.pausedReason === 'two_refusals' ? (
            <span> · {t('foodLadder.restingAfterRefusals')}</span>
          ) : null}
          {row.status === 'backed_off' ? <span> · {t('foodLadder.restingAfterUpset')}</span> : null}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('foodLadder.rowActionsLabel', { food: foodName })}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.status === 'active' ? (
            <DropdownMenuItem onSelect={() => onPause(row)}>
              <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('foodLadder.actions.pause')}
            </DropdownMenuItem>
          ) : row.status !== 'mastered' ? (
            <DropdownMenuItem onSelect={() => onResume(row)}>
              <Play className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('foodLadder.actions.resume')}
            </DropdownMenuItem>
          ) : null}

          {row.status !== 'mastered' && rungIndex(row.currentRung) > 0 ? (
            <DropdownMenuItem onSelect={() => onStepDown(row)}>
              <ChevronDown className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('foodLadder.actions.stepDown')}
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem onSelect={() => onRemove(row)}>
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('foodLadder.actions.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
    grouped,
    loading,
    quickLog,
    pause,
    resume,
    pauseAll,
    stepDown,
    removeFromLadder,
    backfillFromHistory,
    scheduleDueExposures,
    masteryCandidates,
    masteredFoodName,
    dismissMastery,
    addFoodToLadder,
  } = useFoodLadder(activeKidId, {
    kid: activeKidRecord,
    foods,
    shareWins,
  });

  const [backfilling, setBackfilling] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const activeKid = activeKidRecord;
  const foodNameById = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);

  /**
   * What is actually being asked of this child today. Kept separate from the
   * status sections below: "what do I do at dinner" and "how is this food
   * going overall" are different questions, and a parent standing in the
   * kitchen is only asking the first one.
   */
  const dueToday = useMemo(() => {
    const today = todayIsoDate();
    return grouped.active.filter((row) => row.nextDueOn !== null && row.nextDueOn <= today);
  }, [grouped.active]);

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

        {grouped.active.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleSchedule} disabled={scheduling}>
              <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              {scheduling ? t('foodLadder.scheduling') : t('foodLadder.planToday')}
            </Button>
            <Button variant="outline" onClick={handlePauseAll}>
              <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('foodLadder.pauseEverything')}
            </Button>
          </div>
        ) : null}
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
                      if (await addFoodToLadder(candidate.foodId, candidate.anchorFoodId)) {
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

      {dueToday.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('foodLadder.dueTodayTitle')}</CardTitle>
            <CardDescription>{t('foodLadder.dueTodayBody')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {dueToday.map((row) => {
                const foodName = foodNameById.get(row.foodId) ?? t('foodLadder.unknownFood');
                const anchorName = row.pairedSafeFoodId
                  ? foodNameById.get(row.pairedSafeFoodId) ?? null
                  : null;

                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-foreground">{foodName}</p>
                      <p className="text-sm text-muted-foreground">
                        {anchorName
                          ? t('foodLadder.servedWith', { food: anchorName })
                          : t('foodLadder.noAnchorYet')}
                      </p>
                    </div>
                    <LadderQuickLogControls
                      row={row}
                      foodName={foodName}
                      mealSlot={row.preferredMealSlot}
                      onLog={quickLog}
                    />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {SECTION_ORDER.map((status) => {
        const section = grouped[status];
        if (!section || section.length === 0) return null;

        return (
          <Card key={status}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {t(`foodLadder.sections.${status}.title`)}
                </CardTitle>
                <Badge variant="secondary">{section.length}</Badge>
              </div>
              <CardDescription>{t(`foodLadder.sections.${status}.body`)}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {section.map((row) => (
                  <LadderListRow
                    key={row.id}
                    row={row}
                    foodName={foodNameById.get(row.foodId) ?? t('foodLadder.unknownFood')}
                    anchorName={
                      row.pairedSafeFoodId
                        ? foodNameById.get(row.pairedSafeFoodId) ?? null
                        : null
                    }
                    onPause={pause}
                    onResume={resume}
                    onStepDown={stepDown}
                    onRemove={removeFromLadder}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      <p className="max-w-[68ch] text-sm text-muted-foreground">{t('foodLadder.disclaimer')}</p>
    </div>
  );
}
