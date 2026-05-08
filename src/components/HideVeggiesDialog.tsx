/**
 * Hide Veggies dialog (US-297).
 *
 * Loads the active hidden_veggie_techniques catalog, runs the pure rewriter
 * against the recipe + selected kids, shows up to N rewrite candidates with
 * an ingredient diff and stealth tip. "Save as variant" clones the recipe
 * via AppContext.addRecipe with parent_recipe_id set.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Salad, Sparkles, Plus, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useApp } from '@/contexts/AppContext';
import { analytics } from '@/lib/analytics';
import {
  applyRewriteToRecipe,
  generateHiddenVeggieRewrites,
  type HiddenVeggieTechnique,
  type Rewrite,
} from '@/lib/hiddenVeggieRewriter';
import type { Recipe } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe | null;
  /** Optional list of kid IDs whose preferences/allergens to honor. */
  kidIds?: string[];
  /** Called after a variant is saved with the new recipe. */
  onVariantSaved?: (variant: Recipe) => void;
}

interface TechniqueRow {
  id: string;
  veggie_name: string;
  veggie_allergens: string[] | null;
  recipe_keywords: string[] | null;
  recipe_categories: string[] | null;
  technique: string;
  prep_method: string;
  max_ratio: number;
  suggested_amount: string;
  instruction_template: string;
  stealth_tip: string;
  stealth_score: number;
}

function rowToTechnique(r: TechniqueRow): HiddenVeggieTechnique {
  return {
    id: r.id,
    veggieName: r.veggie_name,
    veggieAllergens: r.veggie_allergens ?? [],
    recipeKeywords: r.recipe_keywords ?? [],
    recipeCategories: r.recipe_categories ?? [],
    technique: r.technique,
    prepMethod: r.prep_method,
    maxRatio: Number(r.max_ratio),
    suggestedAmount: r.suggested_amount,
    instructionTemplate: r.instruction_template,
    stealthTip: r.stealth_tip,
    stealthScore: r.stealth_score,
  };
}

export function HideVeggiesDialog({ open, onOpenChange, recipe, kidIds, onVariantSaved }: Props) {
  const { kids, foods, addRecipe } = useApp();
  const [techniques, setTechniques] = useState<HiddenVeggieTechnique[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || techniques !== null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('hidden_veggie_techniques')
          .select(
            'id, veggie_name, veggie_allergens, recipe_keywords, recipe_categories, technique, prep_method, max_ratio, suggested_amount, instruction_template, stealth_tip, stealth_score'
          )
          .eq('is_active', true);
        if (cancelled) return;
        if (error) {
          logger.warn('hidden_veggie_techniques load failed', error);
          setTechniques([]);
        } else {
          setTechniques(((data as TechniqueRow[] | null) ?? []).map(rowToTechnique));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, techniques]);

  const targetKids = useMemo(() => {
    const ids = kidIds && kidIds.length > 0 ? kidIds : kids.map((k) => k.id);
    const set = new Set(ids);
    return kids.filter((k) => set.has(k.id));
  }, [kids, kidIds]);

  const rewrites: Rewrite[] = useMemo(() => {
    if (!recipe || techniques === null || techniques.length === 0) return [];
    const existingFoodNames = (recipe.food_ids ?? [])
      .map((id) => foods.find((f) => f.id === id)?.name)
      .filter((x): x is string => typeof x === 'string');
    return generateHiddenVeggieRewrites(
      {
        recipe: {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description ?? null,
          category: recipe.category ?? null,
          instructions: recipe.instructions ?? null,
          existingFoodNames,
        },
        techniques,
        kids: targetKids.map((k) => ({
          id: k.id,
          name: k.name,
          allergens: k.allergens ?? [],
          dislikedFoods: k.disliked_foods ?? [],
        })),
      },
      { limit: 3, minStealthScore: 70 }
    );
  }, [recipe, techniques, foods, targetKids]);

  const handleSave = async (rewrite: Rewrite) => {
    if (!recipe) return;
    setSavingId(rewrite.techniqueId);
    try {
      const applied = applyRewriteToRecipe(
        {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description ?? null,
          category: recipe.category ?? null,
          instructions: recipe.instructions ?? null,
          additionalIngredients: recipe.additionalIngredients ?? null,
          tips: recipe.tips ?? null,
        },
        rewrite
      );

      const variant = await addRecipe({
        name: applied.variantName,
        description: recipe.description,
        food_ids: recipe.food_ids,
        category: recipe.category,
        instructions: applied.updatedInstructions,
        prepTime: recipe.prepTime,
        cookTime: recipe.cookTime,
        servings: recipe.servings,
        additionalIngredients: applied.additionalIngredientsAddendum,
        tips: applied.updatedTips,
        assigned_kid_ids: recipe.assigned_kid_ids,
        image_url: recipe.image_url,
        source_url: recipe.source_url,
        source_type: recipe.source_type,
        tags: [...(recipe.tags ?? []), 'hidden-veggies'],
        rating: recipe.rating,
        total_time_minutes: recipe.total_time_minutes,
        difficulty_level: recipe.difficulty_level,
        kid_friendly_score: recipe.kid_friendly_score,
        nutrition_info: recipe.nutrition_info,
        parent_recipe_id: recipe.id,
        variant_kind: 'hidden_veggies',
      });

      analytics.trackEvent('hidden_veggies_variant_saved', {
        original_recipe_id: recipe.id,
        veggie: rewrite.veggieName,
        technique_id: rewrite.techniqueId,
        stealth_score: rewrite.stealthScore,
        kid_count: targetKids.length,
      });
      toast.success(`Saved as "${applied.variantName}"`);
      onVariantSaved?.(variant);
      onOpenChange(false);
    } catch (err) {
      logger.error('hidden veggies save failed', err);
      toast.error("Couldn't save the variant.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Salad className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Sneak veggies in
          </DialogTitle>
          <DialogDescription>
            We'll generate a variant of <span className="font-medium">{recipe?.name}</span> with a
            hidden veggie - the original stays untouched.
          </DialogDescription>
        </DialogHeader>

        {loading && techniques === null && (
          <div className="space-y-3" aria-live="polite" aria-busy="true">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!loading && rewrites.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              No matching veggie techniques for this recipe.
            </p>
            <p className="mt-1">
              Our catalog covers cheese sauces, baked goods, smoothies, sauces, and ground-meat
              dishes. Edit the recipe name or instructions to include a recognized dish (e.g. "mac
              and cheese", "muffins") and try again.
            </p>
          </div>
        )}

        {!loading && rewrites.length > 0 && (
          <ul className="space-y-3" aria-label="Hidden veggie rewrites">
            {rewrites.map((r) => (
              <li key={r.techniqueId} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    <Salad className="h-3 w-3 mr-1" aria-hidden="true" />
                    {r.veggieName}
                  </Badge>
                  <Badge variant="outline">{r.addedIngredient.technique}</Badge>
                  <Badge variant="secondary" className="bg-muted">
                    <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
                    {r.stealthScore}/100 stealth
                  </Badge>
                </div>

                <div>
                  <p className="text-sm font-semibold">{r.variantName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.matchReasons.join(' - ')}
                  </p>
                </div>

                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40 p-2.5 text-sm">
                  <p className="font-semibold text-emerald-900 dark:text-emerald-200 mb-1 flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add to ingredients
                  </p>
                  <p className="text-foreground">{r.addedIngredient.amount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Prep: {r.addedIngredient.prepMethod.replace(/_/g, ' ')}
                  </p>
                </div>

                <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 p-2.5 text-sm">
                  <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
                    Add this step
                  </p>
                  <p className="text-foreground">{r.addedStep.text}</p>
                </div>

                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <p>{r.stealthTip}</p>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => handleSave(r)} disabled={savingId !== null} size="sm">
                    {savingId === r.techniqueId ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                    )}
                    Save as variant
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
