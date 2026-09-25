/**
 * One child's milestones and badges, for the Progress page.
 *
 * Earned badges come from kid_badges and nowhere else. iOS evaluates the
 * criteria and writes the earn with its real date; this view reads it back,
 * so a badge earned in March reads as March on every device. The web used to
 * keep its own nine-badge catalog computed from the plan cache and stamp every
 * unlock with today's date, which is what this replaced (PLATFORMS.md).
 *
 * Locked tiles show a bar only where the web can count what the phone counts
 * (badgeHints.ts): the streak badges through the shared streak rule, and
 * perfectWeek from this week's results. Everything else shows no bar rather
 * than a number read off a 30-day window.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlan } from '@/contexts/AppContext';
import { useKidBadges } from '@/hooks/useKidBadges';
import { AchievementBadge } from './AchievementBadge';
import { BADGE_CATALOG, BADGE_COUNT, type BadgeDefinition } from '@/lib/badgeCatalog';
import { lockedBadgeHint, type BadgeHint } from '@/lib/badgeHints';
import { buildMilestoneTimeline, groupByMonth } from '@/lib/milestoneTimeline';
import { toISODate } from '@/lib/date-utils';
import type { KidLadderRow } from '@/lib/kidProgress';
import type { Food, Kid } from '@/types';
import { currentStreak } from "@/lib/streakRules";
import '@/i18n/appLocale';

interface AchievementsViewProps {
  kid: Kid;
  /** The household's ladder rows; narrowed to `kid` here. */
  ladderRows: readonly KidLadderRow[];
  foodsById: ReadonlyMap<string, Food>;
}

/** Milestones shown before "Show all". */
const TIMELINE_PREVIEW = 5;

function safeFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return new Intl.DateTimeFormat(undefined, options);
  }
}

export function AchievementsView({ kid, ladderRows, foodsById }: AchievementsViewProps) {
  const { t, i18n } = useTranslation();
  const { planEntries } = usePlan();
  const badges = useKidBadges(kid.id);
  const [expanded, setExpanded] = useState(false);

  const todayIso = toISODate(new Date());
  const lang = i18n.language || 'en';
  const dayFormat = useMemo(() => safeFormatter(lang, { dateStyle: 'medium' }), [lang]);
  const monthFormat = useMemo(() => safeFormatter(lang, { month: 'long', year: 'numeric' }), [lang]);

  // Rows still belonging to the previous child are never drawn under this one.
  const current = badges.rowsKidId === kid.id;
  const rows = useMemo(() => (current ? badges.rows : []), [current, badges.rows]);

  const kidLadder = useMemo(() => ladderRows.filter((r) => r.kid_id === kid.id), [ladderRows, kid.id]);
  const safeCount = useMemo(
    () => new Set(kidLadder.filter((r) => r.status === 'mastered').map((r) => r.food_id)).size,
    [kidLadder],
  );

  const timeline = useMemo(() => buildMilestoneTimeline(rows, kidLadder, foodsById), [rows, kidLadder, foodsById]);

  const formatEarned = (iso: string): string => {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? '' : dayFormat.format(ms);
  };

  const monthLabel = (month: string): string => {
    const [y, m] = month.split('-').map(Number);
    const firstOfMonth = new Date(y, (m ?? 1) - 1, 1);
    return monthFormat.format(firstOfMonth);
  };

  // Earned first, newest first; then locked in catalog order.
  const { earned, locked } = useMemo(() => {
    const earnedAt = new Map<string, string>();
    for (const row of rows) if (!earnedAt.has(row.badge_id)) earnedAt.set(row.badge_id, row.earned_at);
    const earnedList = BADGE_CATALOG.filter((b) => earnedAt.has(b.id))
      .map((b) => ({ badge: b, earnedAt: earnedAt.get(b.id) ?? '' }))
      .sort((a, b) => Date.parse(b.earnedAt) - Date.parse(a.earnedAt) || (a.badge.id < b.badge.id ? -1 : 1));
    return { earned: earnedList, locked: BADGE_CATALOG.filter((b) => !earnedAt.has(b.id)) };
  }, [rows]);

  // US-781: one streak rule. The streak badges' hints are this number.
  const streak = useMemo(() => currentStreak(planEntries, kid.id, { todayKey: todayIso }), [planEntries, kid.id, todayIso]);

  const hints = useMemo(() => {
    const out = new Map<string, BadgeHint>();
    for (const badge of locked) {
      const hint =
        badge.id === 'fiveDayStreak' || badge.id === 'tenDayStreak'
          ? { progress: streak, total: badge.target }
          : lockedBadgeHint(badge.id, badge.target, planEntries, kid.id, todayIso);
      if (hint) out.set(badge.id, hint);
    }
    return out;
  }, [locked, streak, planEntries, kid.id, todayIso]);

  const nearest: BadgeDefinition = useMemo(() => {
    let best: BadgeDefinition | undefined;
    let bestRatio = -1;
    for (const badge of locked) {
      const hint = hints.get(badge.id);
      if (!hint || hint.total <= 0) continue;
      const ratio = Math.min(hint.progress, hint.total) / hint.total;
      if (ratio > bestRatio) {
        best = badge;
        bestRatio = ratio;
      }
    }
    return best ?? locked[0] ?? BADGE_CATALOG[0];
  }, [locked, hints]);

  // One toast per failed read, not one per render.
  const toastedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!badges.error) {
      toastedFor.current = null;
      return;
    }
    if (toastedFor.current === kid.id) return;
    toastedFor.current = kid.id;
    toast.error(t('progressBadges.error.toast', { name: kid.name, defaultValue: "Couldn't load {{name}}'s badges" }));
  }, [badges.error, kid.id, kid.name, t]);

  const loadingFirst = !current && (badges.loading || !badges.error);
  const failedFirst = !current && badges.error && !badges.loading;
  const shown = expanded ? timeline : timeline.slice(0, TIMELINE_PREVIEW);
  const headingId = `badges-${kid.id}-heading`;

  return (
    <div className="space-y-5" aria-labelledby={headingId} role="group">
      <div className="space-y-1">
        <h3 id={headingId} className="text-base font-semibold">
          {t('progressBadges.heading', { name: kid.name, defaultValue: '{{name}}: milestones' })}
        </h3>
        {current && (
          <p className="text-sm text-foreground">
            {t('progressBadges.summary', {
              earned: earned.length,
              total: BADGE_COUNT,
              defaultValue: '{{earned}} of {{total}} badges earned',
            })}
            {'. '}
            {t('progressBadges.safeCount', {
              count: safeCount,
              defaultValue: '{{count}} foods reached safe',
            })}
          </p>
        )}
      </div>

      {badges.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
          <span>{t('progressBadges.error.inline', { defaultValue: "Couldn't load badges." })}</span>
          <Button type="button" size="sm" variant="outline" onClick={badges.retry} className="min-h-11">
            {t('progressBadges.error.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      )}

      {current && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{t('progressBadges.timeline.title', { defaultValue: 'Milestones' })}</h4>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('progressBadges.timeline.none', {
                defaultValue:
                  'Nothing here yet. Foods that reach safe on the ladder and badges from the iPhone app land here with their dates.',
              })}
            </p>
          ) : (
            <>
              <ol className="space-y-3">
                {groupByMonth(shown).map((group) => (
                  <li key={group.month}>
                    <h5 className="text-xs font-semibold text-muted-foreground">{monthLabel(group.month)}</h5>
                    <ol className="mt-1 space-y-1">
                      {group.items.map((item) =>
                        item.kind === 'badge' ? (
                          <li key={`badge:${item.id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                            <span>
                              {t('progressBadges.timeline.badgeItem', {
                                title: t(`${item.labelKey}.title`),
                                defaultValue: 'Earned {{title}}',
                              })}
                            </span>
                            <time dateTime={item.dateIso} className="text-xs text-muted-foreground">
                              {formatEarned(item.dateIso)}
                            </time>
                          </li>
                        ) : (
                          <li key={`safe:${item.id}`} className="text-sm">
                            <Link
                              to="/dashboard/food-tracker"
                              className="inline-flex min-h-11 items-center rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-0"
                            >
                              {t('progressBadges.timeline.safeItem', {
                                food: item.foodName,
                                defaultValue: '{{food}} reached safe',
                              })}
                            </Link>
                          </li>
                        ),
                      )}
                    </ol>
                  </li>
                ))}
              </ol>
              {timeline.length > TIMELINE_PREVIEW && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 px-2"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded
                    ? t('progressBadges.timeline.showFewer', { defaultValue: 'Show fewer' })
                    : t('progressBadges.timeline.showAll', { count: timeline.length, defaultValue: 'Show all {{count}}' })}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {current && earned.length === 0 && !badges.error && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
          <p className="text-sm font-semibold">{t('progressBadges.empty.title', { defaultValue: 'No badges yet' })}</p>
          <p className="text-sm text-foreground">
            {t('progressBadges.empty.body', {
              name: kid.name,
              badge: t(`${nearest.i18nKey}.title`),
              defaultValue: 'Badges are earned in the iPhone app from what you log. Closest for {{name}}: {{badge}}.',
            })}
          </p>
          <Button asChild size="sm" className="min-h-11">
            <Link to="/dashboard/food-tracker">{t('progressBadges.empty.cta', { defaultValue: 'Offer a try-bite' })}</Link>
          </Button>
        </div>
      )}

      {!failedFirst && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{t('progressBadges.grid.title', { defaultValue: 'Badges' })}</h4>
          {loadingFirst ? (
            <div aria-busy="true">
              <p className="sr-only">{t('progressBadges.loading', { defaultValue: 'Loading badges' })}</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {BADGE_CATALOG.map((b) => (
                  <li key={b.id}>
                    <Skeleton className="h-28 rounded-xl" />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-busy={badges.loading || undefined}>
              {earned.map(({ badge, earnedAt }) => (
                <li key={badge.id}>
                  <AchievementBadge badge={badge} earned earnedLabel={formatEarned(earnedAt)} />
                </li>
              ))}
              {locked.map((badge) => (
                <li key={badge.id}>
                  <AchievementBadge badge={badge} earned={false} hint={hints.get(badge.id) ?? null} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
