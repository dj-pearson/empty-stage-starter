import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  ChefHat,
  Users,
  ShoppingCart,
  BookOpen,
  Utensils,
  Star
} from "lucide-react";
import { RecipeScalingControl } from "@/components/RecipeScalingControl";
import { ScaledIngredientsList } from "@/components/ScaledIngredientsList";
import { Recipe } from "@/types";

interface RecipeViewWithScalingProps {
  recipe: Recipe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToGrocery?: (scaledIngredients: any[]) => void;
}

export function RecipeViewWithScaling({
  recipe,
  open,
  onOpenChange,
  onAddToGrocery,
}: RecipeViewWithScalingProps) {
  const [scaledIngredients, setScaledIngredients] = useState<any[]>([]);
  const [currentServings, setCurrentServings] = useState(recipe.servings || 4);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());

  // Handle servings change from scaling control
  const handleServingsChange = (servings: number, scaled: any[]) => {
    setCurrentServings(servings);
    setScaledIngredients(scaled);
  };

  // Toggle ingredient checkbox
  const handleToggleIngredient = (ingredientId: string) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(ingredientId)) {
        next.delete(ingredientId);
      } else {
        next.add(ingredientId);
      }
      return next;
    });
  };

  // Add to grocery list
  const handleAddToGrocery = () => {
    if (onAddToGrocery) {
      onAddToGrocery(scaledIngredients);
    }
  };

  // Get structured ingredients from recipe
  const ingredients = recipe.recipe_ingredients || [];

  // Calculate total time
  const totalTime = recipe.total_time_minutes ||
    (parseInt(recipe.prepTime || "0") + parseInt(recipe.cookTime || "0"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <div className="flex flex-col h-full">
          {/* Header with image */}
          {recipe.image_url && (
            <div className="relative w-full h-48 flex-shrink-0">
              <img
                src={recipe.image_url}
                alt={recipe.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <DialogTitle className="absolute bottom-4 left-6 text-2xl font-bold text-white">
                {recipe.name}
              </DialogTitle>
              <DialogDescription className="sr-only">View recipe details with ingredient scaling options</DialogDescription>
            </div>
          )}

          {!recipe.image_url && (
            <DialogHeader className="p-6 pb-4">
              <DialogTitle className="text-2xl">{recipe.name}</DialogTitle>
              <DialogDescription className="sr-only">View recipe details with ingredient scaling options</DialogDescription>
            </DialogHeader>
          )}

          {/* Content */}
          <ScrollArea className="flex-1 px-6">
            <div className="py-4 space-y-6">
              {/* Recipe Info */}
              <div className="flex flex-wrap gap-4 text-sm">
                {totalTime > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{totalTime} min</span>
                  </div>
                )}

                {recipe.difficulty_level && (
                  <div className="flex items-center gap-2">
                    <ChefHat className="h-4 w-4 text-muted-foreground" />
                    <span className="capitalize">{recipe.difficulty_level}</span>
                  </div>
                )}

                {recipe.kid_friendly_score && (
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" />
                    <span>{recipe.kid_friendly_score}% kid-friendly</span>
                  </div>
                )}
              </div>

              {recipe.description && (
                <p className="text-muted-foreground">{recipe.description}</p>
              )}

              <Separator />

              {/* Tabs for Ingredients and Instructions */}
              <Tabs defaultValue="ingredients" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="ingredients">
                    <Utensils className="h-4 w-4 mr-2" />
                    Ingredients
                  </TabsTrigger>
                  <TabsTrigger value="instructions">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Instructions
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ingredients" className="space-y-6 mt-6">
                  {/* Scaling Control */}
                  <RecipeScalingControl
                    originalServings={Number(recipe.servings) || 4}
                    servingsMin={1}
                    servingsMax={12}
                    ingredients={ingredients.map((ing: any) => ({
                      id: ing.id,
                      ingredient_name: ing.ingredient_name,
                      quantity: ing.quantity,
                      unit: ing.unit,
                      preparation_notes: ing.preparation_notes,
                      is_optional: ing.is_optional,
                      section: ing.section,
                    }))}
                    onServingsChange={handleServingsChange}
                  />

                  {/* Scaled Ingredients List */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Ingredients</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddToGrocery}
                        disabled={!onAddToGrocery}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Add to Grocery List
                      </Button>
                    </div>

                    <ScaledIngredientsList
                      ingredients={scaledIngredients.length > 0 ? scaledIngredients : ingredients.map((ing: any) => ({
                        id: ing.id,
                        name: ing.ingredient_name,
                        originalQuantity: ing.quantity,
                        scaledQuantity: ing.quantity,
                        unit: ing.unit,
                        preparationNotes: ing.preparation_notes,
                        isOptional: ing.is_optional,
                        section: ing.section,
                      }))}
                      showOriginal={currentServings !== (recipe.servings || 4)}
                      checkedIngredients={checkedIngredients}
                      onToggleIngredient={handleToggleIngredient}
                    />
                  </div>

                  {/* Additional Ingredients */}
                  {recipe.additionalIngredients && (
                    <div className="mt-4">
                      <h4 className="font-semibold text-sm mb-2">Additional Notes</h4>
                      <p className="text-sm text-muted-foreground">{recipe.additionalIngredients}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="instructions" className="mt-6">
                  {/* Instructions */}
                  {recipe.instructions && (
                    <div className="prose prose-sm max-w-none">
                      <div className="whitespace-pre-wrap">{recipe.instructions}</div>
                    </div>
                  )}

                  {!recipe.instructions && (
                    <div className="text-center py-8 text-muted-foreground">
                      <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No instructions provided</p>
                    </div>
                  )}

                  {/* Tips */}
                  {recipe.tips && (
                    <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                      <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                        💡 Tips
                      </h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {recipe.tips}
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Nutrition Info */}
              {recipe.nutrition_info && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-3">Nutrition (per serving)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {recipe.nutrition_info.calories && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-2xl font-bold">{recipe.nutrition_info.calories}</div>
                        <div className="text-xs text-muted-foreground">Calories</div>
                      </div>
                    )}
                    {(recipe.nutrition_info as any).protein_g && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-2xl font-bold">{(recipe.nutrition_info as any).protein_g}g</div>
                        <div className="text-xs text-muted-foreground">Protein</div>
                      </div>
                    )}
                    {(recipe.nutrition_info as any).carbs_g && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-2xl font-bold">{(recipe.nutrition_info as any).carbs_g}g</div>
                        <div className="text-xs text-muted-foreground">Carbs</div>
                      </div>
                    )}
                    {(recipe.nutrition_info as any).fat_g && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-2xl font-bold">{(recipe.nutrition_info as any).fat_g}g</div>
                        <div className="text-xs text-muted-foreground">Fat</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t p-4 flex justify-end gap-2 flex-shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
