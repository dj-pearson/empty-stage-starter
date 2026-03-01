import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, CheckCircle2, AlertTriangle, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Recipe, Food, GroceryItem } from "@/types";

interface SmartGroceryDialogProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  groceryItems: GroceryItem[];
  onAddGroceryItems: (items: { name: string; quantity: number; unit: string; category: string; aisle?: string }[]) => void;
}

interface IngredientStatus {
  food: Food;
  needed: number;
  inStock: number;
  difference: number;
  status: "in-stock" | "low-stock" | "need-to-buy";
  alreadyInGrocery: boolean;
}

export function SmartGroceryDialog({
  recipe,
  open,
  onOpenChange,
  foods,
  groceryItems,
  onAddGroceryItems,
}: SmartGroceryDialogProps) {
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Analyze ingredients against pantry stock
  const ingredientStatuses = useMemo(() => {
    if (!recipe) return [];

    const statuses: IngredientStatus[] = [];

    recipe.food_ids.forEach((foodId) => {
      const food = foods.find((f) => f.id === foodId);
      if (!food) return;

      const inStock = food.quantity ?? 0;
      const needed = servingMultiplier; // Base 1 unit per serving multiplier
      const alreadyInGrocery = groceryItems.some(
        (gi) => gi.name.toLowerCase() === food.name.toLowerCase() && !gi.checked
      );

      let status: IngredientStatus["status"];
      if (inStock >= needed) {
        status = "in-stock";
      } else if (inStock > 0) {
        status = "low-stock";
      } else {
        status = "need-to-buy";
      }

      statuses.push({
        food,
        needed,
        inStock,
        difference: Math.max(0, needed - inStock),
        status,
        alreadyInGrocery,
      });
    });

    return statuses;
  }, [recipe, foods, groceryItems, servingMultiplier]);

  // Initialize checked items to "need-to-buy" items
  useEffect(() => {
    const needToBuy = ingredientStatuses
      .filter((s) => s.status === "need-to-buy" && !s.alreadyInGrocery)
      .map((s) => s.food.id);
    setCheckedItems(new Set(needToBuy));
  }, [ingredientStatuses]);

  const inStock = ingredientStatuses.filter((s) => s.status === "in-stock");
  const lowStock = ingredientStatuses.filter((s) => s.status === "low-stock");
  const needToBuy = ingredientStatuses.filter((s) => s.status === "need-to-buy");

  const checkedCount = checkedItems.size;
  const hasIngredientsToAdd = checkedCount > 0;

  const toggleItem = (foodId: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(foodId)) {
        next.delete(foodId);
      } else {
        next.add(foodId);
      }
      return next;
    });
  };

  const handleAdd = () => {
    const itemsToAdd = ingredientStatuses
      .filter((s) => checkedItems.has(s.food.id))
      .map((s) => ({
        name: s.food.name,
        quantity: s.difference || 1,
        unit: s.food.unit || "pieces",
        category: s.food.category,
        aisle: s.food.aisle,
      }));

    if (itemsToAdd.length === 0) {
      toast.error("No items selected");
      return;
    }

    onAddGroceryItems(itemsToAdd);
    toast.success(
      `Added ${itemsToAdd.length} item${itemsToAdd.length !== 1 ? "s" : ""} to grocery list`,
      { description: `For: ${recipe?.name}` }
    );
    onOpenChange(false);
  };

  if (!recipe) return null;

  const renderIngredientRow = (item: IngredientStatus) => (
    <label
      key={item.food.id}
      className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-accent/50 cursor-pointer"
    >
      <Checkbox
        checked={checkedItems.has(item.food.id)}
        onCheckedChange={() => toggleItem(item.food.id)}
      />
      <span className="flex-1 text-sm">{item.food.name}</span>
      {item.alreadyInGrocery && (
        <Badge variant="outline" className="text-[10px] h-5">
          in list
        </Badge>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        stock: {item.inStock}
      </span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Add to Grocery List
          </DialogTitle>
          <DialogDescription className="sr-only">Add recipe ingredients to your grocery list</DialogDescription>
          <p className="text-sm text-muted-foreground">{recipe.name}</p>
        </DialogHeader>

        {/* Serving adjustment */}
        <div className="flex items-center justify-between py-2 border-b">
          <span className="text-sm font-medium">Servings</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setServingMultiplier((p) => Math.max(1, p - 1))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm w-6 text-center">{servingMultiplier}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setServingMultiplier((p) => Math.min(10, p + 1))}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto space-y-4">
          {/* Need to Buy */}
          {needToBuy.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  Need to Buy ({needToBuy.length})
                </span>
              </div>
              <div className="space-y-0.5">
                {needToBuy.map(renderIngredientRow)}
              </div>
            </div>
          )}

          {/* Low Stock */}
          {lowStock.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">
                  Low Stock ({lowStock.length})
                </span>
              </div>
              <div className="space-y-0.5">
                {lowStock.map(renderIngredientRow)}
              </div>
            </div>
          )}

          {/* In Stock */}
          {inStock.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">
                  In Stock ({inStock.length})
                </span>
              </div>
              <div className="space-y-0.5">
                {inStock.map(renderIngredientRow)}
              </div>
            </div>
          )}

          {ingredientStatuses.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              This recipe has no tracked ingredients.
            </p>
          )}
        </div>

        {/* Summary */}
        {ingredientStatuses.length > 0 && (
          <div className="text-sm text-muted-foreground pt-2 border-t">
            You have {inStock.length} of {ingredientStatuses.length} ingredients.
            {checkedCount > 0 && ` Adding ${checkedCount} to grocery list.`}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!hasIngredientsToAdd}>
            Add {checkedCount} Item{checkedCount !== 1 ? "s" : ""} to Grocery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
