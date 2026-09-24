import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarPlus,
  Check,
  ChefHat,
  Clock,
  FolderPlus,
  Heart,
  MoreHorizontal,
  Pencil,
  ShoppingCart,
  Star,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import type { Recipe } from "@/types";
import type { ItemFit } from "@/lib/kidFit";
import { cn } from "@/lib/utils";
import { KidFitBadges } from "@/components/recipes/KidFitBadges";
import {
  DIFFICULTY_TONE,
  FAVORITE_CLASS,
  IMAGE_OVERLAY_CLASS,
  STAR_CLASS,
  difficultyLabel,
  formatMinutes,
  isDifficulty,
  recipeTotalMinutes,
} from "@/components/recipes/recipeTone";

const MAX_TAGS = 2;

interface EnhancedRecipeCardProps {
  recipe: Recipe;
  /** Per-kid fit from buildRecipeFits / summarizeKidFits. */
  fit?: ItemFit;
  /** Ingredients not on hand and not already on the list. */
  missingCount: number;
  onView?: (recipe: Recipe) => void;
  onPlan?: (recipe: Recipe) => void;
  onAddMissing?: (recipe: Recipe) => void;
  onEdit?: (recipe: Recipe) => void;
  /** Called once; the page owns confirmation / Undo. */
  onDelete?: (recipe: Recipe) => void;
  onAddToCollections?: (recipe: Recipe) => void;
  onOrderIngredients?: (recipe: Recipe) => void;
  className?: string;
}

export const EnhancedRecipeCard = memo(function EnhancedRecipeCard({
  recipe,
  fit,
  missingCount,
  onView,
  onPlan,
  onAddMissing,
  onEdit,
  onDelete,
  onAddToCollections,
  onOrderIngredients,
  className,
}: EnhancedRecipeCardProps) {
  const { t, i18n } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);

  const totalTime = recipeTotalMinutes(recipe);
  const difficulty = isDifficulty(recipe.difficulty_level) ? recipe.difficulty_level : null;
  const rating = recipe.rating != null && recipe.rating > 0 ? recipe.rating : null;
  const showImage = Boolean(recipe.image_url);
  const hasMenu = Boolean(onEdit || onAddToCollections || onOrderIngredients || onDelete);
  const favoriteLabel = t("recipes.card.favorite", { defaultValue: "Favorite" });
  const ratingLabel = rating
    ? t("recipes.card.rating", { defaultValue: "Rated {{rating}} of 5", rating: rating.toFixed(1) })
    : "";

  const difficultyBadge = difficulty && (
    <Badge variant="outline" className={cn("text-xs font-medium", DIFFICULTY_TONE[difficulty])}>
      {difficultyLabel(t, difficulty)}
    </Badge>
  );

  return (
    <Card
      className={cn(
        "relative flex flex-col overflow-hidden motion-safe:transition-shadow hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        className,
      )}
    >
      {showImage && (
        <div className="relative aspect-[4/3] max-h-40 w-full overflow-hidden bg-muted md:aspect-auto md:h-48 md:max-h-none">
          {imageFailed ? (
            <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
              <ChefHat className="h-10 w-10 text-muted-foreground" />
            </div>
          ) : (
            <img
              src={recipe.image_url}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover"
            />
          )}
          {difficulty && (
            <span
              className={cn(
                "absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium",
                IMAGE_OVERLAY_CLASS,
              )}
            >
              {difficultyLabel(t, difficulty)}
            </span>
          )}
          {rating && (
            <span
              className={cn(
                "absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                IMAGE_OVERLAY_CLASS,
              )}
            >
              <Star className={cn("h-3.5 w-3.5", STAR_CLASS)} aria-hidden="true" />
              <span className="sr-only">{ratingLabel}</span>
              <span aria-hidden="true">{rating.toFixed(1)}</span>
            </span>
          )}
          {recipe.is_favorite && (
            <span className={cn("absolute left-2 top-2 rounded-full p-1", IMAGE_OVERLAY_CLASS)}>
              <Heart className={cn("h-4 w-4", FAVORITE_CLASS)} role="img" aria-label={favoriteLabel} />
            </span>
          )}
        </div>
      )}

      <CardHeader className="space-y-2 p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {!showImage && <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
            <h3 className="min-w-0 text-base font-semibold leading-snug md:text-lg">
              <button
                type="button"
                onClick={() => onView?.(recipe)}
                className="line-clamp-2 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
              >
                {recipe.name}
              </button>
            </h3>
            {!showImage && recipe.is_favorite && (
              <Heart
                className={cn("mt-1 h-4 w-4 shrink-0", FAVORITE_CLASS)}
                role="img"
                aria-label={favoriteLabel}
              />
            )}
          </div>

          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative z-10 -mr-2 -mt-1 h-11 w-11 shrink-0"
                  aria-label={t("recipes.card.options", {
                    defaultValue: "More for {{name}}",
                    name: recipe.name,
                  })}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onSelect={() => onEdit(recipe)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("recipes.card.edit", { defaultValue: "Edit" })}
                  </DropdownMenuItem>
                )}
                {onAddToCollections && (
                  <DropdownMenuItem onSelect={() => onAddToCollections(recipe)}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    {t("recipes.card.addToCollection", { defaultValue: "Add to collection" })}
                  </DropdownMenuItem>
                )}
                {onOrderIngredients && (
                  <DropdownMenuItem onSelect={() => onOrderIngredients(recipe)}>
                    <Truck className="mr-2 h-4 w-4" />
                    {t("recipes.card.order", { defaultValue: "Order ingredients" })}
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    {(onEdit || onAddToCollections || onOrderIngredients) && <DropdownMenuSeparator />}
                    <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(recipe)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("recipes.card.delete", { defaultValue: "Delete" })}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <KidFitBadges fit={fit} mode="compact" />
      </CardHeader>

      <CardContent className="mt-auto space-y-3 p-4 pt-0">
        {(onPlan || onAddMissing) && (
          <div className="flex gap-2">
            {onPlan && (
              <Button
                type="button"
                size="sm"
                className="relative z-10 min-h-11 flex-1"
                onClick={() => onPlan(recipe)}
                aria-label={t("recipes.card.planAria", {
                  defaultValue: "Plan {{name}}",
                  name: recipe.name,
                })}
              >
                <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("recipes.card.plan", { defaultValue: "Plan" })}
              </Button>
            )}
            {onAddMissing && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="relative z-10 min-h-11 flex-1"
                disabled={missingCount <= 0}
                onClick={() => onAddMissing(recipe)}
              >
                {missingCount > 0 ? (
                  <>
                    <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t("recipes.card.missing", {
                      defaultValue: "Missing ({{count}})",
                      count: missingCount,
                    })}
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t("recipes.card.allOnHand", { defaultValue: "All on hand" })}
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {(totalTime > 0 || recipe.servings || (!showImage && (difficulty || rating)) || (recipe.times_made ?? 0) > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {!showImage && difficultyBadge}
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {formatMinutes(totalTime, i18n.language)}
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" aria-hidden="true" />
                {t("recipes.card.servings", {
                  defaultValue: "Serves {{servings}}",
                  servings: recipe.servings,
                })}
              </span>
            )}
            {!showImage && rating && (
              <span className="flex items-center gap-0.5">
                <Star className={cn("h-4 w-4", STAR_CLASS)} aria-hidden="true" />
                <span className="sr-only">{ratingLabel}</span>
                <span aria-hidden="true">{rating.toFixed(1)}</span>
              </span>
            )}
            {(recipe.times_made ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <ChefHat className="h-4 w-4" aria-hidden="true" />
                {t("recipes.card.timesMade", {
                  defaultValue: "Made {{count}}x",
                  count: recipe.times_made,
                })}
              </span>
            )}
          </div>
        )}

        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, MAX_TAGS).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
            {recipe.tags.length > MAX_TAGS && (
              <Badge variant="secondary" className="text-xs font-normal">
                +{recipe.tags.length - MAX_TAGS}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
