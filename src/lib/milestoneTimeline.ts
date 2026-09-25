/**
 * One child's milestones, newest first: badges from kid_badges and foods that
 * reached safe on the exposure ladder.
 *
 * Both come from durable server rows, never from the plan cache, and neither
 * is dated "today" when the row carries no date: an undated row is left out,
 * because a milestone printed under the wrong month is worse than one missing.
 *
 * A safe food's date is masteredOnIso (kidProgress.ts), which is the ladder
 * row's last attempt and so only approximately the graduation day. The view
 * therefore shows it under its month without printing a day.
 */
import { toISODate } from '@/lib/date-utils';
import { masteredOnIso, type KidLadderRow } from '@/lib/kidProgress';
import { badgeById } from '@/lib/badgeCatalog';

export interface BadgeEarnRow {
  badge_id: string;
  earned_at: string | null;
}

interface MilestoneBase {
  id: string;
  /**
   * For a badge, earned_at as stored (a timestamptz, formatted by the view);
   * for a safe food, the approximate local day 'YYYY-MM-DD'.
   */
  dateIso: string;
  /** Local day 'YYYY-MM-DD', what the list sorts and groups by. */
  dayIso: string;
}

export interface BadgeMilestone extends MilestoneBase {
  kind: 'badge';
  /** i18n key base for the badge, e.g. 'progressBadges.firstTryBite'. */
  labelKey: string;
}

export interface SafeMilestone extends MilestoneBase {
  kind: 'safe';
  foodName: string;
}

export type Milestone = BadgeMilestone | SafeMilestone;

/** Local day of a timestamptz, or null when it does not parse. */
function localDayOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : toISODate(ms);
}

/**
 * `ladderRows` should already be narrowed to one child; rows that are not
 * mastered, or whose food is no longer in `foodsById`, are skipped.
 */
export function buildMilestoneTimeline(
  badgeRows: readonly BadgeEarnRow[],
  ladderRows: readonly KidLadderRow[],
  foodsById: ReadonlyMap<string, { name: string }>,
): Milestone[] {
  const out: Milestone[] = [];
  const seenBadges = new Set<string>();

  for (const row of badgeRows) {
    const badge = badgeById(row.badge_id);
    if (!badge || seenBadges.has(badge.id)) continue;
    const dayIso = localDayOf(row.earned_at);
    if (!dayIso || !row.earned_at) continue;
    seenBadges.add(badge.id);
    out.push({ kind: 'badge', id: badge.id, dateIso: row.earned_at, dayIso, labelKey: badge.i18nKey });
  }

  const seenFoods = new Set<string>();
  for (const row of ladderRows) {
    if (row.status !== 'mastered' || seenFoods.has(row.food_id)) continue;
    const food = foodsById.get(row.food_id);
    if (!food) continue;
    const dayIso = masteredOnIso(row);
    if (!dayIso) continue;
    seenFoods.add(row.food_id);
    out.push({ kind: 'safe', id: row.food_id, dateIso: dayIso, dayIso, foodName: food.name });
  }

  return out.sort((a, b) => {
    if (a.dayIso !== b.dayIso) return a.dayIso < b.dayIso ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 'YYYY-MM' of a milestone, for month headers. */
export function milestoneMonth(m: Pick<Milestone, 'dayIso'>): string {
  return m.dayIso.slice(0, 7);
}

/** Consecutive runs of milestones sharing a month, in list order. */
export function groupByMonth<T extends Pick<Milestone, 'dayIso'>>(
  items: readonly T[],
): { month: string; items: T[] }[] {
  const groups: { month: string; items: T[] }[] = [];
  for (const item of items) {
    const month = milestoneMonth(item);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }
  return groups;
}
