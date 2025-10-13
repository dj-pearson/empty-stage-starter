import React from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ChefHat,
  Clock,
  Users,
  Lightbulb,
  AlertTriangle,
  Package,
  ShoppingCart,
  Star,
  Pencil,
  Trash2,
  FolderPlus,
} from "lucide-react";
import { Recipe, Food, Kid } from "@/types";
import { cn } from "@/lib/utils";

interface EnhancedRecipeCardProps {
  recipe: Recipe;
  foods: Food[];
  kids?: Kid[];
  onEdit?: (recipe: Recipe) => void;
  onDelete?: (recipeId: string) => void;
  onAddToGroceryList?: (recipe: Recipe) => void;
  onAddToCollections?: (recipe: Recipe) => void;
  className?: string;
}

export function EnhancedRecipeCard({
  recipe,
  foods,
  kids = [],
  onEdit,
  onDelete,
  onAddToGroceryList,
  onAddToCollections,
  className,
}: EnhancedRecipeCardProps) {
  // Get recipe foods and check stock status
  const recipeFoods = recipe.food_ids
    .map((id) => foods.find((f) => f.id === id))
    .filter(Boolean) as Food[];

  const outOfStock = recipeFoods.filter((food) => (food.quantity || 0) === 0);
  const lowStock = recipeFoods.filter(
    (food) => (food.quantity || 0) > 0 && (food.quantity || 0) <= 2
  );
  const hasStockIssues = outOfStock.length > 0 || lowStock.length > 0;

  // Check for allergens if kids provided
  const allergenStatus = React.useMemo(() => {
    if (kids.length === 0) return { hasAllergens: false, allergens: [] };

    const allAllergens = new Set<string>();
    kids.forEach((kid) => {
      kid.allergens?.forEach((allergen) => allAllergens.add(allergen));
    });

    const recipeAllergens = recipeFoods
      .flatMap((food) => food.allergens || [])
      .filter((allergen) => allAllergens.has(allergen));

    return {
      hasAllergens: recipeAllergens.length > 0,
      allergens: [...new Set(recipeAllergens)],
    };
  }, [recipeFoods, kids]);

  // Calculate total time
  const totalTime = recipe.total_time_minutes || 
    (parseInt(recipe.prepTime || "0") + parseInt(recipe.cookTime || "0"));

  // Difficulty color
  const difficultyColor = {
    easy: "text-green-600 bg-green-50 border-green-200",
    medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
    hard: "text-red-600 bg-red-50 border-red-200",
  };

  return (
    <Card className={cn("hover:shadow-lg transition-all overflow-hidden", className)}>
      {/* Recipe Image */}
      {recipe.image_url && (
        <div className="relative w-full h-48 overflow-hidden">
          <img
            src={recipe.image_url}
            alt={recipe.name}
            className="w-full h-full object-cover"
          />
          {/* Overlay badges */}
          <div className="absolute top-2 right-2 flex gap-2">
            {recipe.difficulty_level && (
              <Badge
                className={cn(
                  "backdrop-blur-sm",
                  difficultyColor[recipe.difficulty_level]
                )}
              >
                {recipe.difficulty_level}
              </Badge>
            )}
            {recipe.kid_friendly_score && recipe.kid_friendly_score >= 80 && (
              <Badge className="bg-primary/90 backdrop-blur-sm">
                Kid Friendly
              </Badge>
            )}
          </div>
          {/* Rating overlay */}
          {recipe.rating && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-full">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">{recipe.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}

      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {!recipe.image_url && <ChefHat className="h-5 w-5 text-primary shrink-0" />}
              <h3 className="text-lg font-semibold line-clamp-2">{recipe.name}</h3>
            </div>
            {recipe.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {recipe.description}
              </p>
            )}
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-1 shrink-0">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(recipe)}
                className="h-8 w-8"
                aria-label="Edit recipe"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(recipe.id)}
                className="h-8 w-8"
                aria-label="Delete recipe"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Quick stats */}
        {(totalTime > 0 || recipe.servings || recipe.times_made) && (
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-2">
            {totalTime > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{totalTime} min</span>
              </div>
            )}
            {recipe.servings && (
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{recipe.servings} servings</span>
              </div>
            )}
            {recipe.times_made && recipe.times_made > 0 && (
              <div className="flex items-center gap-1">
                <ChefHat className="h-4 w-4" />
                <span>Made {recipe.times_made}x</span>
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {recipe.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {recipe.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{recipe.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Allergen Warning */}
        {allergenStatus.hasAllergens && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">⚠️ Contains family allergens:</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {allergenStatus.allergens.map((allergen) => (
                  <Badge key={allergen} variant="destructive" className="text-xs">
                    {allergen}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Stock Status */}
        {hasStockIssues && (
          <Alert variant={outOfStock.length > 0 ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {outOfStock.length > 0 && (
                <div className="mb-2">
                  <p className="font-medium text-sm">Out of stock:</p>
                  <p className="text-xs">{outOfStock.map((f) => f.name).join(", ")}</p>
                </div>
              )}
              {lowStock.length > 0 && (
                <div>
                  <p className="font-medium text-sm">Low stock:</p>
                  <p className="text-xs">
                    {lowStock.map((f) => `${f.name} (${f.quantity})`).join(", ")}
                  </p>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Ingredients */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Main Ingredients ({recipeFoods.length}):
          </p>
          <div className="flex flex-wrap gap-2">
            {recipeFoods.map((food) => {
              const isOutOfStock = (food.quantity || 0) === 0;
              const isLowStock = (food.quantity || 0) > 0 && (food.quantity || 0) <= 2;

              return (
                <Badge
                  key={food.id}
                  variant={isOutOfStock ? "destructive" : isLowStock ? "secondary" : "outline"}
                  className="gap-1"
                >
                  {food.name}
                  {food.quantity !== undefined && food.quantity !== null && (
                    <span className="text-xs opacity-70">({food.quantity})</span>
                  )}
                  {isOutOfStock && <Package className="h-3 w-3" />}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Additional Ingredients */}
        {recipe.additionalIngredients && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Also needed:</p>
            <p className="text-sm">{recipe.additionalIngredients}</p>
          </div>
        )}

        {/* Instructions Preview */}
        {recipe.instructions && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Instructions:</p>
            <p className="text-sm line-clamp-3">{recipe.instructions}</p>
          </div>
        )}

        {/* Nutrition Info */}
        {recipe.nutrition_info && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm font-medium mb-2">Nutrition per serving:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {recipe.nutrition_info.calories && (
                <div>
                  <span className="text-muted-foreground">Calories:</span>{" "}
                  <span className="font-medium">{recipe.nutrition_info.calories}</span>
                </div>
              )}
              {recipe.nutrition_info.protein_g && (
                <div>
                  <span className="text-muted-foreground">Protein:</span>{" "}
                  <span className="font-medium">{recipe.nutrition_info.protein_g}g</span>
                </div>
              )}
              {recipe.nutrition_info.carbs_g && (
                <div>
                  <span className="text-muted-foreground">Carbs:</span>{" "}
                  <span className="font-medium">{recipe.nutrition_info.carbs_g}g</span>
                </div>
              )}
              {recipe.nutrition_info.fiber_g && (
                <div>
                  <span className="text-muted-foreground">Fiber:</span>{" "}
                  <span className="font-medium">{recipe.nutrition_info.fiber_g}g</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tips */}
        {recipe.tips && (
          <div className="space-y-1 bg-muted/50 p-3 rounded-lg">
            <div className="flex items-center gap-1 text-sm font-medium">
              <Lightbulb className="h-4 w-4" />
              <span>Picky Eater Tips:</span>
            </div>
            <p className="text-sm">{recipe.tips}</p>
          </div>
        )}
      </CardContent>

      {/* Footer Actions */}
      {(onAddToGroceryList || onAddToCollections) && (
        <CardFooter className="pt-0 gap-2 flex-col sm:flex-row">
          {onAddToGroceryList && (
            <Button
              onClick={() => onAddToGroceryList(recipe)}
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!recipe.food_ids || recipe.food_ids.length === 0}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Grocery List
            </Button>
          )}
          {onAddToCollections && (
            <Button
              onClick={() => onAddToCollections(recipe)}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Add to Collection
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
