import { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Check, Clock, RefreshCw, ShoppingCart, ChefHat, ImageIcon, Loader2 } from "lucide-react";
import { useFoods, useGrocery, usePlan, useRecipes } from "@/contexts/AppContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { Food, Kid, PlanEntry } from "@/types";
import type { TonightSuggestion } from "@/lib/tonightMode";
import {
  buildResultIndex,
  countUncheckedIngredients,
  getKidRecipeFit,
  summarizeKidFits,
  type ItemFit,
} from "@/lib/kidFit";
import { useDefaultGroceryListId } from "@/hooks/useDefaultGroceryListId";
import { useTodayKey } from "@/hooks/useTonightPlan";
import { KidFitBadges } from "@/components/recipes/KidFitBadges";
import { TonightCookDialog } from "@/components/TonightCookDialog";
import "@/i18n/appLocale";

interface Props {
  open: boolean;
  loading: boolean;
  suggestions: TonightSuggestion[] | null;
  kids: Kid[];
  selectedKidIds: string[];
  onSelectedKidIdsChange: (ids: string[]) => void;
  onClose: () => void;
  onRefresh: () => void;
}

export function TonightSuggestionsDialog({
  open,
  loading,
  suggestions,
  kids,
  selectedKidIds,
  onSelectedKidIdsChange,
  onClose,
  onRefresh,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { recipes } = useRecipes();
  const { foods } = useFoods();
  const { planEntries, addPlanEntries } = usePlan();
  const { mergeGroceryItems, deleteGroceryItems, updateGroceryItem } = useGrocery();
  const defaultListId = useDefaultGroceryListId();
  const today = useTodayKey();
  const [cookingRecipeId, setCookingRecipeId] = useState<string | null>(null);
  const [addedRecipeIds, setAddedRecipeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  const cookingRecipe = useMemo(
    () => (cookingRecipeId ? recipes.find((r) => r.id === cookingRecipeId) ?? null : null),
    [recipes, cookingRecipeId],
  );

  const foodById = useMemo(() => new Map<string, Food>(foods.map((f) => [f.id, f])), [foods]);
  const selectedKids = useMemo(() => {
    const ids = new Set(selectedKidIds);
    const picked = kids.filter((k) => ids.has(k.id));
    return picked.length > 0 ? picked : kids;
  }, [kids, selectedKidIds]);

  // Fit per suggestion from the kid's own profile and history, so a kid whose
  // allergy list is unknown reads as unknown, never as "safe".
  const fitByRecipe = useMemo(() => {
    const out = new Map<string, ItemFit>();
    if (!suggestions) return out;
    const indexes = new Map(selectedKids.map((k) => [k.id, buildResultIndex(planEntries, k.id, today)]));
    for (const s of suggestions) {
      const recipe = recipes.find((r) => r.id === s.recipeId);
      if (!recipe) continue;
      const perKid = selectedKids.map((kid) => ({
        kid,
        fit: getKidRecipeFit(kid, recipe, foodById, indexes.get(kid.id) ?? new Map()),
      }));
      const unknownKidIds = selectedKids.filter((k) => k.allergens == null).map((k) => k.id);
      out.set(
        s.recipeId,
        summarizeKidFits(perKid, { unchecked: countUncheckedIngredients(recipe, foodById), unknownKidIds }),
      );
    }
    return out;
  }, [suggestions, selectedKids, planEntries, today, recipes, foodById]);

  const onCookNow = useCallback(
    async (s: TonightSuggestion, rank: number) => {
      analytics.trackEvent("tonight_suggestion_chosen", {
        rank,
        recipe_id: s.recipeId,
        prep_minutes: s.prepMinutes,
        missing_count: s.missingFoodIds.length,
        variety_score: s.varietyScore,
        source: s.source,
      });

      // Put it on tonight's plan, so the home hero shows it and it can be logged.
      const recipe = recipes.find((r) => r.id === s.recipeId);
      const foodIds = recipe?.food_ids ?? [];
      const alreadyOn = new Set(
        planEntries
          .filter((e) => e.date.slice(0, 10) === today && e.meal_slot === "dinner" && e.recipe_id === s.recipeId)
          .map((e) => e.kid_id),
      );
      const rows: Omit<PlanEntry, "id">[] = [];
      for (const kid of selectedKids) {
        if (alreadyOn.has(kid.id)) continue;
        foodIds.forEach((foodId, i) => {
          rows.push({
            kid_id: kid.id,
            date: today,
            meal_slot: "dinner",
            food_id: foodId,
            recipe_id: s.recipeId,
            is_primary_dish: i === 0,
            result: null,
          });
        });
      }

      if (rows.length > 0) {
        setSchedulingId(s.recipeId);
        const { error } = await addPlanEntries(rows);
        setSchedulingId(null);
        if (error) {
          toast.error(t("tonightMode.dialog.planFailed", { defaultValue: "Couldn't add it to tonight's plan. Try again." }));
          return;
        }
      }

      onClose();
      setCookingRecipeId(s.recipeId);
    },
    [recipes, planEntries, today, selectedKids, addPlanEntries, onClose, t],
  );

  const onAddMissingToGrocery = useCallback(
    (s: TonightSuggestion) => {
      if (s.missingIngredients.length === 0 || addedRecipeIds.has(s.recipeId)) return;
      const result = mergeGroceryItems(
        s.missingIngredients.map((item) => ({
          name: item.name,
          quantity: 1,
          unit: "",
          category: foodById.get(item.id)?.category ?? "other",
          added_via: "tonight_mode",
          source_recipe_id: s.recipeId,
        })),
        { defaultListId },
      );
      setAddedRecipeIds((prev) => new Set(prev).add(s.recipeId));
      toast.success(
        t("tonightMode.dialog.addedToGrocery", {
          defaultValue: "Added {{count}} items to the grocery list",
          count: result.touched,
        }),
        {
          action: {
            label: t("tonightMode.dialog.undo", { defaultValue: "Undo" }),
            onClick: () => {
              if (result.insertedIds.length > 0) deleteGroceryItems(result.insertedIds);
              for (const bump of result.bumps) updateGroceryItem(bump.id, bump.prev);
              setAddedRecipeIds((prev) => {
                const next = new Set(prev);
                next.delete(s.recipeId);
                return next;
              });
            },
          },
        },
      );
      analytics.trackEvent("tonight_missing_added_to_grocery", {
        recipe_id: s.recipeId,
        item_count: s.missingIngredients.length,
      });
    },
    [addedRecipeIds, mergeGroceryItems, foodById, defaultListId, deleteGroceryItems, updateGroceryItem, t],
  );

  const onDeliveryFallback = useCallback(() => {
    analytics.trackEvent("tonight_delivery_fallback_chosen", {});
    onClose();
    navigate("/dashboard/grocery");
  }, [navigate, onClose]);

  const onClearKidSelection = useCallback(() => {
    onSelectedKidIdsChange([]);
    onRefresh();
  }, [onSelectedKidIdsChange, onRefresh]);

  const allKidIds = useMemo(() => kids.map((k) => k.id), [kids]);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("tonightMode.dialog.title", { defaultValue: "Dinner tonight" })}
            </DialogTitle>
            <DialogDescription>
              {t("tonightMode.dialog.description", {
                defaultValue: "Picks based on what's in your pantry and who's eating.",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 my-2">
            <span className="text-sm text-muted-foreground mr-1">
              {t("tonightMode.dialog.cookingFor", { defaultValue: "Cooking for:" })}
            </span>
            <ToggleGroup
              type="multiple"
              value={selectedKidIds}
              onValueChange={(v) => {
                onSelectedKidIdsChange(v.length === 0 ? allKidIds : v);
                onRefresh();
              }}
              className="flex-wrap"
              aria-label={t("tonightMode.dialog.selectKids", { defaultValue: "Select kids cooking for tonight" })}
            >
              {kids.map((k) => (
                <ToggleGroupItem
                  key={k.id}
                  value={k.id}
                  size="sm"
                  className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {k.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {selectedKidIds.length > 0 && selectedKidIds.length < kids.length && (
              <Button variant="ghost" size="sm" onClick={onClearKidSelection} className="text-xs">
                {t("tonightMode.dialog.allKids", { defaultValue: "All kids" })}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="ml-auto gap-1"
              disabled={loading}
              aria-label={t("tonightMode.dialog.refreshLabel", { defaultValue: "Refresh suggestions" })}
            >
              <RefreshCw
                className={cn("h-3 w-3", loading && "animate-spin motion-reduce:animate-none")}
                aria-hidden="true"
              />
              {t("tonightMode.dialog.refresh", { defaultValue: "Refresh" })}
            </Button>
          </div>

          {loading && suggestions === null && (
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full motion-reduce:animate-none" />
              ))}
            </div>
          )}

          {!loading && suggestions !== null && suggestions.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm font-medium mb-1">
                {t("tonightMode.dialog.emptyTitle", { defaultValue: "Nothing matches your pantry yet." })}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {t("tonightMode.dialog.emptyBody", {
                  defaultValue: "Add a few staples or order a quick delivery to get going.",
                })}
              </p>
              <Button onClick={onDeliveryFallback} size="sm" variant="outline">
                <ShoppingCart className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("tonightMode.dialog.openDelivery", { defaultValue: "Open grocery delivery" })}
              </Button>
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <ul className="space-y-3" aria-label={t("tonightMode.dialog.listLabel", { defaultValue: "Tonight suggestions" })}>
              {suggestions.map((s, idx) => (
                <li key={s.recipeId}>
                  <SuggestionRow
                    suggestion={s}
                    rank={idx}
                    fit={fitByRecipe.get(s.recipeId)}
                    added={addedRecipeIds.has(s.recipeId)}
                    scheduling={schedulingId === s.recipeId}
                    onCook={() => void onCookNow(s, idx)}
                    onAddMissing={() => onAddMissingToGrocery(s)}
                  />
                </li>
              ))}
            </ul>
          )}

          {suggestions && suggestions.length > 0 && suggestions[0].pantryCoveragePct < 0.4 && (
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm flex items-center justify-between gap-2">
              <span className="text-foreground">
                {t("tonightMode.dialog.bestNeeds", {
                  defaultValue: "Best match still needs {{count}} items.",
                  count: suggestions[0].missingIngredients.length,
                })}
              </span>
              <Button onClick={onDeliveryFallback} size="sm" variant="outline">
                <ShoppingCart className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("tonightMode.dialog.delivered", { defaultValue: "Get them delivered" })}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TonightCookDialog
        recipe={cookingRecipe}
        open={cookingRecipeId !== null}
        onClose={() => setCookingRecipeId(null)}
      />
    </>
  );
}

interface SuggestionRowProps {
  suggestion: TonightSuggestion;
  rank: number;
  fit: ItemFit | undefined;
  added: boolean;
  scheduling: boolean;
  onCook: () => void;
  onAddMissing: () => void;
}

function SuggestionRow({ suggestion, rank, fit, added, scheduling, onCook, onAddMissing }: SuggestionRowProps) {
  const { t } = useTranslation();
  const pantryPct = Math.round(suggestion.pantryCoveragePct * 100);
  const missingCount = suggestion.missingIngredients.length;

  return (
    <article className="rounded-lg border bg-card p-4 flex gap-4">
      <div className="hidden sm:flex h-20 w-20 rounded-md bg-muted shrink-0 items-center justify-center overflow-hidden">
        {suggestion.imageUrl ? (
          <img src={suggestion.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h3 className="font-semibold truncate">
            {rank === 0 && (
              <Badge variant="secondary" className="mr-2">
                {t("tonightMode.dialog.topPick", { defaultValue: "Top pick" })}
              </Badge>
            )}
            {suggestion.name}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {t("tonightMode.dialog.minutes", { defaultValue: "{{count}} min", count: suggestion.prepMinutes })}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t("tonightMode.dialog.inPantry", { defaultValue: "{{pct}}% in pantry", pct: pantryPct })}</span>
          {missingCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t("tonightMode.dialog.missing", { defaultValue: "{{count}} missing", count: missingCount })}</span>
            </>
          )}
        </div>

        <KidFitBadges fit={fit} mode="compact" className="mb-2" />

        <div className="flex flex-wrap gap-2">
          <Button onClick={onCook} size="sm" disabled={scheduling}>
            {scheduling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <ChefHat className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            {t("tonightMode.dialog.cookNow", { defaultValue: "Cook now" })}
          </Button>
          {missingCount > 0 && (
            <Button onClick={onAddMissing} size="sm" variant="outline" disabled={added}>
              {added ? (
                <Check className="h-4 w-4 mr-2" aria-hidden="true" />
              ) : (
                <ShoppingCart className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {added
                ? t("tonightMode.dialog.onList", { defaultValue: "On the grocery list" })
                : t("tonightMode.dialog.addMissing", { defaultValue: "Add {{count}} to grocery", count: missingCount })}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
