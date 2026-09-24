/**
 * Variety Fatigue banner (US-298).
 *
 * Computes per-recipe + per-ingredient fatigue from the user's plan entries
 * and surfaces a dismissible nudge when something has been served too often.
 * Best-effort persistence to `variety_fatigue_snapshots` so admin/analytics
 * can audit.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shuffle, X, Zap } from 'lucide-react';
import { usePlan, useRecipes, useFoods } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useVarietyNudgePref } from '@/hooks/useVarietyNudgePref';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { analytics } from '@/lib/analytics';
import { computeVarietyFatigue, type FatigueResult, type FatigueTier } from '@/lib/varietyFatigue';
import '@/i18n/appLocale';

const DISMISS_KEY = 'varietyFatigue.dismissedFor';
/** Re-show even when dismissed once a day has passed. */
const DISMISS_TTL_HOURS = 20;

interface DismissalState {
  /** ISO timestamp when the banner was dismissed */
  at: string;
  /** Recipe IDs that the user dismissed; new fatigue items reset the dismissal */
  itemIds: string[];
}

interface Props {
  /** Optional override for analytics surface tag, e.g. 'planner' or 'home'. */
  surface?: string;
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
  if (tier === 'high')
    return {
      bg: 'bg-destructive/5 border-destructive/30',
      icon: 'text-destructive',
      badge: 'bg-destructive/15 text-foreground border-destructive/30',
      label: t('varietyFatigue.tierHigh'),
    };
  return {
    bg: 'bg-warning/5 border-warning/30',
    icon: 'text-warning',
    badge: 'bg-warning/15 text-foreground border-warning/30',
    label: t('varietyFatigue.tierMedium'),
  };
}

export function VarietyFatigueBanner({ surface = 'unknown' }: Props) {
  const { t } = useTranslation();
  const { userId, householdId } = useAuth();
  const { planEntries } = usePlan();
  const { recipes } = useRecipes();
  const { foods } = useFoods();
  const { enabled: nudgesEnabled } = useVarietyNudgePref();
  const navigate = useNavigate();
  const [dismissal, setDismissal] = useLocalStorage<DismissalState | null>(DISMISS_KEY, null);

  const result: FatigueResult = useMemo(() => {
    const recipeNameById = new Map(recipes.map((r) => [r.id, r.name]));
    const foodNameById = new Map(foods.map((f) => [f.id, f.name]));
    return computeVarietyFatigue(
      {
        planEntries: planEntries.map((p) => ({
          recipeId: p.recipe_id ?? null,
          foodId: p.food_id ?? null,
          date: p.date,
        })),
        recipeNameById,
        foodNameById,
      },
      {}
    );
  }, [planEntries, recipes, foods]);

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
  const visibleItems = useMemo(() => {
    const all = [
      ...result.recipes.map((r) => ({ kind: 'recipe' as const, ...r })),
      ...result.ingredients.map((i) => ({ kind: 'ingredient' as const, ...i })),
    ];
    if (!dismissal) return all.slice(0, 3);
    const dismissedAt = new Date(dismissal.at).getTime();
    const ageHours = (Date.now() - dismissedAt) / (1000 * 60 * 60);
    if (ageHours >= DISMISS_TTL_HOURS) return all.slice(0, 3);
    const dismissedSet = new Set(dismissal.itemIds);
    const fresh = all.filter((it) => !dismissedSet.has(it.id));
    if (fresh.length === 0) return [];
    return fresh.slice(0, 3);
  }, [result, dismissal]);

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
          {visibleItems.length > 1 && (
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
