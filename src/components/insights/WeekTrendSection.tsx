import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFoods, usePlan } from '@/contexts/AppContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { KidsProgressData } from '@/hooks/useKidsProgressSummary';
import { buildWeeklyTrend, pickWeekHeadline, type WeekBucket, type WeekHeadline } from '@/lib/kidProgress';
import { cn } from '@/lib/utils';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

/**
 * "How is it going" for the Insights page: one sentence per child about the
 * current week, and in the full view a four-bar sparkline of weekly tries.
 * Everything comes from logged results in the last 28 days (buildWeeklyTrend),
 * so a planned-but-unlogged dinner never shows up as progress. Refusals are
 * counted in the data but never named here.
 */
export interface WeekTrendSectionProps {
  kids: readonly Kid[];
  progress: KidsProgressData;
  todayIso: string;
  /** Headline only: the one-row-per-kid family view. */
  compact?: boolean;
  /**
   * Inside a row that already has its own heading (the family view renders
   * this once per kid): no section landmark, heading or id, so the page never
   * repeats id="insights-trend".
   */
  embedded?: boolean;
}

/** A 'YYYY-MM-DD' day as a local Date, so formatting never shifts the day. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDay(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(localDate(iso));
  } catch {
    return iso;
  }
}

function headlineText(t: TFunction, headline: WeekHeadline, name: string, food: string | undefined, locale: string) {
  switch (headline.kind) {
    case 'reachedSafe':
      return t('insightsTrend.headline.reachedSafe', {
        count: headline.params.count,
        name,
        food: food ?? t('insightsTrend.headline.foodFallback', { defaultValue: 'a new food' }),
        defaultValue_one: '{{food}} became a safe food for {{name}} this week.',
        defaultValue: '{{count}} foods became safe for {{name}} this week, including {{food}}.',
      });
    case 'notEnough':
      return t('insightsTrend.headline.notEnough', {
        name,
        defaultValue: 'Log a few more meals for {{name}} and the weekly picture fills in here.',
      });
    case 'quiet':
      return t('insightsTrend.headline.quiet', {
        name,
        date: headline.params.lastLoggedIso ? formatDay(headline.params.lastLoggedIso, locale) : '',
        defaultValue: 'Nothing logged for {{name}} this week yet. The last log was {{date}}.',
      });
    case 'aboveAverage':
      return t('insightsTrend.headline.aboveAverage', {
        count: headline.params.exposures,
        average: headline.params.average,
        name,
        defaultValue_one: '{{name}} had {{count}} try this week, more than the usual {{average}}.',
        defaultValue: '{{name}} had {{count}} tries this week, more than the usual {{average}}.',
      });
    case 'steady':
      return t('insightsTrend.headline.steady', {
        count: headline.params.dishes,
        foods: headline.params.distinctFoods,
        name,
        defaultValue_one: '{{name}} was offered {{count}} dish this week.',
        defaultValue: '{{name}} was offered {{count}} dishes this week, with {{foods}} different foods on the plate.',
      });
  }
}

interface SparklineProps {
  trend: readonly WeekBucket[];
  name: string;
}

const Sparkline = memo(function Sparkline({ trend, name }: SparklineProps) {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const locale = i18n.language || 'en';
  const max = Math.max(1, ...trend.map((b) => b.exposures));
  const lastIndex = trend.length - 1;

  const summary = trend
    .map((b, i) => {
      const range = i === lastIndex ? t('insightsTrend.sparkline.thisWeek', { defaultValue: 'This week' }) : formatDay(b.startIso, locale);
      return b.logged === 0
        ? t('insightsTrend.sparkline.weekNotLogged', { range, defaultValue: '{{range}}: not logged' })
        : t('insightsTrend.sparkline.week', { range, count: b.exposures, defaultValue: '{{range}}: {{count}}' });
    })
    .join(', ');

  return (
    <figure
      role="img"
      aria-label={t('insightsTrend.sparkline.label', {
        name,
        summary,
        defaultValue: 'Tries per week for {{name}} over the last 4 weeks. {{summary}}',
      })}
      className="mt-3"
    >
      <div className="flex h-16 items-end gap-2">
        {trend.map((b, i) => {
          const empty = b.logged === 0;
          const height = empty ? 25 : Math.max(10, Math.round((b.exposures / max) * 100));
          return (
            <div
              key={b.startIso}
              data-testid="trend-bar"
              style={{ height: `${height}%` }}
              className={cn(
                'flex-1 rounded-sm',
                !reducedMotion && 'motion-safe:transition-[height] motion-safe:duration-300',
                empty
                  ? 'border border-dashed border-muted-foreground/40 bg-muted'
                  : i === lastIndex
                    ? 'bg-primary'
                    : 'bg-primary/70',
              )}
            >
              {empty && (
                <span className="sr-only">
                  {t('insightsTrend.sparkline.notLogged', { defaultValue: 'not logged' })}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
        {trend.map((b, i) => (
          <span key={b.startIso} className={cn('flex-1 truncate text-center', i === lastIndex && 'font-medium text-foreground')}>
            {i === lastIndex
              ? t('insightsTrend.sparkline.thisWeek', { defaultValue: 'This week' })
              : formatDay(b.startIso, locale)}
          </span>
        ))}
      </div>
    </figure>
  );
});

interface KidTrendProps {
  kid: Kid;
  progress: KidsProgressData;
  todayIso: string;
  compact: boolean;
}

const KidTrend = memo(function KidTrend({ kid, progress, todayIso, compact }: KidTrendProps) {
  const { t, i18n } = useTranslation();
  const { planEntries } = usePlan();
  const { foods } = useFoods();

  const { trend, headline, totalLogged, weeksWithLogs } = useMemo(() => {
    const kidLadder = progress.ladderRows.filter((row) => row.kid_id === kid.id);
    const weeks = buildWeeklyTrend(planEntries, kid.id, todayIso, progress.attempts);
    return {
      trend: weeks,
      headline: pickWeekHeadline(weeks, kidLadder, todayIso),
      totalLogged: weeks.reduce((sum, b) => sum + b.logged, 0),
      weeksWithLogs: weeks.filter((b) => b.logged > 0).length,
    };
  }, [planEntries, kid.id, progress.attempts, progress.ladderRows, todayIso]);

  const headlineMinHeight = compact ? 'min-h-[1.5rem]' : 'min-h-[3rem]';

  if (progress.loading) {
    return (
      <div aria-busy="true" data-testid="trend-loading">
        <div className={headlineMinHeight}>
          <Skeleton className="h-5 w-3/4" />
        </div>
        {!compact && <Skeleton className="mt-3 h-[5.25rem] w-full" />}
      </div>
    );
  }

  if (totalLogged === 0 && headline.kind !== 'reachedSafe') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          {t('insightsTrend.empty.body', {
            name: kid.name,
            defaultValue:
              'No meals logged for {{name}} in the last 4 weeks. Mark what got eaten in the planner and this fills in.',
          })}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard/planner">{t('insightsTrend.empty.cta', { defaultValue: 'Open planner' })}</Link>
        </Button>
      </div>
    );
  }

  const foodName =
    headline.kind === 'reachedSafe'
      ? foods.find((f) => f.id === headline.params.foodId)?.name
      : undefined;

  return (
    <div>
      <p className={cn('text-base', headlineMinHeight)}>
        {headlineText(t, headline, kid.name, foodName, i18n.language || 'en')}
      </p>
      {!compact &&
        (weeksWithLogs >= 2 ? (
          <Sparkline trend={trend} name={kid.name} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {t('insightsTrend.sparkline.needsTwoWeeks', { defaultValue: 'Trend shows after two weeks of logging' })}
          </p>
        ))}
    </div>
  );
});

export const WeekTrendSection = memo(function WeekTrendSection({
  kids,
  progress,
  todayIso,
  compact = false,
  embedded = false,
}: WeekTrendSectionProps) {
  const { t } = useTranslation();
  if (kids.length === 0) return null;

  if (embedded) {
    return (
      <div data-testid="trend-embedded" className={cn(compact ? 'space-y-2' : 'space-y-6')}>
        {kids.map((kid) => (
          <KidTrend key={kid.id} kid={kid} progress={progress} todayIso={todayIso} compact={compact} />
        ))}
      </div>
    );
  }

  return (
    <section id="insights-trend" aria-labelledby="insights-trend-title" className="space-y-3">
      <h2 id="insights-trend-title" className="text-lg font-semibold">
        {t('insightsTrend.title', { defaultValue: 'How the weeks are going' })}
      </h2>
      <ul className={cn(compact ? 'space-y-2' : 'space-y-6')}>
        {kids.map((kid) => (
          <li key={kid.id}>
            <KidTrend kid={kid} progress={progress} todayIso={todayIso} compact={compact} />
          </li>
        ))}
      </ul>
    </section>
  );
});
