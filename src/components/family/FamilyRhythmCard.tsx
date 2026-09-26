/**
 * The parent's logging streak, this week's household meter and last week's
 * recap, in one short section.
 *
 * It measures the adults showing up, not what the child ate (familyRhythm.ts
 * says why). Anyone in the household who logs fills this week's cells, so two
 * parents work toward one goal together instead of against each other.
 */
import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { KidAttemptRow } from '@/lib/kidProgress';
import { lastWeekRecap, loggedDaySet, parentStreak, weekMeter } from '@/lib/familyRhythm';
import '@/i18n/appLocale';

export interface FamilyRhythmCardProps {
  /** Every attempt for the household's kids, all time. */
  attempts: readonly KidAttemptRow[];
  todayIso: string;
  loading?: boolean;
  /** Where "Family milestones" goes. Omitted on the page that shows them. */
  milestonesHref?: string;
  headingLevel?: 'h2' | 'h3';
}

function formatDay(iso: string, language: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  try {
    return new Intl.DateTimeFormat(language || undefined, { ...opts, timeZone: 'UTC' }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(date);
  }
}

export const FamilyRhythmCard = memo(function FamilyRhythmCard({
  attempts,
  todayIso,
  loading = false,
  milestonesHref,
  headingLevel = 'h2',
}: FamilyRhythmCardProps) {
  const { t, i18n } = useTranslation();
  const Heading = headingLevel;

  const { streak, meter, recap } = useMemo(() => {
    const days = loggedDaySet(attempts, todayIso);
    return {
      streak: parentStreak(days, todayIso),
      meter: weekMeter(days, todayIso),
      recap: lastWeekRecap(attempts, todayIso),
    };
  }, [attempts, todayIso]);

  let graceLine: string | null = null;
  if (streak.atRisk) {
    graceLine = t('familyRhythm.grace.atRisk', {
      defaultValue: 'Yesterday used your grace day. Log anything today to keep the streak.',
    });
  } else if (streak.current > 0 && streak.graceReadyOn) {
    graceLine = t('familyRhythm.grace.used', {
      defaultValue: 'Grace day used. The next one is ready {{date}}.',
      date: formatDay(streak.graceReadyOn, i18n.language, { weekday: 'long' }),
    });
  } else if (streak.current > 0) {
    graceLine = t('familyRhythm.grace.ready', {
      defaultValue: "One missed day a week won't break it.",
    });
  }

  const recapParts: string[] = [];
  if (recap.offers > 0) {
    recapParts.push(t('familyRhythm.recap.days', { defaultValue: '{{count}} days logged', count: recap.daysLogged }));
    recapParts.push(t('familyRhythm.recap.offers', { defaultValue: '{{count}} offers', count: recap.offers }));
    if (recap.newFoodsOffered > 0) {
      recapParts.push(
        t('familyRhythm.recap.newFoods', { defaultValue: '{{count}} new foods offered', count: recap.newFoodsOffered }),
      );
    }
  }

  return (
    <section aria-labelledby="family-rhythm-heading" className="rounded-xl border border-border p-4" aria-busy={loading}>
      <div className="flex items-baseline justify-between gap-3">
        <Heading id="family-rhythm-heading" className="text-base font-semibold">
          {t('familyRhythm.title', { defaultValue: 'Logging rhythm' })}
        </Heading>
        {milestonesHref ? (
          <Link
            to={milestonesHref}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('familyRhythm.milestonesLink', { defaultValue: 'Family milestones' })}
          </Link>
        ) : null}
      </div>

      <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="family-streak">
        {streak.current > 0
          ? t('familyRhythm.streak', { defaultValue: '{{count}}-day logging streak', count: streak.current })
          : t('familyRhythm.streakNone', { defaultValue: 'Log a meal to start a streak' })}
      </p>
      {graceLine ? <p className="text-sm text-muted-foreground">{graceLine}</p> : null}
      {streak.best > streak.current ? (
        <p className="text-sm text-muted-foreground">
          {t('familyRhythm.best', { defaultValue: 'Best so far: {{count}} days', count: streak.best })}
        </p>
      ) : null}

      <ol
        className="mt-4 grid grid-cols-7 gap-1.5"
        aria-label={t('familyRhythm.week.label', { defaultValue: 'Days logged this week' })}
      >
        {meter.days.map((cell) => {
          const name = formatDay(cell.day, i18n.language, { weekday: 'long' });
          const state = cell.logged
            ? t('familyRhythm.week.logged', { defaultValue: 'logged' })
            : cell.isFuture
              ? t('familyRhythm.week.ahead', { defaultValue: 'still ahead' })
              : t('familyRhythm.week.notLogged', { defaultValue: 'nothing logged' });
          return (
            <li key={cell.day} className="flex flex-col items-center gap-1">
              <span
                aria-hidden="true"
                className={cn(
                  'h-7 w-full max-w-9 rounded-md border',
                  cell.logged ? 'border-primary bg-primary' : 'border-border',
                  cell.isFuture && 'border-dashed',
                  cell.isToday && !cell.logged && 'border-2 border-primary',
                )}
              />
              <span className="text-xs text-muted-foreground" aria-hidden="true">
                {formatDay(cell.day, i18n.language, { weekday: 'narrow' })}
              </span>
              <span className="sr-only">{`${name}: ${state}`}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm" data-testid="family-week-goal">
        {meter.reached
          ? t('familyRhythm.week.reached', {
              defaultValue: 'Week goal reached: {{count}} days logged together.',
              count: meter.loggedCount,
            })
          : t('familyRhythm.week.progress', {
              defaultValue: '{{count}} of {{goal}} days logged this week. Anyone in the household counts.',
              count: meter.loggedCount,
              goal: meter.goal,
            })}
      </p>

      {recapParts.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="family-recap">
          <span className="font-medium text-foreground">
            {t('familyRhythm.recap.title', { defaultValue: 'Last week' })}
          </span>
          {': '}
          {recapParts.join(' · ')}
        </p>
      ) : null}
    </section>
  );
});
