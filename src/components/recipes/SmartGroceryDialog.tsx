import { useState, useMemo } from "react";
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
import { Minus, Plus, CheckCircle2, AlertTriangle, ShoppingCart, Ruler } from "lucide-react";
import { toast } from "sonner";
import { Recipe, Food, GroceryItem } from "@/types";
import { convert } from "@/lib/unitNormalize";
import { formatQuantity } from "@/lib/groceryMerge";
import { useFoods, useGrocery } from "@/contexts/AppContext";
import { resolveFood, type EffectiveFood } from "@/lib/effectiveFood";
import { clampTargetServings, parseBaseServings } from "@/lib/recipeServings";

interface SmartGroceryDialogProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  /**
   * @deprecated Ignored. The dialog reads the list from useGrocery() so it
   * cannot go stale; kept optional until every caller stops passing it.
   */
  groceryItems?: GroceryItem[];
  /** Servings to open at (e.g. what the detail sheet was scaled to). */
  initialServings?: number;
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
  /** Quantity to actually buy (needed - on-hand, floored at 0). */
  toBuy: number;
  category: string;
  aisle?: string;
  /**
   * check-units: the pantry has it, but in a unit that cannot be converted
   * to the recipe's (cups vs lb). Not treated as in stock, not pre-checked.
   */
  status: "in-stock" | "low-stock" | "need-to-buy" | "check-units";
  alreadyInGrocery: boolean;
}

const unitKey = (u: string | null | undefined) => (u ?? "").trim().toLowerCase();

/** Every ingredient's pantry status at `scale` times the recipe's amounts. */
function analyzeIngredients(
  recipe: Recipe | null,
  foods: Food[],
  groceryItems: readonly GroceryItem[],
  scale: number,
  resolve: (food: Food) => EffectiveFood,
): IngredientStatus[] {
  if (!recipe) return [];

  type Raw = { key: string; name: string; baseQty: number; unit: string; food?: Food };
  const raws: Raw[] = [];
  const byId = new Map(foods.map((f) => [f.id, f]));

  const structured = (recipe.recipe_ingredients ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (structured.length > 0) {
    structured.forEach((ing) => {
      const food = ing.food_id
        ? byId.get(ing.food_id)
        : foods.find((f) => f.name.toLowerCase() === ing.name.toLowerCase());
      raws.push({
        key: ing.id || ing.name,
        name: ing.name || food?.name || "Ingredient",
        baseQty: typeof ing.quantity === "number" && ing.quantity > 0 ? ing.quantity : 1,
        unit: ing.unit ?? food?.unit ?? "",
        food,
      });
    });
  } else {
    recipe.food_ids.forEach((foodId) => {
      const food = byId.get(foodId);
      if (!food) return;
      raws.push({ key: food.id, name: food.name, baseQty: 1, unit: food.unit ?? "", food });
    });
  }

  const onList = new Set(groceryItems.filter((gi) => !gi.checked).map((gi) => gi.name.toLowerCase()));

  return raws.map((r): IngredientStatus => {
    const needed = r.baseQty * scale;
    const onHandRaw = r.food?.quantity ?? 0;
    const sameUnit = !r.food || unitKey(r.food.unit) === unitKey(r.unit) || !r.food.unit || !r.unit;
    // Express on-hand in the ingredient's unit when units are convertible.
    const converted = sameUnit ? onHandRaw : convert(onHandRaw, r.food?.unit ?? "", r.unit);
    const unitsClash = converted === null && onHandRaw > 0;
    const inStock = converted ?? 0;
    const toBuy = unitsClash ? needed : Math.max(0, Math.round((needed - inStock) * 100) / 100);

    let status: IngredientStatus["status"];
    if (unitsClash) status = "check-units";
    else if (inStock >= needed && needed > 0) status = "in-stock";
    else if (inStock > 0) status = "low-stock";
    else status = "need-to-buy";

    // US-795: category/aisle come from the resolved (catalog-preferred)
    // food, not the household row's raw columns, so an ingredient added
    // from here matches how the same catalog-linked product looks on the
    // grocery list, planner and pantry.
    const effective = r.food ? resolve(r.food) : null;

    return {
      key: r.key,
      name: r.name,
      needed: Math.round(needed * 100) / 100,
      unit: r.unit,
      inStock: Math.round((unitsClash ? onHandRaw : inStock) * 100) / 100,
      toBuy,
      category: effective?.category ?? "snack",
      aisle: effective?.aisle,
      status,
      alreadyInGrocery: onList.has(r.name.toLowerCase()),
    };
  });
}

/** Pre-checked: what needs buying, is comparable, and is not on the list yet. */
function defaultChecked(statuses: IngredientStatus[]): Set<string> {
  return new Set(
    statuses
      .filter((s) => (s.status === "need-to-buy" || s.status === "low-stock") && !s.alreadyInGrocery)
      .map((s) => s.key),
  );
}

export function SmartGroceryDialog({
  recipe,
  open,
  onOpenChange,
  foods,
  initialServings,
  onAddGroceryItems,
}: SmartGroceryDialogProps) {
  const { catalogById } = useFoods();
  const { groceryItems } = useGrocery();
  const baseServings = parseBaseServings(recipe?.servings);
  const startServings = clampTargetServings(initialServings ?? baseServings);
  // Target servings the user wants to shop for.
  const [targetServings, setTargetServings] = useState(startServings);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => new Set());

  const resolve = useMemo(
    () => (food: Food) => resolveFood(food, food.canonical_id ? catalogById[food.canonical_id] : null),
    [catalogById],
  );

  const scale = baseServings > 0 ? targetServings / baseServings : 1;

  const ingredientStatuses = useMemo<IngredientStatus[]>(
    () => analyzeIngredients(recipe, foods, groceryItems, scale, resolve),
    [recipe, foods, groceryItems, scale, resolve],
  );

  // Seed the servings and the checkboxes when the dialog opens or another
  // recipe loads, and only then. Re-seeding on every recompute (a realtime
  // grocery event, a pantry edit) wiped whatever the user had unticked.
  const seedKey = open && recipe ? recipe.id : null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    if (seedKey && recipe) {
      setTargetServings(startServings);
      setCheckedItems(
        defaultChecked(analyzeIngredients(recipe, foods, groceryItems, startServings / baseServings, resolve)),
      );
    }
  }

  const inStock = ingredientStatuses.filter((s) => s.status === "in-stock");
  const lowStock = ingredientStatuses.filter((s) => s.status === "low-stock");
  const checkUnits = ingredientStatuses.filter((s) => s.status === "check-units");
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
      {item.status === "check-units" && (
        <Badge variant="outline" className="text-[10px] h-5">
          check units
        </Badge>
      )}
      {item.alreadyInGrocery && (
        <Badge variant="outline" className="text-[10px] h-5">
          in list
        </Badge>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        have {formatQuantity(item.inStock)}
        {item.status === "check-units" && item.inStock > 0 ? " (other unit)" : ""}
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
              className="h-11 w-11"
              aria-label="Fewer servings"
              onClick={() => setTargetServings((p) => clampTargetServings(p - 1))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm w-6 text-center tabular-nums">{targetServings}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              aria-label="More servings"
              onClick={() => setTargetServings((p) => clampTargetServings(p + 1))}
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
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                <span className="text-sm font-medium">Low Stock ({lowStock.length})</span>
              </div>
              <div className="space-y-0.5">{lowStock.map(renderIngredientRow)}</div>
            </div>
          )}

          {/* Units that cannot be compared */}
          {checkUnits.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Ruler className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">Check units ({checkUnits.length})</span>
              </div>
              <div className="space-y-0.5">{checkUnits.map(renderIngredientRow)}</div>
            </div>
          )}

          {/* In Stock */}
          {inStock.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-safe-food" aria-hidden="true" />
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
