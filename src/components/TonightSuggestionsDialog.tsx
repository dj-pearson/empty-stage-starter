import { useMemo, useState, useCallback } from "react";
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
import {
  Clock,
  RefreshCw,
  ShoppingCart,
  ChefHat,
  CheckCircle2,
  AlertTriangle,
  Ban,
  ImageIcon,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { analytics } from "@/lib/analytics";
import type { Kid } from "@/types";
import type { TonightSuggestion } from "@/lib/tonightMode";
import { TonightCookDialog } from "@/components/TonightCookDialog";

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
  const navigate = useNavigate();
  const { recipes, addGroceryItem } = useApp();
  const [cookingRecipeId, setCookingRecipeId] = useState<string | null>(null);

  const cookingRecipe = useMemo(
    () => (cookingRecipeId ? recipes.find((r) => r.id === cookingRecipeId) ?? null : null),
    [recipes, cookingRecipeId],
  );

  const onCookNow = useCallback(
    (s: TonightSuggestion, rank: number) => {
      analytics.trackEvent("tonight_suggestion_chosen", {
        rank,
        recipe_id: s.recipeId,
        prep_minutes: s.prepMinutes,
        missing_count: s.missingFoodIds.length,
        variety_score: s.varietyScore,
        source: s.source,
      });
      setCookingRecipeId(s.recipeId);
    },
    [],
  );

  const onAddMissingToGrocery = useCallback(
    (s: TonightSuggestion) => {
      if (s.missingIngredients.length === 0) return;
      for (const item of s.missingIngredients) {
        addGroceryItem({
          name: item.name,
          quantity: 1,
          unit: "",
          category: "snack",
          added_via: "tonight_mode",
          source_recipe_id: s.recipeId,
        });
      }
      toast.success(`Added ${s.missingIngredients.length} items to grocery`);
      analytics.trackEvent("tonight_missing_added_to_grocery", {
        recipe_id: s.recipeId,
        item_count: s.missingIngredients.length,
      });
    },
    [addGroceryItem],
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
              <ChefHat className="h-5 w-5 text-orange-500" aria-hidden="true" />
              Dinner tonight
            </DialogTitle>
            <DialogDescription>
              Picks based on what's in your pantry and who's eating.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 my-2">
            <span className="text-sm text-muted-foreground mr-1">Cooking for:</span>
            <ToggleGroup
              type="multiple"
              value={selectedKidIds}
              onValueChange={(v) => {
                onSelectedKidIdsChange(v.length === 0 ? allKidIds : v);
                onRefresh();
              }}
              className="flex-wrap"
              aria-label="Select kids cooking for tonight"
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
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearKidSelection}
                className="text-xs"
              >
                All kids
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="ml-auto gap-1"
              disabled={loading}
              aria-label="Refresh suggestions"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </Button>
          </div>

          {loading && suggestions === null && (
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          )}

          {!loading && suggestions !== null && suggestions.length === 0 && (
            <div className="rounded-lg border border-dashed border-orange-300/40 p-6 text-center">
              <p className="text-sm font-medium mb-1">
                Nothing matches your pantry yet.
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Add a few staples or order a quick delivery to get going.
              </p>
              <Button onClick={onDeliveryFallback} size="sm" variant="outline">
                <ShoppingCart className="h-4 w-4 mr-2" aria-hidden="true" />
                Open grocery delivery
              </Button>
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <ul className="space-y-3" aria-label="Tonight suggestions">
              {suggestions.map((s, idx) => (
                <li key={s.recipeId}>
                  <SuggestionRow
                    suggestion={s}
                    rank={idx}
                    kids={kids}
                    onCook={() => onCookNow(s, idx)}
                    onAddMissing={() => onAddMissingToGrocery(s)}
                  />
                </li>
              ))}
            </ul>
          )}

          {suggestions && suggestions.length > 0 && suggestions[0].pantryCoveragePct < 0.4 && (
            <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-sm flex items-center justify-between">
              <span className="text-amber-900 dark:text-amber-200">
                Best match still needs {suggestions[0].missingIngredients.length} items.
              </span>
              <Button onClick={onDeliveryFallback} size="sm" variant="outline">
                <ShoppingCart className="h-4 w-4 mr-2" aria-hidden="true" />
                Get them delivered
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
  kids: Kid[];
  onCook: () => void;
  onAddMissing: () => void;
}

function SuggestionRow({ suggestion, rank, kids, onCook, onAddMissing }: SuggestionRowProps) {
  const pantryPct = Math.round(suggestion.pantryCoveragePct * 100);
  const missingCount = suggestion.missingIngredients.length;

  return (
    <article className="rounded-lg border bg-card p-4 flex gap-4 hover:shadow-sm transition-shadow">
      <div className="hidden sm:flex h-20 w-20 rounded-md bg-muted shrink-0 items-center justify-center overflow-hidden">
        {suggestion.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={suggestion.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h3 className="font-semibold truncate">
            {rank === 0 && (
              <Badge variant="secondary" className="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-0 mr-2">
                Top pick
              </Badge>
            )}
            {suggestion.name}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {suggestion.prepMinutes} min
          </span>
          <span aria-hidden="true">•</span>
          <span>{pantryPct}% in pantry</span>
          {missingCount > 0 && (
            <>
              <span aria-hidden="true">•</span>
              <span>{missingCount} missing</span>
            </>
          )}
        </div>

        <ul className="flex flex-wrap gap-1.5 mb-2" aria-label="Per-kid fit">
          {suggestion.kidFit.map((k) => {
            const kid = kids.find((x) => x.id === k.kidId);
            const status = k.allergenHits.length > 0
              ? "allergen"
              : k.blockingAversions.length > 0
                ? "warn"
                : "ok";
            return (
              <li key={k.kidId}>
                <KidFitChip
                  name={kid?.name ?? k.kidName}
                  status={status}
                  reason={
                    k.allergenHits.length > 0
                      ? `Contains ${k.allergenHits.join(", ")}`
                      : k.blockingAversions.length > 0
                        ? `Has ${k.blockingAversions.join(", ")}`
                        : "Safe foods only"
                  }
                />
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onCook} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
            <ChefHat className="h-4 w-4 mr-2" aria-hidden="true" />
            Cook now
          </Button>
          {missingCount > 0 && (
            <Button onClick={onAddMissing} size="sm" variant="outline">
              <ShoppingCart className="h-4 w-4 mr-2" aria-hidden="true" />
              Add {missingCount} to grocery
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function KidFitChip({
  name,
  status,
  reason,
}: {
  name: string;
  status: "ok" | "warn" | "allergen";
  reason: string;
}) {
  const cls =
    status === "allergen"
      ? "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30"
      : status === "warn"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30"
        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30";
  const Icon =
    status === "allergen" ? Ban : status === "warn" ? AlertTriangle : CheckCircle2;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${cls}`}
      title={reason}
      aria-label={`${name}: ${reason}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {name}
    </span>
  );
}
