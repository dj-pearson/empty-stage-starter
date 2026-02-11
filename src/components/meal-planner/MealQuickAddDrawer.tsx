import { useState, useMemo, useCallback } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Food, Recipe, MealSlot, Kid } from "@/types";
import {
  Search,
  ChefHat,
  Apple,
  AlertTriangle,
  Package,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface MealQuickAddContext {
  date: string;
  slot: MealSlot;
  kidId?: string; // If set, only update this kid. If not, update all kids.
  currentFoodId?: string; // For showing "eat with family" option
  familyFoodId?: string; // The family meal food for reference
  mode: "add" | "change" | "substitute";
}

interface MealQuickAddDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: MealQuickAddContext | null;
  foods: Food[];
  recipes: Recipe[];
  kids: Kid[];
  onSelectFood: (foodId: string, context: MealQuickAddContext) => void;
  onSelectRecipe: (recipeId: string, context: MealQuickAddContext) => void;
  onEatWithFamily: (context: MealQuickAddContext) => void;
}

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack1: "Snack",
  snack2: "Snack",
  try_bite: "Try Bite",
};

const CATEGORY_ORDER = ["protein", "carb", "fruit", "vegetable", "dairy", "snack"];

export function MealQuickAddDrawer({
  open,
  onOpenChange,
  context,
  foods,
  recipes,
  kids,
  onSelectFood,
  onSelectRecipe,
  onEatWithFamily,
}: MealQuickAddDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"foods" | "recipes">("foods");

  const kid = context?.kidId ? kids.find((k) => k.id === context.kidId) : null;
  const slotLabel = context ? SLOT_LABELS[context.slot] : "";
  const isTryBite = context?.slot === "try_bite";

  const familyFood = context?.familyFoodId
    ? foods.find((f) => f.id === context.familyFoodId)
    : null;

  // Title based on context
  const title = useMemo(() => {
    if (!context) return "Add Meal";
    if (context.mode === "substitute" && kid) {
      return `${kid.name}'s ${slotLabel}`;
    }
    if (context.mode === "change") {
      return `Change ${slotLabel}`;
    }
    return `Add ${slotLabel}`;
  }, [context, kid, slotLabel]);

  const description = useMemo(() => {
    if (!context) return "";
    if (context.mode === "substitute" && kid) {
      return `Choose a different meal for ${kid.name}`;
    }
    if (context.mode === "change" && !context.kidId) {
      return "This will update the meal for everyone";
    }
    return isTryBite ? "Pick a try-bite food" : "Choose a food or recipe";
  }, [context, kid, isTryBite]);

  // Filter foods
  const filteredFoods = useMemo(() => {
    return foods
      .filter((food) => {
        const matchesSearch = food.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        if (isTryBite) return matchesSearch && food.is_try_bite;
        return matchesSearch && food.is_safe;
      })
      .sort((a, b) => {
        // Sort: in-stock first, then alphabetical
        const aStock = a.quantity || 0;
        const bStock = b.quantity || 0;
        if (aStock > 0 && bStock === 0) return -1;
        if (aStock === 0 && bStock > 0) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [foods, searchQuery, isTryBite]);

  // Group foods by category
  const foodsByCategory = useMemo(() => {
    const groups: Record<string, Food[]> = {};
    filteredFoods.forEach((food) => {
      if (!groups[food.category]) groups[food.category] = [];
      groups[food.category].push(food);
    });
    return groups;
  }, [filteredFoods]);

  // Filter recipes
  const filteredRecipes = useMemo(() => {
    if (isTryBite) return []; // No recipes for try-bite
    return recipes.filter((recipe) =>
      recipe.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [recipes, searchQuery, isTryBite]);

  const handleSelectFood = useCallback(
    (foodId: string) => {
      if (!context) return;
      onSelectFood(foodId, context);
      onOpenChange(false);
      setSearchQuery("");
    },
    [context, onSelectFood, onOpenChange],
  );

  const handleSelectRecipe = useCallback(
    (recipeId: string) => {
      if (!context) return;
      onSelectRecipe(recipeId, context);
      onOpenChange(false);
      setSearchQuery("");
    },
    [context, onSelectRecipe, onOpenChange],
  );

  const handleEatWithFamily = useCallback(() => {
    if (!context) return;
    onEatWithFamily(context);
    onOpenChange(false);
    setSearchQuery("");
  }, [context, onEatWithFamily, onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-lg">{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>

        <div className="px-4 space-y-3 flex-1 overflow-hidden flex flex-col">
          {/* "Eat with family" option for substitutes */}
          {context?.mode === "substitute" && familyFood && (
            <button
              onClick={handleEatWithFamily}
              className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 active:scale-[0.98] transition-transform"
            >
              <Users className="h-5 w-5 text-green-600 shrink-0" />
              <div className="text-left">
                <p className="font-semibold text-sm text-foreground">
                  Eat with family
                </p>
                <p className="text-xs text-muted-foreground">
                  Have {familyFood.name} like everyone else
                </p>
              </div>
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search foods..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-11 rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Tab toggle */}
          {!isTryBite && (
            <div className="flex gap-1 p-1 bg-muted/50 rounded-xl">
              <button
                onClick={() => setActiveTab("foods")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                  activeTab === "foods"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Apple className="h-4 w-4 inline mr-1.5" />
                Foods
              </button>
              <button
                onClick={() => setActiveTab("recipes")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                  activeTab === "recipes"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <ChefHat className="h-4 w-4 inline mr-1.5" />
                Recipes
              </button>
            </div>
          )}

          {/* Food list */}
          <ScrollArea className="flex-1 -mx-4 px-4 pb-[env(safe-area-inset-bottom)]">
            <div className="pb-6 space-y-4">
              {activeTab === "foods" || isTryBite ? (
                filteredFoods.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="font-medium">No foods found</p>
                    <p className="text-sm mt-1">
                      {searchQuery
                        ? "Try a different search"
                        : isTryBite
                          ? "Add try-bite foods in your pantry"
                          : "Add safe foods in your pantry"}
                    </p>
                  </div>
                ) : (
                  CATEGORY_ORDER.map((category) => {
                    const categoryFoods = foodsByCategory[category];
                    if (!categoryFoods || categoryFoods.length === 0) return null;

                    return (
                      <div key={category}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                          {category}
                        </p>
                        <div className="space-y-1">
                          {categoryFoods.map((food) => {
                            const isOutOfStock = (food.quantity || 0) === 0;
                            const isLowStock =
                              (food.quantity || 0) > 0 && (food.quantity || 0) <= 2;

                            return (
                              <button
                                key={food.id}
                                onClick={() => handleSelectFood(food.id)}
                                disabled={isOutOfStock}
                                className={cn(
                                  "w-full flex items-center justify-between p-3 rounded-xl transition-all",
                                  "active:scale-[0.98]",
                                  isOutOfStock
                                    ? "opacity-50 bg-muted/30"
                                    : "bg-background/60 hover:bg-background border border-border/50 hover:border-primary/30",
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium text-sm text-foreground truncate">
                                    {food.name}
                                  </span>
                                  {food.allergens && food.allergens.length > 0 && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] px-1 py-0 shrink-0 border-orange-300 text-orange-600"
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                      {food.allergens[0]}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isOutOfStock ? (
                                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                                      <Package className="h-2.5 w-2.5 mr-0.5" />
                                      Out
                                    </Badge>
                                  ) : isLowStock ? (
                                    <Badge
                                      variant="secondary"
                                      className="text-[9px] px-1.5 py-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                    >
                                      Low ({food.quantity})
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {food.quantity}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                // Recipes tab
                filteredRecipes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="font-medium">No recipes found</p>
                    <p className="text-sm mt-1">
                      {searchQuery ? "Try a different search" : "Create recipes to use them here"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredRecipes.map((recipe) => (
                      <button
                        key={recipe.id}
                        onClick={() => handleSelectRecipe(recipe.id)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-background/60 hover:bg-background border border-border/50 hover:border-primary/30 transition-all active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ChefHat className="h-4 w-4 text-primary shrink-0" />
                          <div className="text-left min-w-0">
                            <span className="font-medium text-sm text-foreground block truncate">
                              {recipe.name}
                            </span>
                            {recipe.description && (
                              <span className="text-[11px] text-muted-foreground block truncate">
                                {recipe.description}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                          {recipe.food_ids?.length || 0} items
                        </Badge>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
