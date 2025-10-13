import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Pencil,
  Trash2,
  ChefHat,
  Clock,
  Users,
  Lightbulb,
  AlertTriangle,
  Package,
  Upload,
  Sparkles,
  Loader2,
} from "lucide-react";
import { RecipeBuilder } from "@/components/RecipeBuilder";
import { ImportRecipeDialog } from "@/components/ImportRecipeDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Recipe } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface RecipeSuggestion {
  name: string;
  description: string;
  food_ids: string[];
  food_names: string[];
  reason: string;
  difficulty: string;
  prepTime: string;
  cookTime: string;
}

export default function Recipes() {
  const {
    recipes,
    foods,
    addRecipe,
    updateRecipe,
    deleteRecipe,
    kids,
    activeKidId,
    setActiveKid,
  } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [aiSuggestionsOpen, setAiSuggestionsOpen] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<RecipeSuggestion[]>([]);

  const handleEdit = (recipe: Recipe) => {
    setEditRecipe(recipe);
    setDialogOpen(true);
  };

  const handleSave = async (recipeData: any) => {
    try {
      if (editRecipe) {
        await updateRecipe(editRecipe.id, recipeData);
        toast.success("Recipe updated!");
      } else {
        await addRecipe(recipeData);
        toast.success("Recipe created!");
      }
      handleClose();
    } catch (error) {
      console.error("Error saving recipe:", error);
      toast.error("Failed to save recipe");
    }
  };

  const handleImport = async (recipeData: any) => {
    try {
      await addRecipe(recipeData);
      toast.success("Recipe imported successfully!");
    } catch (error) {
      console.error("Error importing recipe:", error);
      toast.error("Failed to import recipe");
    }
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditRecipe(null);
  };

  const handleDelete = (id: string) => {
    deleteRecipe(id);
    setDeleteId(null);
    toast.success("Recipe deleted");
  };

  const handleAISuggestions = async () => {
    setIsLoadingSuggestions(true);
    setAiSuggestionsOpen(true);
    setSuggestions([]);

    try {
      const activeKid = kids.find((k) => k.id === activeKidId);

      // Only use safe foods from pantry
      const pantryFoods = foods.filter(
        (f) => f.is_safe && (f.quantity ?? 0) > 0
      );

      if (pantryFoods.length === 0) {
        toast.error("No foods in pantry", {
          description: "Add some foods to your pantry first",
        });
        setIsLoadingSuggestions(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "suggest-recipes-from-pantry",
        {
          body: {
            pantryFoods,
            childProfile: activeKid,
            count: 5,
          },
        }
      );

      if (error) throw error;

      if (data?.error) {
        toast.error("AI Error", {
          description: data.error,
        });
        setSuggestions([]);
      } else {
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Error getting AI suggestions:", error);
      toast.error("Failed to get suggestions", {
        description: "Please try again",
      });
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleAddSuggestion = async (suggestion: RecipeSuggestion) => {
    try {
      console.log("Adding AI suggestion:", suggestion);
      const createdRecipe = await addRecipe({
        name: suggestion.name,
        description: suggestion.description,
        food_ids: suggestion.food_ids,
        prepTime: suggestion.prepTime,
        cookTime: suggestion.cookTime,
        tips: suggestion.reason,
      });

      console.log("Created recipe:", createdRecipe);

      if (!createdRecipe?.id) {
        throw new Error("Recipe was not saved to database");
      }

      toast.success(`Added "${suggestion.name}" to recipes!`);
    } catch (error) {
      console.error("Error adding recipe:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to add recipe", {
        description: message,
      });
    }
  };

  const getRecipeFoods = (recipe: Recipe) => {
    return recipe.food_ids
      .map((id) => foods.find((f) => f.id === id))
      .filter(Boolean);
  };

  const getStockStatus = (recipe: Recipe) => {
    const recipeFoods = getRecipeFoods(recipe);
    const outOfStock = recipeFoods.filter(
      (food) => food && (food.quantity || 0) === 0
    );
    const lowStock = recipeFoods.filter(
      (food) => food && (food.quantity || 0) > 0 && (food.quantity || 0) <= 2
    );

    return {
      outOfStock,
      lowStock,
      hasIssues: outOfStock.length > 0 || lowStock.length > 0,
    };
  };

  const getAllergenStatus = (recipe: Recipe) => {
    const recipeFoods = getRecipeFoods(recipe);

    // Collect allergens from all kids in the family
    const allKidAllergens = kids.reduce<string[]>((acc, kid) => {
      if (kid.allergens) {
        return [...acc, ...kid.allergens];
      }
      return acc;
    }, []);

    // Find allergens in recipe foods that match family allergens
    const matchingAllergens = new Set<string>();
    recipeFoods.forEach((food) => {
      if (food?.allergens) {
        food.allergens.forEach((allergen) => {
          if (allKidAllergens.includes(allergen)) {
            matchingAllergens.add(allergen);
          }
        });
      }
    });

    return {
      allergens: Array.from(matchingAllergens),
      hasAllergens: matchingAllergens.size > 0,
    };
  };

  const isFamilyMode = activeKidId === null;

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">
              Recipes & Meal Templates
            </h1>
            <p className="text-muted-foreground">
              {isFamilyMode
                ? "Family recipes for all children"
                : `Recipes for ${kids.find((k) => k.id === activeKidId)?.name}`}
            </p>
            {isFamilyMode && kids.length > 1 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  Quick filter:
                </span>
                {kids.map((kid) => (
                  <Button
                    key={kid.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveKid(kid.id)}
                  >
                    {kid.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleAISuggestions}
              variant="secondary"
              size="lg"
              disabled={isLoadingSuggestions}
            >
              <Sparkles className="h-5 w-5 mr-2" />
              AI Suggest from Pantry
            </Button>
            <Button
              onClick={() => setImportDialogOpen(true)}
              variant="outline"
              size="lg"
            >
              <Upload className="h-5 w-5 mr-2" />
              Import
            </Button>
            <Button
              onClick={() => setDialogOpen(true)}
              size="lg"
              className="shadow-lg"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Recipe
            </Button>
          </div>
        </div>

        {recipes.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ChefHat className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Recipes Yet</h3>
              <p className="text-muted-foreground mb-6">
                Create meal templates to quickly plan complete meals instead of
                individual foods
              </p>
              <Button onClick={() => setDialogOpen(true)} size="lg">
                <Plus className="h-5 w-5 mr-2" />
                Create Your First Recipe
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((recipe) => {
              const recipeFoods = getRecipeFoods(recipe);
              const stockStatus = getStockStatus(recipe);
              const allergenStatus = getAllergenStatus(recipe);

              return (
                <Card
                  key={recipe.id}
                  className="hover:shadow-lg transition-all"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <ChefHat className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{recipe.name}</CardTitle>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(recipe)}
                          className="touch-target"
                          aria-label="Edit recipe"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(recipe.id)}
                          className="touch-target"
                          aria-label="Delete recipe"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {recipe.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {recipe.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Allergen Warning */}
                    {allergenStatus.hasAllergens && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div>
                            <p className="font-medium">
                              ⚠️ Contains family allergens:
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {allergenStatus.allergens.map((allergen) => (
                                <Badge
                                  key={allergen}
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  {allergen}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Stock Warnings */}
                    {stockStatus.hasIssues && (
                      <Alert
                        variant={
                          stockStatus.outOfStock.length > 0
                            ? "destructive"
                            : "default"
                        }
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {stockStatus.outOfStock.length > 0 && (
                            <div className="mb-2">
                              <p className="font-medium">Out of stock:</p>
                              <p className="text-sm">
                                {stockStatus.outOfStock
                                  .map((f) => f?.name)
                                  .join(", ")}
                              </p>
                            </div>
                          )}
                          {stockStatus.lowStock.length > 0 && (
                            <div>
                              <p className="font-medium">Low stock:</p>
                              <p className="text-sm">
                                {stockStatus.lowStock
                                  .map((f) => `${f?.name} (${f?.quantity})`)
                                  .join(", ")}
                              </p>
                            </div>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Time and Servings */}
                    {(recipe.prepTime ||
                      recipe.cookTime ||
                      recipe.servings) && (
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        {recipe.prepTime && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>Prep: {recipe.prepTime}</span>
                          </div>
                        )}
                        {recipe.cookTime && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>Cook: {recipe.cookTime}</span>
                          </div>
                        )}
                        {recipe.servings && (
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{recipe.servings} servings</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ingredients */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        Main Ingredients ({recipeFoods.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {recipeFoods.map((food) => {
                          if (!food) return null;
                          const isOutOfStock = (food.quantity || 0) === 0;
                          const isLowStock =
                            (food.quantity || 0) > 0 &&
                            (food.quantity || 0) <= 2;

                          return (
                            <Badge
                              key={food.id}
                              variant={
                                isOutOfStock
                                  ? "destructive"
                                  : isLowStock
                                  ? "secondary"
                                  : "outline"
                              }
                              className="gap-1"
                            >
                              {food.name}
                              {food.quantity !== undefined &&
                                food.quantity !== null && (
                                  <span className="text-xs opacity-70">
                                    ({food.quantity})
                                  </span>
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
                        <p className="text-sm font-medium text-muted-foreground">
                          Also needed:
                        </p>
                        <p className="text-sm">
                          {recipe.additionalIngredients}
                        </p>
                      </div>
                    )}

                    {/* Instructions Preview */}
                    {recipe.instructions && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          Instructions:
                        </p>
                        <p className="text-sm line-clamp-3">
                          {recipe.instructions}
                        </p>
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
                </Card>
              );
            })}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) handleClose();
            setDialogOpen(open);
          }}
        >
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editRecipe ? "Edit Recipe" : "Create Recipe"}
              </DialogTitle>
            </DialogHeader>

            <RecipeBuilder
              foods={foods}
              editRecipe={editRecipe}
              onSave={handleSave}
              onCancel={handleClose}
              kids={kids}
              activeKidId={activeKidId}
            />
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this recipe. This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && handleDelete(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Import Dialog */}
        <ImportRecipeDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImport={handleImport}
          foods={foods}
        />

        {/* AI Suggestions Dialog */}
        <Dialog open={aiSuggestionsOpen} onOpenChange={setAiSuggestionsOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Recipe Suggestions from Your Pantry
              </DialogTitle>
              <DialogDescription>
                Recipes created using foods you already have
              </DialogDescription>
            </DialogHeader>

            {isLoadingSuggestions ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">
                  Analyzing your pantry...
                </p>
              </div>
            ) : suggestions.length > 0 ? (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  {suggestions.map((suggestion, index) => (
                    <Card
                      key={index}
                      className="hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {suggestion.name}
                              </h3>
                              <Badge variant="outline">
                                {suggestion.difficulty}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                              {suggestion.description}
                            </p>

                            <div className="flex flex-wrap gap-2 mb-3">
                              {suggestion.food_names.map((foodName, i) => (
                                <Badge key={i} variant="secondary">
                                  {foodName}
                                </Badge>
                              ))}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>Prep: {suggestion.prepTime}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>Cook: {suggestion.cookTime}</span>
                              </div>
                            </div>

                            <div className="bg-primary/5 p-3 rounded-lg">
                              <div className="flex items-start gap-2">
                                <Lightbulb className="h-4 w-4 text-primary mt-0.5" />
                                <p className="text-sm">
                                  <span className="font-medium">
                                    Why this works:
                                  </span>{" "}
                                  {suggestion.reason}
                                </p>
                              </div>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            onClick={() => handleAddSuggestion(suggestion)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No suggestions available.</p>
                <p className="text-sm mt-2">
                  Make sure you have foods in your pantry with quantity &gt; 0
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
