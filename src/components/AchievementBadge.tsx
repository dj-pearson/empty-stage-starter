/**
 * One badge tile, earned or locked.
 *
 * Earned state is whatever the caller read from kid_badges; this component
 * never decides it. A locked tile may carry a hint (badgeHints.ts) where the
 * web can count what the phone counts. When that hint is already full and the
 * badge is still not in kid_badges, the phone has not evaluated it yet, so the
 * tile says so rather than printing "27 / 25".
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { BadgeDefinition, BadgeTier } from '@/lib/badgeCatalog';
import type { BadgeHint } from '@/lib/badgeHints';
import '@/i18n/appLocale';

interface AchievementBadgeProps {
  badge: BadgeDefinition;
  /** True only when kid_badges holds a row for this child and badge. */
  earned: boolean;
  /** The earned date, already formatted for the reader's locale. */
  earnedLabel?: string;
  hint?: BadgeHint | null;
}

/** Full class strings so Tailwind sees every one of them. */
const TIER_STYLES: Record<BadgeTier, { tile: string; icon: string; tier: string }> = {
  bronze: {
    tile: 'bg-badge-bronze-soft border-badge-bronze/40',
    icon: 'bg-badge-bronze text-badge-bronze-foreground',
    tier: 'text-badge-bronze',
  },
  silver: {
    tile: 'bg-badge-silver-soft border-badge-silver/40',
    icon: 'bg-badge-silver text-badge-silver-foreground',
    tier: 'text-badge-silver',
  },
  gold: {
    tile: 'bg-badge-gold-soft border-badge-gold/40',
    icon: 'bg-badge-gold text-badge-gold-foreground',
    tier: 'text-badge-gold',
  },
  platinum: {
    tile: 'bg-badge-platinum-soft border-badge-platinum/40',
    icon: 'bg-badge-platinum text-badge-platinum-foreground',
    tier: 'text-badge-platinum',
  },
};

function AchievementBadgeImpl({ badge, earned, earnedLabel, hint }: AchievementBadgeProps) {
  const { t } = useTranslation();
  const Icon = badge.icon;
  const styles = TIER_STYLES[badge.tier];
  const title = t(`${badge.i18nKey}.title`);
  const description = t(`${badge.i18nKey}.description`);
  const tierLabel = t(`progressBadges.tiers.${badge.tier}`);

  const total = hint ? Math.max(0, hint.total) : 0;
  const shown = hint ? Math.max(0, Math.min(hint.progress, total)) : 0;
  const value = total > 0 ? Math.round((shown / total) * 100) : 0;
  const ready = Boolean(hint) && !earned && total > 0 && (hint?.progress ?? 0) >= total;
  const valueText = t('progressBadges.progressValue', { progress: shown, total, defaultValue: '{{progress}} of {{total}}' });

  return (
    <div
      className={cn(
        'flex h-full flex-col items-center gap-2 rounded-xl border p-3 text-center',
        earned ? styles.tile : 'border-dashed border-border bg-card',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          earned ? styles.icon : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-semibold leading-tight text-foreground sm:text-sm">{title}</p>
        <p className="sr-only text-xs text-foreground sm:not-sr-only">{description}</p>
        <p className={cn('text-[11px] font-medium', earned ? styles.tier : 'text-foreground')}>
          {tierLabel}
        </p>
        {badge.household && (
          <p className="text-[11px] text-foreground">
            {t('progressBadges.household', { defaultValue: 'Household' })}
          </p>
        )}
        <p className="sr-only">
          {earned && earnedLabel
            ? t('progressBadges.earnedOn', { date: earnedLabel, defaultValue: 'Earned on {{date}}' })
            : t('progressBadges.notYet', { defaultValue: 'Not yet earned' })}
        </p>
        {earned && earnedLabel && (
          <p aria-hidden="true" className="text-[11px] text-foreground">
            {earnedLabel}
          </p>
        )}
      </div>

      {!earned && hint && (
        <div className="mt-auto w-full space-y-1">
          <Progress
            value={value}
            className="h-1.5"
            aria-label={t('progressBadges.progressLabel', { title, defaultValue: '{{title}} progress' })}
            // The shadcn wrapper keeps `value` for the indicator and never hands it
            // to Radix, so the bar would announce as indeterminate without this.
            aria-valuenow={value}
            aria-valuetext={valueText}
          />
          <p className="text-[11px] text-foreground">
            {ready
              ? t('progressBadges.readyToSync', {
                  defaultValue: 'Done. Shows as earned after the iPhone app syncs.',
                })
              : valueText}
          </p>
        </div>
      )}
    </div>
  );
}

export const AchievementBadge = memo(AchievementBadgeImpl);
