/**
 * The badge catalog, mirrored from the iPhone app.
 *
 * iOS decides when a badge is earned (`Badge.criteria` in
 * ios/EatPal/EatPal/Services/BadgeService.swift) and writes the earn to
 * `kid_badges`. The web only reads that table, so all it needs from the
 * catalog is what to call each badge and how to draw it. The ids are the Swift
 * rawValues, which is what lands in `kid_badges.badge_id`; the tiers are the
 * Swift `BadgeTier` numbers. badgeCatalog.parity.test.ts reads the Swift and
 * fails when either side changes alone.
 *
 * There is no English here. Titles and descriptions live under
 * `progressBadges.<id>` in src/i18n/locales/app/en.progress-badges.json.
 *
 * `target` is the count the iOS criterion checks against. It is shown as a
 * hint on a locked tile only where the web can compute the same count from
 * data it holds (see badgeHints.ts); elsewhere it is documentation.
 */
import {
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  Cherry,
  Crown,
  Fish,
  Flame,
  FlameKindling,
  Grid3x3,
  Leaf,
  Star,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/** Swift `BadgeTier` raw values. */
export const BADGE_TIER_RANK: Readonly<Record<BadgeTier, number>> = Object.freeze({
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
});

export const BADGE_IDS = [
  'firstTryBite',
  'fiveDayStreak',
  'tenDayStreak',
  'categoryExplorer',
  'vegetableExplorer',
  'fruitExplorer',
  'proteinPro',
  'weekWarrior',
  'consistentTracker',
  'recipeChef',
  'loggedThirtyMeals',
  'perfectWeek',
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

export interface BadgeDefinition {
  id: BadgeId;
  tier: BadgeTier;
  icon: LucideIcon;
  /** i18n key base: `${i18nKey}.title`, `${i18nKey}.description`. */
  i18nKey: string;
  /** The count the iOS criterion compares against. */
  target: number;
  /** Counted over the household, not the child (Swift: recipes are not kid-scoped). */
  household?: true;
}

const def = (
  id: BadgeId,
  tier: BadgeTier,
  icon: LucideIcon,
  target: number,
  household?: true,
): BadgeDefinition => ({
  id,
  tier,
  icon,
  i18nKey: `progressBadges.${id}`,
  target,
  ...(household ? { household } : {}),
});

/** In Swift declaration order, which is the order locked tiles are drawn in. */
export const BADGE_CATALOG: readonly BadgeDefinition[] = Object.freeze([
  def('firstTryBite', 'bronze', Star, 1),
  def('fiveDayStreak', 'silver', Flame, 5),
  def('tenDayStreak', 'gold', FlameKindling, 10),
  def('categoryExplorer', 'silver', Grid3x3, 5),
  def('vegetableExplorer', 'gold', Leaf, 10),
  def('fruitExplorer', 'gold', Cherry, 10),
  def('proteinPro', 'gold', Fish, 10),
  def('weekWarrior', 'bronze', CalendarCheck, 7),
  def('consistentTracker', 'gold', BadgeCheck, 30),
  def('recipeChef', 'bronze', BookOpen, 5, true),
  def('loggedThirtyMeals', 'silver', UtensilsCrossed, 30),
  def('perfectWeek', 'platinum', Crown, 5),
]);

export const BADGE_COUNT = BADGE_CATALOG.length;

const BY_ID: ReadonlyMap<string, BadgeDefinition> = new Map(BADGE_CATALOG.map((b) => [b.id, b]));

/** The definition for a stored badge_id, or undefined for one this build does not know. */
export function badgeById(id: string): BadgeDefinition | undefined {
  return BY_ID.get(id);
}

export function isKnownBadgeId(id: string): id is BadgeId {
  return BY_ID.has(id);
}
