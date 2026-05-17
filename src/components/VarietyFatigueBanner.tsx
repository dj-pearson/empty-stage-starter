/**
 * Variety Fatigue banner (US-298).
 *
 * Computes per-recipe + per-ingredient fatigue from the user's plan entries
 * and surfaces a dismissible nudge when something has been served too often.
 * Best-effort persistence to `variety_fatigue_snapshots` so admin/analytics
 * can audit.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shuffle, X, Zap } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useVarietyNudgePref } from '@/hooks/useVarietyNudgePref';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { analytics } from '@/lib/analytics';
import { computeVarietyFatigue, type FatigueResult, type FatigueTier } from '@/lib/varietyFatigue';

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

function tierTone(tier: FatigueTier) {
  if (tier === 'high')
    return {
      bg: 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300/50 dark:border-rose-900/40',
      icon: 'text-rose-500',
      badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
      label: 'High repeat',
    };
  return {
    bg: 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300/50 dark:border-amber-900/40',
    icon: 'text-amber-500',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    label: 'Repeating',
  };
}

export function VarietyFatigueBanner({ surface = 'unknown' }: Props) {
  const { planEntries, recipes, foods } = useApp();
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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (result.worstTier === 'none') return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data: member } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)
          .maybeSingle();
        const hh = (member as { household_id?: string } | null)?.household_id;
        if (!hh || cancelled) return;
        await supabase.from('variety_fatigue_snapshots').upsert(
          {
            household_id: hh,
            user_id: user.id,
            computed_for: result.computedFor,
            window_days: 28,
            top_recipes: result.recipes.map((r) => ({
              recipe_id: r.id,
              recipe_name: r.name,
              repeat_count: r.longWindowCount,
              fatigue_score: r.fatigueScore,
              tier: r.tier,
            })),
            top_ingredients: result.ingredients.map((i) => ({
              food_id: i.id,
              food_name: i.name,
              repeat_count: i.longWindowCount,
              fatigue_score: i.fatigueScore,
              tier: i.tier,
            })),
            worst_tier: result.worstTier,
          },
          { onConflict: 'household_id,computed_for' }
        );
      } catch (err) {
        logger.warn('variety_fatigue_snapshots upsert failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result]);

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
  const tone = tierTone(top.tier);

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
              {top.kind === 'recipe' ? top.name : `${top.name} (ingredient)`} - served{' '}
              {top.shortWindowCount} time{top.shortWindowCount === 1 ? '' : 's'} this week
              {top.longWindowCount > top.shortWindowCount && `, ${top.longWindowCount} in 4 weeks`}.
            </p>
          </div>
          {visibleItems.length > 1 && (
            <p className="text-xs text-muted-foreground mt-1">
              Also repeating:{' '}
              {visibleItems
                .slice(1)
                .map((i) => i.name)
                .join(', ')}
              .
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Time to switch it up? We'll suggest meals everyone will eat.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleSwitchItUp}
            className="gap-1"
            aria-label="Find a different meal"
          >
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            Switch it up
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            aria-label="Dismiss variety fatigue banner"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
