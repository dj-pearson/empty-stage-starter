import { memo, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFoods, usePlan } from '@/contexts/AppContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import type { KidsProgressData } from '@/hooks/useKidsProgressSummary';
import { addIsoDays } from '@/lib/date-utils';
import { buildResultIndex, selectTryNextFromResults } from '@/lib/kidFit';
import { selectNextStep, toOverviewRow, type NextStepReason } from '@/lib/ladderOverview';
import type { Rung } from '@/lib/exposureLadder';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

/**
 * "What is the one thing to try next" for one child.
 *
 * With the exposure ladder on, the pick comes from the child's ladder rows
 * (selectNextStep: a stuck food first, then the one closest to safe, then one
 * that is resting). With it off, the pick is the try bite the child last
 * tasted in the past four weeks, since a taste is the moment to offer again.
 * Food Tracker owns the ladder itself; this names one food and links there.
 * The choice is deterministic, so the line never changes between renders.
 */
export interface NextStepSectionProps {
  kid: Kid;
  todayIso: string;
  progress: KidsProgressData;
  /** One line, no heading: the one-row-per-kid family view. */
  compact?: boolean;
}

/** Days in the window, today included: [today-27, today]. */
const WINDOW_DAYS = 28;

type NextPick =
  | { kind: 'ladder'; reason: NextStepReason; foodId: string; rung: Rung; triesLeft: number }
  | { kind: 'tasted'; foodId: string }
  | { kind: 'none' };

const linkClass =
  'inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function tipText(t: TFunction, pick: Extract<NextPick, { kind: 'ladder' }>, food: string): string {
  const rung = t(`foodLadder.rungs.${pick.rung}`, { defaultValue: pick.rung.replace(/_/g, ' ') });
  switch (pick.reason) {
    case 'stalled':
      return t('insightsWorking.next.tip.stalled', {
        food,
        rung,
        triesLeft: pick.triesLeft,
        defaultValue: '{{food}} has stayed at {{rung}} for a few tries. A smaller step or a short break usually helps.',
      });
    case 'close':
      return t('insightsWorking.next.tip.close', {
        food,
        rung,
        triesLeft: pick.triesLeft,
        count: pick.triesLeft,
        defaultValue_one: '{{food}} is {{triesLeft}} good try from safe, at {{rung}} now.',
        defaultValue: '{{food}} is {{triesLeft}} good tries from safe, at {{rung}} now.',
      });
    case 'resting':
      return t('insightsWorking.next.tip.resting', {
        food,
        rung,
        triesLeft: pick.triesLeft,
        defaultValue: '{{food}} is resting at {{rung}}. Pick it back up when the table feels calm.',
      });
  }
}

export const NextStepSection = memo(function NextStepSection({
  kid,
  todayIso,
  progress,
  compact = false,
}: NextStepSectionProps) {
  const { t } = useTranslation();
  const ladderOn = useFeatureFlag('exposure_ladder', false);
  const { foods } = useFoods();
  const { planEntries } = usePlan();

  const foodNames = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);

  const ladderPick = useMemo<NextPick | null>(() => {
    if (!ladderOn) return null;
    const rows = progress.ladderRows.filter((row) => row.kid_id === kid.id).map(toOverviewRow);
    const step = selectNextStep(rows, todayIso);
    if (!step) return null;
    return {
      kind: 'ladder',
      reason: step.reason,
      foodId: step.row.foodId,
      rung: step.row.currentRung,
      triesLeft: step.triesLeft,
    };
  }, [ladderOn, progress.ladderRows, kid.id, todayIso]);

  const tastedPick = useMemo<NextPick | null>(() => {
    const start = addIsoDays(todayIso, -(WINDOW_DAYS - 1));
    const windowed = planEntries.filter((e) => {
      const day = typeof e.date === 'string' ? e.date.slice(0, 10) : '';
      return e.kid_id === kid.id && day >= start && day <= todayIso;
    });
    const index = buildResultIndex(windowed, kid.id, addIsoDays(todayIso, 1));
    const found = selectTryNextFromResults(index, foods, kid);
    return found ? { kind: 'tasted', foodId: found.food.id } : null;
  }, [planEntries, foods, kid, todayIso]);

  const pick: NextPick = ladderPick ?? tastedPick ?? { kind: 'none' };
  const fallbackFood = t('insightsWorking.next.foodFallback', { defaultValue: 'this food' });

  const title = t('insightsWorking.next.title', { defaultValue: 'One thing to try next' });

  let body: ReactNode;
  if (progress.loading) {
    body = (
      <div aria-busy="true" data-testid="next-step-loading" className={compact ? 'min-h-[1.5rem]' : 'min-h-[5rem] space-y-2'}>
        <Skeleton className="h-5 w-3/4" />
        {!compact && <Skeleton className="h-9 w-40" />}
      </div>
    );
  } else if (pick.kind === 'none') {
    body = (
      <p className="text-sm text-muted-foreground">
        {t('insightsWorking.next.empty', { defaultValue: 'Nothing queued to try yet.' })}{' '}
        <Link to="/dashboard/food-tracker" className={linkClass}>
          {t('insightsWorking.next.emptyCta', { defaultValue: 'Add a try bite in Food Tracker' })}
        </Link>
      </p>
    );
  } else {
    const food = foodNames.get(pick.foodId) ?? fallbackFood;
    const text =
      pick.kind === 'ladder'
        ? tipText(t, pick, food)
        : t('insightsWorking.next.fallback', {
            name: kid.name,
            food,
            defaultValue: '{{name}} tasted {{food}} last time. That is a good moment to offer it again.',
          });
    const to = pick.kind === 'ladder' ? '/dashboard/food-tracker' : '/dashboard/planner';
    const cta =
      pick.kind === 'ladder'
        ? t('insightsWorking.next.ctaTracker', { defaultValue: 'Open Food Tracker' })
        : t('insightsWorking.next.ctaPlan', { defaultValue: 'Plan it this week' });

    body = compact ? (
      <p className="text-sm">
        {text}{' '}
        <Link to={to} className={linkClass}>
          {cta}
        </Link>
      </p>
    ) : (
      <div className="flex flex-col items-start gap-3">
        <p className="text-base">{text}</p>
        <Button asChild size="sm" variant="outline">
          <Link to={to}>
            {cta}
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  // The family view repeats this once per kid, so it drops the heading and
  // the id rather than repeating a landmark.
  if (compact) return <div data-testid="next-step-compact">{body}</div>;

  return (
    <section id="insights-next" aria-labelledby="insights-next-title" className="space-y-3">
      <h2 id="insights-next-title" className="text-lg font-semibold">
        {title}
      </h2>
      {body}
    </section>
  );
});
