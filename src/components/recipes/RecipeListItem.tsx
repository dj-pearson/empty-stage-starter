import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, Check, ChefHat, Clock, Heart, ShoppingCart, Star } from "lucide-react";
import type { Recipe } from "@/types";
import type { ItemFit } from "@/lib/kidFit";
import { cn } from "@/lib/utils";
import { KidFitBadges } from "./KidFitBadges";
import {
  DIFFICULTY_TONE,
  FAVORITE_CLASS,
  STAR_CLASS,
  difficultyLabel,
  formatMinutes,
  isDifficulty,
  recipeTotalMinutes,
} from "./recipeTone";
import "@/i18n/appLocale";

interface RecipeListItemProps {
  recipe: Recipe;
  fit?: ItemFit;
  /** Ingredients not on hand and not already on the list. */
  missingCount: number;
  onView: (recipe: Recipe) => void;
  onPlan?: (recipe: Recipe) => void;
  onAddMissing?: (recipe: Recipe) => void;
}

/**
 * One recipe in the list view. The name is the row's only link to the detail
 * sheet: its ::after overlay stretches over the row so a tap anywhere opens
 * it, while the action buttons sit above the overlay (relative z-10) and keep
 * their own keyboard and pointer events.
 */
export const RecipeListItem = memo(function RecipeListItem({
  recipe,
  fit,
  missingCount,
  onView,
  onPlan,
  onAddMissing,
}: RecipeListItemProps) {
  const { t, i18n } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);

  const totalTime = recipeTotalMinutes(recipe);
  const difficulty = isDifficulty(recipe.difficulty_level) ? recipe.difficulty_level : null;
  const rating = (recipe.rating ?? 0) > 0 ? (recipe.rating as number) : null;

  return (
    <div
      role="listitem"
      className={cn(
        "relative flex items-center gap-3 rounded-lg border px-3 py-3 hover:bg-accent/50 sm:px-4",
        "motion-safe:transition-colors focus-within:ring-2 focus-within:ring-ring",
      )}
    >
      {recipe.image_url && !imageFailed ? (
        <img
          src={recipe.image_url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="h-12 w-12 shrink-0 rounded-md bg-muted object-cover"
        />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10"
          aria-hidden="true"
        >
          <ChefHat className="h-5 w-5 text-primary" />
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 font-medium">
            <button
              type="button"
              onClick={() => onView(recipe)}
              className="block max-w-full truncate text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {recipe.name}
            </button>
          </h3>
          {recipe.is_favorite && (
            <Heart
              className={cn("h-3.5 w-3.5 shrink-0", FAVORITE_CLASS)}
              role="img"
              aria-label={t("recipes.row.favorite", { defaultValue: "Favorite" })}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {difficulty && (
            <Badge variant="outline" className={cn("px-1.5 py-0 text-[11px]", DIFFICULTY_TONE[difficulty])}>
              {difficultyLabel(t, difficulty)}
            </Badge>
          )}
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatMinutes(totalTime, i18n.language)}
            </span>
          )}
          {rating && (
            <span className="flex items-center gap-0.5">
              <Star className={cn("h-3 w-3", STAR_CLASS)} aria-hidden="true" />
              <span className="sr-only">
                {t("recipes.row.rating", { defaultValue: "Rated {{rating}} of 5", rating: rating.toFixed(1) })}
              </span>
              <span aria-hidden="true">{rating.toFixed(1)}</span>
            </span>
          )}
        </div>
        <KidFitBadges fit={fit} mode="compact" />
      </div>

      {(onPlan || onAddMissing) && (
        <div className="relative z-10 flex shrink-0 gap-1">
          {onPlan && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={() => onPlan(recipe)}
              aria-label={t("recipes.row.plan", { defaultValue: "Plan {{name}}", name: recipe.name })}
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {onAddMissing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative h-11 w-11"
              disabled={missingCount <= 0}
              onClick={() => onAddMissing(recipe)}
              aria-label={
                missingCount > 0
                  ? t("recipes.row.addMissing", {
                      defaultValue: "Add {{count}} missing to list",
                      count: missingCount,
                    })
                  : t("recipes.row.allOnHand", { defaultValue: "All on hand" })
              }
            >
              {missingCount > 0 ? (
                <>
                  <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                  <span
                    className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
                    aria-hidden="true"
                  >
                    {missingCount}
                  </span>
                </>
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
