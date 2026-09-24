import { memo, useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFoods } from '@/contexts/AppContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  buildMonthlyTrajectory,
  firstAttemptIso,
  kidSafeFoodIds,
  masteredOnIso,
  pickTrajectoryHeadline,
  type KidAttemptRow,
  type KidLadderRow,
  type MonthPoint,
  type TrajectoryHeadline,
} from '@/lib/kidProgress';
import { cn } from '@/lib/utils';
import type { Food, FoodCategory, Kid } from '@/types';
import '@/i18n/appLocale';

/**
 * Progress: what has changed for each child over months.
 *
 * Everything here is read from durable server rows (food_attempts since the
 * first one, and kid_food_ladder), not from the plan cache, which only holds
 * -30d..+90d. Each child gets one flat card: a computed headline, a months
 * strip of first tries and foods reached safe, the list of those foods, and
 * the child's own safe foods by group. "Safe" is per child (kidSafeFoodIds),
 * never the household is_safe flag, so two siblings see different numbers.
 *
 * Deliberately absent: this-week rates, streaks and try-bite tallies. Kids,
 * Insights and the Food Tracker already answer those, and the old version of
 * this file compared a child against an invented average of 50.
 */
export interface ProgressTrajectoryProps {
  kids: readonly Kid[];
  ladderRows: readonly KidLadderRow[];
  attempts: readonly KidAttemptRow[];
  loading: boolean;
  error: boolean;
  /** A read stopped at the row ceiling; rendered the same way as an error. */
  truncated?: boolean;
  todayIso: string;
  /** Scope the page to one child (family view only). */
  onSelectKid?: (kidId: string) => void;
}

const CATEGORIES: readonly FoodCategory[] = ['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'];

/** How many reached-safe foods are listed before "and N more". */
const REACHED_LIMIT = 8;

/** 'YYYY-MM' as a local Date on the 1st, so formatting never shifts the month. */
function monthDate(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

function formatMonth(month: string, locale: string, withYear = false): string {
  try {
    return new Intl.DateTimeFormat(locale, withYear ? { month: 'short', year: 'numeric' } : { month: 'short' }).format(
      monthDate(month),
    );
  } catch {
    return month;
  }
}

function formatMonthLong(month: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long' }).format(monthDate(month));
  } catch {
    return month;
  }
}

function safePart(t: TFunction, count: number): string {
  return t('progressTrajectory.headline.safe', {
    count,
    defaultValue_one: '{{count}} food reached safe',
    defaultValue: '{{count}} foods reached safe',
  });
}

function triesPart(t: TFunction, count: number): string {
  return t('progressTrajectory.headline.tries', {
    count,
    defaultValue_one: '{{count}} first try',
    defaultValue: '{{count}} first tries',
  });
}

function trajectoryHeadlineText(t: TFunction, headline: TrajectoryHeadline, locale: string): string {
  switch (headline.kind) {
    case 'notEnough':
      return t('progressTrajectory.headline.notEnough', {
        defaultValue: 'Trends appear after your first month of logging.',
      });
    case 'steady':
      return t('progressTrajectory.headline.steady', {
        count: headline.params.exposures,
        month: formatMonthLong(headline.params.sinceMonth, locale),
        defaultValue_one: 'Since {{month}}: {{count}} try logged, no new foods yet.',
        defaultValue: 'Since {{month}}: {{count}} tries logged, no new foods yet.',
      });
    case 'progress': {
      const { safe, firstTries, sinceMonth } = headline.params;
      const month = formatMonthLong(sinceMonth, locale);
      if (safe > 0 && firstTries > 0) {
        return t('progressTrajectory.headline.progressBoth', {
          month,
          safe: safePart(t, safe),
          tries: triesPart(t, firstTries),
          defaultValue: 'Since {{month}}: {{safe}}, {{tries}}.',
        });
      }
      if (safe > 0) {
        return t('progressTrajectory.headline.progressSafe', {
          month,
          safe: safePart(t, safe),
          defaultValue: 'Since {{month}}: {{safe}}.',
        });
      }
      return t('progressTrajectory.headline.progressTries', {
        month,
        tries: triesPart(t, firstTries),
        defaultValue: 'Since {{month}}: {{tries}}.',
      });
    }
  }
}

interface MonthStripProps {
  points: readonly MonthPoint[];
  name: string;
}

const MonthStrip = memo(function MonthStrip({ points, name }: MonthStripProps) {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const locale = i18n.language || 'en';
  const max = Math.max(1, ...points.map((p) => Math.max(p.firstTries, p.graduations)));
  const barMotion = !reduce && 'motion-safe:transition-[height] motion-safe:duration-300';

  return (
    <div
      role="group"
      aria-label={t('progressTrajectory.strip.label', {
        name,
        defaultValue: 'First tries and foods reached safe per month for {{name}}',
      })}
      className="mt-4"
    >
      <div className="flex gap-4 text-xs text-muted-foreground" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-try-bite" />
          {t('progressTrajectory.strip.legendTries', { defaultValue: 'First tries' })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-safe-food" />
          {t('progressTrajectory.strip.legendSafe', { defaultValue: 'Reached safe' })}
        </span>
      </div>
      <ol className="mt-2 flex gap-2">
        {points.map((p) => {
          const label = t('progressTrajectory.strip.month', {
            month: formatMonthLong(p.month, locale),
            tries: t('progressTrajectory.strip.triesPart', {
              count: p.firstTries,
              defaultValue_one: '{{count}} first try',
              defaultValue: '{{count}} first tries',
            }),
            safe: t('progressTrajectory.strip.safePart', {
              count: p.graduations,
              defaultValue_one: '{{count}} food reached safe',
              defaultValue: '{{count}} foods reached safe',
            }),
            logged: t('progressTrajectory.strip.loggedPart', {
              count: p.loggedExposures,
              defaultValue_one: '{{count}} try logged',
              defaultValue: '{{count}} tries logged',
            }),
            defaultValue: '{{month}}: {{tries}}, {{safe}}, {{logged}}',
          });
          return (
            <li key={p.month} className="min-w-0 flex-1">
              <div role="img" aria-label={label} data-testid="trajectory-month">
                <div className="flex h-20 items-end gap-1 rounded-md bg-muted px-1 pb-1">
                  {[
                    { value: p.firstTries, tone: 'bg-try-bite' },
                    { value: p.graduations, tone: 'bg-safe-food' },
                  ].map((bar, i) => (
                    <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                      <span className="text-[11px] font-medium tabular-nums leading-4 text-foreground">{bar.value}</span>
                      <div
                        style={{ height: `${bar.value === 0 ? 0 : Math.max(8, Math.round((bar.value / max) * 75))}%` }}
                        className={cn('w-full rounded-sm', bar.tone, barMotion)}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 truncate text-center text-xs text-muted-foreground">
                  {formatMonth(p.month, locale)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
});

interface KidModel {
  kid: Kid;
  headline: TrajectoryHeadline;
  trajectory: MonthPoint[];
}

interface KidCardProps {
  model: KidModel;
  ladderRows: readonly KidLadderRow[];
  foodsById: ReadonlyMap<string, Food>;
  todayIso: string;
  showSelect: boolean;
  onSelectKid?: (kidId: string) => void;
}

const KidCard = memo(function KidCard({ model, ladderRows, foodsById, todayIso, showSelect, onSelectKid }: KidCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { kid, headline, trajectory } = model;
  const titleId = useId();

  const reached = useMemo(() => {
    const thisYear = todayIso.slice(0, 4);
    return ladderRows
      .filter((row) => row.kid_id === kid.id && row.status === 'mastered' && foodsById.has(row.food_id))
      .map((row) => {
        const day = masteredOnIso(row);
        return {
          foodId: row.food_id,
          name: foodsById.get(row.food_id)?.name ?? '',
          day,
          month: day ? formatMonth(day.slice(0, 7), locale, day.slice(0, 4) !== thisYear) : null,
        };
      })
      .sort((a, b) => (b.day ?? '').localeCompare(a.day ?? '') || a.name.localeCompare(b.name));
  }, [ladderRows, kid.id, foodsById, locale, todayIso]);

  const variety = useMemo(() => {
    const counts = new Map<FoodCategory, number>();
    for (const id of kidSafeFoodIds(kid, ladderRows, foodsById)) {
      const category = foodsById.get(id)?.category;
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return CATEGORIES.map((category) => ({ category, count: counts.get(category) ?? 0 }));
  }, [kid, ladderRows, foodsById]);

  const notEnough = headline.kind === 'notEnough';
  const shown = reached.slice(0, REACHED_LIMIT);
  const hidden = reached.length - shown.length;

  return (
    <article aria-labelledby={titleId} className="rounded-xl border bg-card p-4 text-card-foreground" data-testid="trajectory-card">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={titleId} className="text-base font-semibold">
          {kid.name}
        </h3>
        {showSelect && onSelectKid && (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onSelectKid(kid.id)}>
            {t('progressTrajectory.showOnly', { name: kid.name, defaultValue: 'Show only {{name}}' })}
          </Button>
        )}
      </div>
      <p className="mt-1 text-base" data-testid="trajectory-headline">
        {trajectoryHeadlineText(t, headline, locale)}
      </p>

      {notEnough ? (
        <Link to="/dashboard/insights" className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t('progressTrajectory.headline.notEnoughLink', { defaultValue: 'See this week on Insights' })}
        </Link>
      ) : (
        trajectory.length > 0 && <MonthStrip points={trajectory} name={kid.name} />
      )}

      {(!notEnough || reached.length > 0) && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold">
            {t('progressTrajectory.reached.title', { defaultValue: 'Reached safe' })}
          </h4>
          {reached.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('progressTrajectory.reached.none', {
                defaultValue: 'No ladder foods have reached safe yet. The Food Tracker shows what to offer next.',
              })}{' '}
              <Link to="/dashboard/food-tracker" className="font-medium text-primary underline-offset-4 hover:underline">
                {t('progressTrajectory.reached.trackerLink', { defaultValue: 'Open Food Tracker' })}
              </Link>
            </p>
          ) : (
            <ul className="mt-2 divide-y text-sm">
              {shown.map((item) => (
                <li key={item.foodId} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{item.name}</span>
                  {item.month && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t('progressTrajectory.reached.by', { month: item.month, defaultValue: 'by {{month}}' })}
                    </span>
                  )}
                </li>
              ))}
              {hidden > 0 && (
                <li className="py-1.5 text-xs text-muted-foreground">
                  {t('progressTrajectory.reached.more', {
                    count: hidden,
                    defaultValue_one: 'and {{count}} more',
                    defaultValue: 'and {{count}} more',
                  })}
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5">
        <h4 className="text-sm font-semibold">
          {t('progressTrajectory.variety.title', { defaultValue: 'Safe foods by group' })}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t('progressTrajectory.variety.hint', {
            name: kid.name,
            defaultValue: 'Foods {{name}} has mastered or always eats, without allergens or dislikes.',
          })}
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
          {variety.map(({ category, count }) => (
            <div key={category} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">
                {t(`progressTrajectory.variety.category.${category}`, { defaultValue: category })}
              </dt>
              <dd className={cn('tabular-nums', count === 0 ? 'text-muted-foreground' : 'font-semibold')}>
                {count === 0 ? t('progressTrajectory.variety.none', { defaultValue: 'None yet' }) : count}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
});

export function ProgressTrajectory({
  kids,
  ladderRows,
  attempts,
  loading,
  error,
  truncated = false,
  todayIso,
  onSelectKid,
}: ProgressTrajectoryProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const titleId = useId();

  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  // One pass per kid over the durable rows; recomputed only when one of these
  // four identities changes, not on every context re-render.
  const models = useMemo<KidModel[]>(
    () =>
      kids.map((kid) => {
        const trajectory = buildMonthlyTrajectory(attempts, ladderRows, kid.id, todayIso);
        const headline = pickTrajectoryHeadline(trajectory, firstAttemptIso(attempts, kid.id, todayIso), todayIso);
        return { kid, trajectory, headline };
      }),
    [attempts, ladderRows, kids, todayIso],
  );

  if (kids.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('progressTrajectory.title', { defaultValue: "What's changed over the months" })}
      </h2>
      {loading ? (
        <div aria-busy="true" data-testid="trajectory-loading" className="space-y-4">
          {kids.map((kid) => (
            <div key={kid.id} className="rounded-xl border bg-card p-4">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="mt-2 h-5 w-3/4" />
              <Skeleton className="mt-4 h-24 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {(error || truncated) && (
            <p className="text-sm text-muted-foreground" data-testid="trajectory-partial">
              {t('progressTrajectory.partial', {
                defaultValue: "Some history couldn't load, so these numbers may be low.",
              })}
            </p>
          )}
          <div className="space-y-4">
            {models.map((model) => (
              <KidCard
                key={model.kid.id}
                model={model}
                ladderRows={ladderRows}
                foodsById={foodsById}
                todayIso={todayIso}
                showSelect={kids.length > 1}
                onSelectKid={onSelectKid}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** The old name, kept so existing imports keep working. */
export const ProgressDashboard = ProgressTrajectory;
export default ProgressTrajectory;
