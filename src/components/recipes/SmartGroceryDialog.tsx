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
import { convert } from "@/lib/unitNormalize";
import { formatQuantity } from "@/lib/groceryMerge";

interface SmartGroceryDialogProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  groceryItems: GroceryItem[];
  onAddGroceryItems: (items: { name: string; quantity: number; unit: string; category: string; aisle?: string }[]) => void;
}

interface IngredientStatus {
  key: string;
  name: string;
  /** Quantity the (scaled) recipe needs, in `unit`. */
  needed: number;
  unit: string;
  /** On-hand quantity expressed in `unit` when convertible, else raw. */
  inStock: number;
  /** Quantity to actually buy (needed − on-hand, floored at 0). */
  toBuy: number;
  category: string;
  aisle?: string;
  status: "in-stock" | "low-stock" | "need-to-buy";
  alreadyInGrocery: boolean;
}

/** Parse the recipe's base servings; default to 4 when unset/garbled. */
function parseBaseServings(servings?: string): number {
  const n = parseInt(servings ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

export function SmartGroceryDialog({
  recipe,
  open,
  onOpenChange,
  foods,
  groceryItems,
  onAddGroceryItems,
}: SmartGroceryDialogProps) {
  const baseServings = parseBaseServings(recipe?.servings);
  // Target servings the user wants to shop for — starts at the recipe's own.
  const [targetServings, setTargetServings] = useState(baseServings);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Reset the target whenever a different recipe opens.
  useEffect(() => {
    setTargetServings(parseBaseServings(recipe?.servings));
  }, [recipe?.id, recipe?.servings]);

  const scale = baseServings > 0 ? targetServings / baseServings : 1;

  // Analyze ingredients against pantry stock. Prefer structured
  // recipe_ingredients (US-281: real quantity + unit); fall back to food_ids.
  const ingredientStatuses = useMemo<IngredientStatus[]>(() => {
    if (!recipe) return [];

    type Raw = { key: string; name: string; baseQty: number; unit: string; food?: Food };
    const raws: Raw[] = [];

    const structured = recipe.recipe_ingredients ?? [];
    if (structured.length > 0) {
      structured.forEach((ing) => {
        const food = ing.food_id
          ? foods.find((f) => f.id === ing.food_id)
          : foods.find((f) => f.name.toLowerCase() === ing.name.toLowerCase());
        raws.push({
          key: ing.id || ing.name,
          name: ing.name || food?.name || "Ingredient",
          baseQty: ing.quantity ?? 1,
          unit: ing.unit ?? food?.unit ?? "",
          food,
        });
      });
    } else {
      recipe.food_ids.forEach((foodId) => {
        const food = foods.find((f) => f.id === foodId);
        if (!food) return;
        raws.push({ key: food.id, name: food.name, baseQty: 1, unit: food.unit ?? "", food });
      });
    }

    return raws.map((r): IngredientStatus => {
      const needed = r.baseQty * scale;
      const onHandRaw = r.food?.quantity ?? 0;
      // Express on-hand in the ingredient's unit when units are convertible.
      const converted =
        r.food && r.food.unit && r.unit ? convert(onHandRaw, r.food.unit, r.unit) : null;
      const inStock = converted ?? onHandRaw;
      const toBuy = Math.max(0, Math.round((needed - inStock) * 100) / 100);

      let status: IngredientStatus["status"];
      if (inStock >= needed && needed > 0) status = "in-stock";
      else if (inStock > 0) status = "low-stock";
      else status = "need-to-buy";

      const alreadyInGrocery = groceryItems.some(
        (gi) => gi.name.toLowerCase() === r.name.toLowerCase() && !gi.checked
      );

      return {
        key: r.key,
        name: r.name,
        needed: Math.round(needed * 100) / 100,
        unit: r.unit,
        inStock: Math.round(inStock * 100) / 100,
        toBuy,
        category: r.food?.category ?? "snack",
        aisle: r.food?.aisle,
        status,
        alreadyInGrocery,
      };
    });
  }, [recipe, foods, groceryItems, scale]);

  // Default-check everything that needs buying and isn't already on the list.
  useEffect(() => {
    const needToBuy = ingredientStatuses
      .filter((s) => s.status !== "in-stock" && !s.alreadyInGrocery)
      .map((s) => s.key);
    setCheckedItems(new Set(needToBuy));
  }, [ingredientStatuses]);

  const inStock = ingredientStatuses.filter((s) => s.status === "in-stock");
  const lowStock = ingredientStatuses.filter((s) => s.status === "low-stock");
  const needToBuy = ingredientStatuses.filter((s) => s.status === "need-to-buy");

  const checkedCount = checkedItems.size;
  const hasIngredientsToAdd = checkedCount > 0;

  const toggleItem = (key: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAdd = () => {
    const itemsToAdd = ingredientStatuses
      .filter((s) => checkedItems.has(s.key))
      .map((s) => ({
        name: s.name,
        // Buy the shortfall; if we somehow have enough, still add what the
        // recipe needs so the user isn't handed a zero-quantity line.
        quantity: s.toBuy > 0 ? s.toBuy : s.needed || 1,
        unit: s.unit,
        category: s.category,
        aisle: s.aisle,
      }));

    if (itemsToAdd.length === 0) {
      toast.error("No items selected");
      return;
    }

    onAddGroceryItems(itemsToAdd);
    onOpenChange(false);
  };

  if (!recipe) return null;

  const renderIngredientRow = (item: IngredientStatus) => (
    <label
      key={item.key}
      className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-accent/50 cursor-pointer"
    >
      <Checkbox checked={checkedItems.has(item.key)} onCheckedChange={() => toggleItem(item.key)} />
      <span className="flex-1 text-sm">
        {item.name}
        <span className="text-xs text-muted-foreground ml-1.5 tabular-nums">
          {formatQuantity(item.needed)}
          {item.unit ? ` ${item.unit}` : ""}
        </span>
      </span>
      {item.alreadyInGrocery && (
        <Badge variant="outline" className="text-[10px] h-5">
          in list
        </Badge>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        have {formatQuantity(item.inStock)}
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

        {/* Serving adjustment — shows the ACTUAL serving count, not a multiplier */}
        <div className="flex items-center justify-between py-2 border-b">
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {targetServings} {targetServings === 1 ? "serving" : "servings"}
            </span>
            {targetServings !== baseServings && (
              <span className="text-xs text-muted-foreground">
                recipe makes {baseServings} · scaled {formatQuantity(scale)}×
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Fewer servings"
              onClick={() => setTargetServings((p) => Math.max(1, p - 1))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm w-6 text-center tabular-nums">{targetServings}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="More servings"
              onClick={() => setTargetServings((p) => Math.min(99, p + 1))}
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
                <span className="text-sm font-medium">Need to Buy ({needToBuy.length})</span>
              </div>
              <div className="space-y-0.5">{needToBuy.map(renderIngredientRow)}</div>
            </div>
          )}

          {/* Low Stock */}
          {lowStock.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Low Stock ({lowStock.length})</span>
              </div>
              <div className="space-y-0.5">{lowStock.map(renderIngredientRow)}</div>
            </div>
          )}

          {/* In Stock */}
          {inStock.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">In Stock ({inStock.length})</span>
              </div>
              <div className="space-y-0.5">{inStock.map(renderIngredientRow)}</div>
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
