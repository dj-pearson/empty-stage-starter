import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Star,
  Eye,
  ShoppingCart,
  CalendarPlus,
  Heart,
} from "lucide-react";
import { Recipe, Food } from "@/types";
import { cn } from "@/lib/utils";

interface RecipeListItemProps {
  recipe: Recipe;
  foods: Food[];
  onView: (recipe: Recipe) => void;
  onAddToGrocery?: (recipe: Recipe) => void;
  onAddToPlanner?: (recipe: Recipe) => void;
}

// Food[] used for ingredient count display via recipe.food_ids

const difficultyColors: Record<string, string> = {
  easy: "bg-green-50 text-green-700 border-green-200",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  hard: "bg-red-50 text-red-700 border-red-200",
};

export function RecipeListItem({
  recipe,
  onView,
  onAddToGrocery,
  onAddToPlanner,
}: RecipeListItemProps) {
  const totalTime =
    recipe.total_time_minutes ||
    (parseInt(recipe.prepTime || "0") + parseInt(recipe.cookTime || "0"));

  const ingredientCount = recipe.food_ids.length;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors group"
      onClick={() => onView(recipe)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(recipe);
        }
      }}
    >
      {/* Thumbnail */}
      {recipe.image_url ? (
        <img
          src={recipe.image_url}
          alt=""
          className="w-12 h-12 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-lg">
          🍽️
        </div>
      )}

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium truncate">{recipe.name}</h3>
          {recipe.is_favorite && (
            <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          {recipe.difficulty_level && (
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0", difficultyColors[recipe.difficulty_level])}
            >
              {recipe.difficulty_level}
            </Badge>
          )}
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {totalTime}m
            </span>
          )}
          {(recipe.rating ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {recipe.rating?.toFixed(1)}
            </span>
          )}
          <span>{ingredientCount} ingredients</span>
        </div>
      </div>

      {/* Quick actions (visible on hover / always on mobile) */}
      <div
        className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-0 max-sm:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onView(recipe)}
          aria-label="View recipe"
        >
          <Eye className="h-4 w-4" />
        </Button>
        {onAddToGrocery && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onAddToGrocery(recipe)}
            aria-label="Add to grocery list"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        )}
        {onAddToPlanner && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onAddToPlanner(recipe)}
            aria-label="Add to planner"
          >
            <CalendarPlus className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
