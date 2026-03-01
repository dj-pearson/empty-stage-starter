import React, { memo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChefHat,
  Clock,
  Users,
  AlertTriangle,
  Package,
  ShoppingCart,
  Star,
  Pencil,
  Trash2,
  FolderPlus,
  MoreHorizontal,
  Heart,
} from "lucide-react";
import { Recipe, Food, Kid } from "@/types";
import { cn } from "@/lib/utils";
import { RecipeSchemaMarkup } from "@/components/RecipeSchemaMarkup";

interface EnhancedRecipeCardProps {
  recipe: Recipe;
  foods: Food[];
  kids?: Kid[];
  onView?: (recipe: Recipe) => void;
  onEdit?: (recipe: Recipe) => void;
  onDelete?: (recipeId: string) => void;
  onAddToGroceryList?: (recipe: Recipe) => void;
  onAddToCollections?: (recipe: Recipe) => void;
  onOrderIngredients?: (recipe: Recipe) => void;
  className?: string;
}

export const EnhancedRecipeCard = memo(function EnhancedRecipeCard({
  recipe,
  foods,
  kids = [],
  onView,
  onEdit,
  onDelete,
  onAddToGroceryList,
  onAddToCollections,
  onOrderIngredients,
  className,
}: EnhancedRecipeCardProps) {
  const recipeFoods = recipe.food_ids
    .map((id) => foods.find((f) => f.id === id))
    .filter(Boolean) as Food[];

  const outOfStock = recipeFoods.filter((food) => (food.quantity || 0) === 0);
  const lowStock = recipeFoods.filter(
    (food) => (food.quantity || 0) > 0 && (food.quantity || 0) <= 2
  );
  const hasStockIssues = outOfStock.length > 0 || lowStock.length > 0;

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

  const totalTime = recipe.total_time_minutes ||
    (parseInt(recipe.prepTime || "0") + parseInt(recipe.cookTime || "0"));

  const difficultyColor: Record<string, string> = {
    easy: "text-green-600 bg-green-50 border-green-200",
    medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
    hard: "text-red-600 bg-red-50 border-red-200",
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger view if clicking on action buttons
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="menuitem"], [data-no-click]')) return;
    onView?.(recipe);
  };

  return (
    <>
      <RecipeSchemaMarkup recipe={recipe} foods={recipeFoods} />

      <Card
        className={cn(
          "hover:shadow-lg transition-all overflow-hidden",
          onView && "cursor-pointer",
          className
        )}
        onClick={handleCardClick}
      >
        {/* Recipe Image */}
        {recipe.image_url && (
          <div className="relative w-full h-48 overflow-hidden">
            <img
              src={recipe.image_url}
              alt={recipe.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 flex gap-2">
              {recipe.difficulty_level && (
                <Badge
                  className={cn("backdrop-blur-sm", difficultyColor[recipe.difficulty_level])}
                >
                  {recipe.difficulty_level}
                </Badge>
              )}
            </div>
            {recipe.rating != null && recipe.rating > 0 && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-full">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">{recipe.rating.toFixed(1)}</span>
              </div>
            )}
            {recipe.is_favorite && (
              <div className="absolute top-2 left-2">
                <Heart className="h-5 w-5 fill-red-500 text-red-500 drop-shadow" />
              </div>
            )}
          </div>
        )}

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {!recipe.image_url && <ChefHat className="h-5 w-5 text-primary shrink-0" />}
                <h3 className="text-lg font-semibold line-clamp-2">{recipe.name}</h3>
                {!recipe.image_url && recipe.is_favorite && (
                  <Heart className="h-4 w-4 fill-red-500 text-red-500 shrink-0" />
                )}
              </div>
              {recipe.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {recipe.description}
                </p>
              )}
            </div>

            {/* Three-dot menu for all actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-no-click>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(recipe)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onAddToGroceryList && (
                  <DropdownMenuItem onClick={() => onAddToGroceryList(recipe)}>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Add to Grocery
                  </DropdownMenuItem>
                )}
                {onOrderIngredients && (
                  <DropdownMenuItem onClick={() => onOrderIngredients(recipe)}>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Order Ingredients
                  </DropdownMenuItem>
                )}
                {onAddToCollections && (
                  <DropdownMenuItem onClick={() => onAddToCollections(recipe)}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Add to Collection
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Quick stats */}
          {(totalTime > 0 || recipe.servings || recipe.times_made) && (
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
              {!recipe.image_url && recipe.difficulty_level && (
                <Badge
                  variant="outline"
                  className={cn("text-xs", difficultyColor[recipe.difficulty_level])}
                >
                  {recipe.difficulty_level}
                </Badge>
              )}
              {totalTime > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>{totalTime} min</span>
                </div>
              )}
              {recipe.servings && (
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{recipe.servings}</span>
                </div>
              )}
              {!recipe.image_url && recipe.rating != null && recipe.rating > 0 && (
                <div className="flex items-center gap-0.5">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span>{recipe.rating.toFixed(1)}</span>
                </div>
              )}
              {recipe.times_made != null && recipe.times_made > 0 && (
                <div className="flex items-center gap-1">
                  <ChefHat className="h-4 w-4" />
                  <span>{recipe.times_made}x</span>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {recipe.tags && recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
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

        <CardContent className="pt-0 space-y-2">
          {/* Allergen Warning */}
          {allergenStatus.hasAllergens && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Allergens: {allergenStatus.allergens.join(", ")}
              </AlertDescription>
            </Alert>
          )}

          {/* Stock Status (compact) */}
          {hasStockIssues && (
            <div className="flex items-center gap-1.5 text-xs">
              <AlertTriangle className={cn("h-3.5 w-3.5", outOfStock.length > 0 ? "text-destructive" : "text-yellow-500")} />
              {outOfStock.length > 0 && (
                <span className="text-destructive">
                  {outOfStock.length} out of stock
                </span>
              )}
              {outOfStock.length > 0 && lowStock.length > 0 && <span className="text-muted-foreground">&middot;</span>}
              {lowStock.length > 0 && (
                <span className="text-yellow-600">{lowStock.length} low</span>
              )}
            </div>
          )}

          {/* Ingredients (truncated to 5) */}
          <div className="flex flex-wrap gap-1">
            {recipeFoods.slice(0, 5).map((food) => {
              const isOutOfStock = (food.quantity || 0) === 0;
              return (
                <Badge
                  key={food.id}
                  variant={isOutOfStock ? "destructive" : "outline"}
                  className="text-xs gap-1"
                >
                  {food.name}
                  {isOutOfStock && <Package className="h-3 w-3" />}
                </Badge>
              );
            })}
            {recipeFoods.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{recipeFoods.length - 5} more
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {recipe.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{recipe.name}" and all its associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete?.(recipe.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
