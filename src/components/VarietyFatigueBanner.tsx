/**
 * Variety Fatigue banner (US-298).
 *
 * Computes per-recipe + per-ingredient fatigue from the user's plan entries
 * and surfaces a dismissible nudge when something has been served too often.
 * Best-effort persistence to `variety_fatigue_snapshots` so admin/analytics
 * can audit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shuffle, X, Zap } from 'lucide-react';
import { usePlan, useRecipes, useFoods } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useVarietyNudgePref } from '@/hooks/useVarietyNudgePref';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { analytics } from '@/lib/analytics';
import { insightTone } from '@/lib/insightTone';
import {
  selectVarietyFatigue,
  visibleFatigueItems,
  type FatigueDismissal,
  type FatigueResult,
  type FatigueTier,
} from '@/lib/varietyFatigue';
import '@/i18n/appLocale';

interface Props {
  /** Optional override for analytics surface tag, e.g. 'planner' or 'home'. */
  surface?: string;
  /**
   * List each repeating meal with its counts (the Home insight slot, which
   * folded the old "most-repeated meals" card into this one). The planner
   * keeps the one-line form.
   */
  showTopMeals?: boolean;
  /** Called after the parent dismisses the nudge. */
  onDismiss?: () => void;
}

/**
 * localStorage key for the dismissal, per signed-in user: one browser shared by
 * two parents should not let one of them silence the other's nudge. Kept on
 * sign-out, like the web sync queue, because the user id already scopes it.
 */
export function fatigueDismissKey(userId: string | null | undefined): string {
  return `varietyFatigue.dismissedFor.${userId ?? 'anon'}`;
}

/**
 * Read the dismissal without subscribing, for the Home insight slot's
 * predicate. Null when absent, malformed or when storage is unavailable.
 */
export function readFatigueDismissal(userId: string | null | undefined): FatigueDismissal | null {
  try {
    const raw = window.localStorage.getItem(fatigueDismissKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as FatigueDismissal).at === 'string' &&
      Array.isArray((parsed as FatigueDismissal).itemIds)
    ) {
      return parsed as FatigueDismissal;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Snapshot writes already made this session, keyed
 * `${householdId}:${computedFor}:${worstTier}`. The effect used to fire on
 * every recompute of `result` (every plan change, every mount of either
 * planner layout), each one a getUser round trip, a household lookup and an
 * upsert. One write per household per day per tier is all the table needs.
 */
const writtenSnapshots = new Set<string>();

function tierTone(tier: FatigueTier, t: TFunction) {
  const tone = insightTone(tier === 'high' ? 'high' : 'mild');
  return {
    bg: tone.surface,
    icon: tone.icon,
    badge: tone.badge,
    label: tier === 'high' ? t('varietyFatigue.tierHigh') : t('varietyFatigue.tierMedium'),
  };
}

export function VarietyFatigueBanner({ surface = 'unknown', showTopMeals = false, onDismiss }: Props) {
  const { t } = useTranslation();
  const { userId, householdId } = useAuth();
  const { planEntries } = usePlan();
  const { recipes } = useRecipes();
  const { foods } = useFoods();
  const { enabled: nudgesEnabled } = useVarietyNudgePref();
  const navigate = useNavigate();
  // Keyed per signed-in user: one browser shared by two parents should not
  // let one of them silence the other's nudge.
  const [dismissal, setDismissalState] = useState<FatigueDismissal | null>(() =>
    readFatigueDismissal(userId)
  );
  useEffect(() => {
    setDismissalState(readFatigueDismissal(userId));
  }, [userId]);
  const setDismissal = useCallback(
    (next: FatigueDismissal) => {
      setDismissalState(next);
      try {
        window.localStorage.setItem(fatigueDismissKey(userId), JSON.stringify(next));
      } catch {
        // Private mode or quota: the dismissal still holds for this session.
      }
    },
    [userId]
  );

  const result: FatigueResult = useMemo(
    () => selectVarietyFatigue(planEntries, recipes, foods),
    [planEntries, recipes, foods]
  );

  // Persist the snapshot once per day per household (best-effort).
  const snapshotKey =
    householdId && result.worstTier !== 'none'
      ? `${householdId}:${result.computedFor}:${result.worstTier}`
      : null;
  const resultRef = useRef(result);
  resultRef.current = result;
  useEffect(() => {
    if (!snapshotKey || !householdId || !userId || writtenSnapshots.has(snapshotKey)) return;
    writtenSnapshots.add(snapshotKey);
    const snap = resultRef.current;
    (async () => {
      try {
        const { error } = await supabase.from('variety_fatigue_snapshots').upsert(
          {
            household_id: householdId,
            user_id: userId,
            computed_for: snap.computedFor,
            window_days: 28,
            top_recipes: snap.recipes.map((r) => ({
              recipe_id: r.id,
              recipe_name: r.name,
              repeat_count: r.longWindowCount,
              fatigue_score: r.fatigueScore,
              tier: r.tier,
            })),
            top_ingredients: snap.ingredients.map((i) => ({
              food_id: i.id,
              food_name: i.name,
              repeat_count: i.longWindowCount,
              fatigue_score: i.fatigueScore,
              tier: i.tier,
            })),
            worst_tier: snap.worstTier,
          },
          { onConflict: 'household_id,computed_for' }
        );
        if (error) {
          // Let a later mount try again.
          writtenSnapshots.delete(snapshotKey);
          logger.warn('variety_fatigue_snapshots upsert failed', error);
        }
      } catch (err) {
        writtenSnapshots.delete(snapshotKey);
        logger.warn('variety_fatigue_snapshots upsert failed', err);
      }
    })();
  }, [snapshotKey, householdId, userId]);

  // Combine top fatigued items (recipes first), filtered by dismissal.
  const visibleItems = useMemo(() => visibleFatigueItems(result, dismissal), [result, dismissal]);

  if (!nudgesEnabled || result.worstTier === 'none' || visibleItems.length === 0) return null;

  const top = visibleItems[0];
  const tone = tierTone(top.tier, t);

  const handleSwitchItUp = () => {
    analytics.trackEvent('variety_fatigue_cta_clicked', {
      surface,
      worst_tier: result.worstTier,
      top_recipe_id: top.kind === 'recipe' ? top.id : null,
      top_food_id: top.kind === 'ingredient' ? top.id : null,
      item_count: visibleItems.length,
    });
    navigate('/dashboard/sibling-meal-finder');
  };

  const handleDismiss = () => {
    analytics.trackEvent('variety_fatigue_dismissed', {
      surface,
      worst_tier: result.worstTier,
      item_count: visibleItems.length,
    });
    setDismissal({
      at: new Date().toISOString(),
      itemIds: visibleItems.map((i) => i.id),
    });
    onDismiss?.();
  };

  return (
    <Card className={`mb-4 ${tone.bg} border`}>
      <CardContent className="py-3 flex flex-wrap items-start gap-3">
        <Zap className={`h-5 w-5 shrink-0 mt-0.5 ${tone.icon}`} aria-hidden="true" />
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={tone.badge}>
              {tone.label}
            </Badge>
            <p className="text-sm font-medium">
              {t('varietyFatigue.servedThisWeek', {
                name:
                  top.kind === 'recipe'
                    ? top.name
                    : t('varietyFatigue.ingredientSuffix', { name: top.name }),
                count: top.shortWindowCount,
              })}
              {top.longWindowCount > top.shortWindowCount &&
                t('varietyFatigue.inFourWeeks', { count: top.longWindowCount })}
              .
            </p>
          </div>
          {showTopMeals && visibleItems.length > 1 && (
            <ul className="mt-2 space-y-1">
              {visibleItems.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('home.insights.fatigue.counts', {
                      defaultValue: '{{long}}x in 4 weeks, {{short}}x this week',
                      long: item.longWindowCount,
                      short: item.shortWindowCount,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!showTopMeals && visibleItems.length > 1 && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('varietyFatigue.alsoRepeating', {
                names: visibleItems
                  .slice(1)
                  .map((i) => i.name)
                  .join(', '),
              })}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{t('varietyFatigue.prompt')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleSwitchItUp}
            className="gap-1"
            aria-label={t('varietyFatigue.switchItUpAria')}
          >
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            {t('varietyFatigue.switchItUp')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={handleDismiss}
            aria-label={t('varietyFatigue.dismissAria')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
