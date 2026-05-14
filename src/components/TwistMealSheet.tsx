/**
 * US-298: "Twist this meal" sheet.
 *
 * Opens when a parent taps the variety-fatigue chip on a planner entry.
 * Shows up to 3 alternative recipes ranked by `pickTwistCandidates`,
 * with a short "why" chip row per candidate (Same prep time, Family
 * favorite, ...). Choosing one fires `onSwap(candidateId)` and the
 * parent handles the actual plan_entry update.
 */

import { useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCcw, Clock, Sparkles } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { pickTwistCandidates } from '@/lib/varietyTwistPicker';
import type { Food, Recipe } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The recipe the user is feeling fatigued by. */
  original: Recipe | null;
  /** Full recipe library to pick from. */
  recipes: Recipe[];
  /** Pantry foods, needed for primary-protein similarity. */
  foods: Food[];
  /** Reads the precomputed fatigue score map at the parent. */
  fatigueScoreFor: (recipeId: string) => number;
  /** Caller swaps the plan entry's recipe_id. Receives the chosen
   *  candidate's recipe id. */
  onSwap: (newRecipeId: string) => void;
}

export function TwistMealSheet({
  open,
  onOpenChange,
  original,
  recipes,
  foods,
  fatigueScoreFor,
  onSwap,
}: Props) {
  const foodById = useMemo(
    () => new Map(foods.map((f) => [f.id, f])),
    [foods]
  );

  const candidates = useMemo(() => {
    if (!original) return [];
    return pickTwistCandidates({
      original,
      allRecipes: recipes,
      foodById,
      fatigueScoreFor,
    });
  }, [original, recipes, foodById, fatigueScoreFor]);

  // US-298: fire variety_twist_sheet_opened on every open transition.
  // Triggers whether the parent flipped open=true programmatically (the
  // chip-tap path) or the user re-opened via Sheet's own affordances —
  // both flows are equally interesting to the funnel.
  useEffect(() => {
    if (open && original) {
      analytics.trackEvent('variety_twist_sheet_opened', {
        original_recipe_id: original.id,
        candidate_count: candidates.length,
      });
    }
  }, [open, original?.id, candidates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwap = (candidateRecipeId: string) => {
    if (!original) return;
    analytics.trackEvent('variety_twist_chosen', {
      original_recipe_id: original.id,
      twist_recipe_id: candidateRecipeId,
      candidate_count: candidates.length,
    });
    onSwap(candidateRecipeId);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <RefreshCcw className="h-5 w-5 text-amber-600" aria-hidden="true" />
            Twist this meal
          </SheetTitle>
          <SheetDescription>
            {original
              ? `You've been making ${original.name} a lot lately. Here are some similar-but-different ideas.`
              : 'Pick an alternative meal.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {candidates.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground text-center">
                <Sparkles className="h-5 w-5 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
                <p>
                  Your library doesn't have a close alternative right now.
                  Try importing a few more dinners and we'll surface them here.
                </p>
              </CardContent>
            </Card>
          ) : (
            candidates.map((c) => (
              <Card key={c.recipe.id}>
                <CardContent className="p-4 flex items-start gap-3">
                  {c.recipe.image_url ? (
                    <img
                      src={c.recipe.image_url}
                      alt=""
                      className="h-16 w-16 rounded-md object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-md bg-muted shrink-0" aria-hidden="true" />
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="font-semibold text-sm truncate">{c.recipe.name}</p>
                    {c.prepMinutes > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {c.prepMinutes} min
                      </p>
                    )}
                    {c.reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.reasons.slice(0, 3).map((r) => (
                          <Badge
                            key={r}
                            variant="secondary"
                            className="text-[10px] py-0 px-1.5"
                          >
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSwap(c.recipe.id)}
                    aria-label={`Swap in ${c.recipe.name}`}
                  >
                    Swap in
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
