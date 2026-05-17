/**
 * US-298: Dashboard insight card — "Your top 3 most-repeated meals this month".
 *
 * Reads the same client-side variety-fatigue computation the planner chip and
 * the VarietyFatigueBanner use, surfaces the top repeated recipes, and offers
 * a one-tap pivot to the meal finder. Hidden entirely when:
 *   - the user turned off "Variety nudges" (useVarietyNudgePref), or
 *   - nothing scores at/above the 'mild' fatigue tier.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Repeat, Shuffle } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useVarietyNudgePref } from '@/hooks/useVarietyNudgePref';
import { analytics } from '@/lib/analytics';
import { computeVarietyFatigue, type FatigueItem } from '@/lib/varietyFatigue';

export function MostRepeatedMealsCard() {
  const { planEntries, recipes, foods } = useApp();
  const { enabled: nudgesEnabled } = useVarietyNudgePref();
  const navigate = useNavigate();

  const topRecipes: FatigueItem[] = useMemo(() => {
    if (!nudgesEnabled) return [];
    const recipeNameById = new Map(recipes.map((r) => [r.id, r.name]));
    const foodNameById = new Map(foods.map((f) => [f.id, f.name]));
    const result = computeVarietyFatigue(
      {
        planEntries: planEntries.map((p) => ({
          recipeId: p.recipe_id ?? null,
          foodId: p.food_id ?? null,
          date: p.date,
        })),
        recipeNameById,
        foodNameById,
      },
      { limit: 3 }
    );
    return result.recipes.slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planEntries.length, recipes.length, foods.length, nudgesEnabled]);

  const shownRef = useRef(false);
  useEffect(() => {
    if (topRecipes.length > 0 && !shownRef.current) {
      shownRef.current = true;
      analytics.trackEvent('variety_most_repeated_card_shown', {
        count: topRecipes.length,
        worst_tier: topRecipes[0]?.tier,
      });
    }
  }, [topRecipes]);

  if (!nudgesEnabled || topRecipes.length === 0) return null;

  const handleSwitchItUp = (recipeId: string) => {
    analytics.trackEvent('variety_most_repeated_switch_clicked', { recipe_id: recipeId });
    navigate('/dashboard/sibling-meal-finder');
  };

  return (
    <Card className="mb-4 border-amber-300/50 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4 text-amber-500" aria-hidden="true" />
          Your top {topRecipes.length} most-repeated meals this month
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {topRecipes.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                {r.longWindowCount}x in the last 4 weeks
                {r.shortWindowCount > 0 && ` · ${r.shortWindowCount}x this week`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="outline"
                className={
                  r.tier === 'high'
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                }
              >
                {r.tier === 'high' ? 'High repeat' : 'Repeating'}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1"
                onClick={() => handleSwitchItUp(r.id)}
                aria-label={`Switch up ${r.name}`}
              >
                <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                Switch
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
