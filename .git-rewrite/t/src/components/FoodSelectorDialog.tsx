import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Food, Recipe, MealSlot } from "@/types";
import { Search, ChefHat, Apple, AlertTriangle, Package } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FoodSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  recipes: Recipe[];
  slot: MealSlot | null;
  date: string | null;
  onSelectFood: (foodId: string) => void;
  onSelectRecipe: (recipeId: string) => void;
}

export function FoodSelectorDialog({
  open,
  onOpenChange,
  foods,
  recipes,
  slot,
  date,
  onSelectFood,
  onSelectRecipe,
}: FoodSelectorDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("foods");

  const slotLabels: Record<MealSlot, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack1: "Snack 1",
    snack2: "Snack 2",
    try_bite: "Try Bite",
  };

  // Filter foods based on search and slot type
  const filteredFoods = foods.filter(food => {
    const matchesSearch = food.name.toLowerCase().includes(searchQuery.toLowerCase());
    const hasStock = (food.quantity || 0) > 0;
    
    // For try_bite slot, show try-bite foods
    if (slot === "try_bite") {
      return matchesSearch && food.is_try_bite && hasStock;
    }
    
    // For other slots, show safe foods
    return matchesSearch && food.is_safe && hasStock;
  });

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRecipeFoods = (recipe: Recipe) => {
    return recipe.food_ids
      .map(id => foods.find(f => f.id === id))
      .filter(Boolean) as Food[];
  };

  const getRecipeStockStatus = (recipe: Recipe) => {
    const recipeFoods = getRecipeFoods(recipe);
    const outOfStock = recipeFoods.filter(food => (food.quantity || 0) === 0);
    const lowStock = recipeFoods.filter(food => (food.quantity || 0) > 0 && (food.quantity || 0) <= 2);
    
    return {
      outOfStock,
      lowStock,
      hasIssues: outOfStock.length > 0 || lowStock.length > 0,
    };
  };

  const handleClose = () => {
    setSearchQuery("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            Add to {slot ? slotLabels[slot] : "Meal"}
            {date && (
              <span className="text-sm text-muted-foreground ml-2">
                ({new Date(date + 'T00:00:00').toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                })})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search foods or recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="foods">
                <Apple className="h-4 w-4 mr-2" />
                Foods ({filteredFoods.length})
              </TabsTrigger>
              <TabsTrigger value="recipes">
                <ChefHat className="h-4 w-4 mr-2" />
                Recipes ({filteredRecipes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="foods" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {filteredFoods.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Apple className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No foods found</p>
                    <p className="text-sm">Try adjusting your search or add more foods to pantry</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredFoods.map(food => {
                      const isLowStock = (food.quantity || 0) > 0 && (food.quantity || 0) <= 2;
                      
                      return (
                        <Button
                          key={food.id}
                          variant="outline"
                          className="w-full justify-start h-auto p-4"
                          onClick={() => {
                            onSelectFood(food.id);
                            handleClose();
                          }}
                        >
                          <div className="flex-1 text-left">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">{food.name}</span>
                              <Badge variant="secondary" className="ml-2">
                                {food.category}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Stock: {food.quantity || 0} {food.unit || 'servings'}</span>
                              {isLowStock && (
                                <Badge variant="secondary" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Low
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="recipes" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {filteredRecipes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ChefHat className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No recipes found</p>
                    <p className="text-sm">Create recipes to use complete meals</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredRecipes.map(recipe => {
                      const recipeFoods = getRecipeFoods(recipe);
                      const stockStatus = getRecipeStockStatus(recipe);
                      
                      return (
                        <Button
                          key={recipe.id}
                          variant="outline"
                          className="w-full justify-start h-auto p-4"
                          onClick={() => {
                            onSelectRecipe(recipe.id);
                            handleClose();
                          }}
                          disabled={stockStatus.outOfStock.length > 0}
                        >
                          <div className="flex-1 text-left">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">{recipe.name}</span>
                              {stockStatus.outOfStock.length > 0 && (
                                <Badge variant="destructive" className="ml-2 gap-1">
                                  <Package className="h-3 w-3" />
                                  Out of Stock
                                </Badge>
                              )}
                              {stockStatus.lowStock.length > 0 && stockStatus.outOfStock.length === 0 && (
                                <Badge variant="secondary" className="ml-2 gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Low Stock
                                </Badge>
                              )}
                            </div>
                            {recipe.description && (
                              <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                                {recipe.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {recipeFoods.slice(0, 4).map(food => (
                                <Badge key={food.id} variant="outline" className="text-xs">
                                  {food.name}
                                </Badge>
                              ))}
                              {recipeFoods.length > 4 && (
                                <Badge variant="outline" className="text-xs">
                                  +{recipeFoods.length - 4} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
