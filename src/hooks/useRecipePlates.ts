/**
 * Per-kid plating data layer (US-613).
 *
 * Loads the component structure (US-612) and ladder state the plate planner
 * needs, for a batch of candidate recipes at once — three queries for a whole
 * result list, not three per card.
 *
 * A recipe with no components produces no entry, which is how the plate
 * breakdown stays invisible for every recipe that has never been
 * deconstructed: the caller renders nothing rather than an empty section.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { isRung, type Rung } from '@/lib/exposureLadder';
import { normalizeRecipeComponents, type RecipeComponent } from '@/lib/recipeComponents';
import {
  planPlates,
  type KidPlate,
  type PlatingKid,
  type PlatingLadderRow,
} from '@/lib/platePlanner';
import type { SolverRecipe } from '@/lib/siblingConstraintSolver';

interface UseRecipePlatesArgs {
  /** Candidate recipes, already in solver shape. */
  recipes: SolverRecipe[];
  kids: PlatingKid[];
  /** ISO 'YYYY-MM-DD' treated as today. */
  today: string;
}

export interface UseRecipePlatesResult {
  /** recipeId -> one plate per kid. Absent for recipes with no components. */
  platesByRecipe: Map<string, KidPlate[]>;
  loading: boolean;
}

export function useRecipePlates({
  recipes,
  kids,
  today,
}: UseRecipePlatesArgs): UseRecipePlatesResult {
  const [components, setComponents] = useState<RecipeComponent[]>([]);
  const [componentFoods, setComponentFoods] = useState<{ componentId: string; foodId: string }[]>(
    []
  );
  const [ladder, setLadder] = useState<PlatingLadderRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Stable keys so the effect does not re-run on every parent render.
  const recipeIdKey = useMemo(
    () => [...new Set(recipes.map((r) => r.id))].sort().join(','),
    [recipes]
  );
  const kidIdKey = useMemo(() => [...new Set(kids.map((k) => k.id))].sort().join(','), [kids]);

  useEffect(() => {
    const recipeIds = recipeIdKey ? recipeIdKey.split(',') : [];
    const kidIds = kidIdKey ? kidIdKey.split(',') : [];

    if (recipeIds.length === 0) {
      setComponents([]);
      setComponentFoods([]);
      setLadder([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data: componentRows, error: componentError } = await supabase
          .from('recipe_components')
          .select('*')
          .in('recipe_id', recipeIds);
        if (componentError) throw componentError;
        if (cancelled) return;

        const normalized = normalizeRecipeComponents(componentRows ?? []);
        setComponents(normalized);

        // Only worth a second round-trip once we know some recipe here has
        // been deconstructed at all.
        if (normalized.length === 0) {
          setComponentFoods([]);
          setLadder([]);
          return;
        }

        const [{ data: ingredientRows }, { data: ladderRows }] = await Promise.all([
          supabase
            .from('recipe_ingredients')
            .select('component_id, food_id')
            .in('recipe_id', recipeIds),
          kidIds.length > 0
            ? supabase
                .from('kid_food_ladder')
                .select('kid_id, food_id, current_rung, status, next_due_on')
                .in('kid_id', kidIds)
            : Promise.resolve({ data: [] as never[] }),
        ]);
        if (cancelled) return;

        setComponentFoods(
          (ingredientRows ?? [])
            .filter(
              (row): row is { component_id: string; food_id: string } =>
                !!row.component_id && !!row.food_id
            )
            .map((row) => ({ componentId: row.component_id, foodId: row.food_id }))
        );

        setLadder(
          (ladderRows ?? []).map((row) => ({
            kidId: row.kid_id,
            foodId: row.food_id,
            currentRung: (isRung(row.current_rung) ? row.current_rung : 'looking') as Rung,
            status: row.status,
            nextDueOn: row.next_due_on,
          }))
        );
      } catch (err) {
        if (!cancelled) {
          // The breakdown is additive to the result card: on failure it is
          // simply absent, and the rest of the card still renders.
          logger.error('Plate planning load failed:', err);
          setComponents([]);
          setComponentFoods([]);
          setLadder([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recipeIdKey, kidIdKey]);

  const platesByRecipe = useMemo(() => {
    const byRecipe = new Map<string, KidPlate[]>();
    if (components.length === 0 || kids.length === 0) return byRecipe;

    const componentsByRecipe = new Map<string, RecipeComponent[]>();
    for (const component of components) {
      const list = componentsByRecipe.get(component.recipeId);
      if (list) list.push(component);
      else componentsByRecipe.set(component.recipeId, [component]);
    }

    for (const recipe of recipes) {
      const recipeComponents = componentsByRecipe.get(recipe.id);
      if (!recipeComponents || recipeComponents.length === 0) continue;

      const componentIds = new Set(recipeComponents.map((c) => c.id));
      byRecipe.set(
        recipe.id,
        planPlates({
          recipe,
          components: recipeComponents,
          componentFoods: componentFoods.filter((link) => componentIds.has(link.componentId)),
          kids,
          ladder,
          today,
        })
      );
    }

    return byRecipe;
  }, [recipes, components, componentFoods, kids, ladder, today]);

  return { platesByRecipe, loading };
}
