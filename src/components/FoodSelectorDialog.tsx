import { memo, useCallback, useDeferredValue, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Food, Kid, MealSlot, PlanEntry, Recipe } from "@/types";
import { Search, ChefHat, Apple, ShieldAlert, ShoppingCart } from "lucide-react";
import { countMissingForRecipe } from "@/lib/recipeShortfall";
import {
  buildResultIndex,
  getKidFoodFit,
  getKidRecipeFit,
  type KidFit,
  type ResultIndex,
} from "@/lib/kidFit";
import { cn } from "@/lib/utils";

export type FoodSelectorKid = Pick<Kid, "id" | "name" | "allergens" | "disliked_foods" | "always_eats_foods">;

interface FoodSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  recipes: Recipe[];
  slot: MealSlot | null;
  date: string | null;
  onSelectFood: (foodId: string) => void;
  onSelectRecipe: (recipeId: string) => void;
  /**
   * The child this pick is for. With it, allergen hits are blocked with the
   * reason, dislikes are badged, and foods group by how this kid eats them.
   * Without it (family view) the picker groups by the household flags only.
   */
  kid?: FoodSelectorKid | null;
  /** Plan history, for "ate 4/5" counts. Only the kid's own entries count. */
  planEntries?: PlanEntry[];
}

type GroupKey = "always" | "safe" | "tryBite" | "dislikes" | "all";

interface ScoredFood {
  food: Food;
  fit: KidFit;
  inStock: boolean;
}

const NO_KID = { id: "", allergens: [], disliked_foods: [], always_eats_foods: [] };
const EMPTY_INDEX: ResultIndex = new Map();

/** In stock first, then the kid's best-eaten, then by name. */
function compareScored(a: ScoredFood, b: ScoredFood): number {
  if (Boolean(a.fit.allergen) !== Boolean(b.fit.allergen)) return a.fit.allergen ? 1 : -1;
  if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
  if (a.fit.ate !== b.fit.ate) return b.fit.ate - a.fit.ate;
  return a.food.name.localeCompare(b.food.name);
}

function groupOf(s: ScoredFood): Exclude<GroupKey, "all"> | null {
  if (s.fit.disliked) return "dislikes";
  if (s.fit.alwaysEats) return "always";
  if (s.fit.safe) return "safe";
  if (s.fit.tryBite) return "tryBite";
  return null;
}

function FoodSelectorDialogImpl({
  open,
  onOpenChange,
  foods,
  recipes,
  slot,
  date,
  onSelectFood,
  onSelectRecipe,
  kid,
  planEntries,
}: FoodSelectorDialogProps) {
  const { t, i18n } = useTranslation();
  const idPrefix = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("foods");
  const [showAll, setShowAll] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);
  const query = deferredQuery.trim().toLowerCase();

  const slotLabel = useMemo(() => {
    const labels: Record<MealSlot, string> = {
      breakfast: t("planner.slots.breakfast", { defaultValue: "Breakfast" }),
      lunch: t("planner.slots.lunch", { defaultValue: "Lunch" }),
      dinner: t("planner.slots.dinner", { defaultValue: "Dinner" }),
      snack1: t("planner.slots.snack1", { defaultValue: "Snack 1" }),
      snack2: t("planner.slots.snack2", { defaultValue: "Snack 2" }),
      try_bite: t("planner.slots.try_bite", { defaultValue: "Try Bite" }),
    };
    return slot ? labels[slot] : t("planner.picker.meal", { defaultValue: "Meal" });
  }, [slot, t]);

  const formattedDate = useMemo(() => {
    if (!date) return null;
    const d = new Date(`${date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat(i18n.language || undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(d);
  }, [date, i18n.language]);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  const fitKid = kid ?? NO_KID;
  const resultIndex = useMemo(
    () => (kid && planEntries ? buildResultIndex(planEntries, kid.id) : EMPTY_INDEX),
    [kid, planEntries],
  );

  const scoredFoods = useMemo<ScoredFood[]>(
    () =>
      foods.map((food) => ({
        food,
        fit: getKidFoodFit(fitKid, food, resultIndex),
        inStock: (food.quantity ?? 0) > 0,
      })),
    [foods, fitKid, resultIndex],
  );

  const matchingFoods = useMemo(
    () =>
      (query ? scoredFoods.filter((s) => s.food.name.toLowerCase().includes(query)) : scoredFoods)
        .slice()
        .sort(compareScored),
    [scoredFoods, query],
  );

  const groups = useMemo(() => {
    if (showAll) return [{ key: "all" as GroupKey, items: matchingFoods }];
    const buckets: Record<Exclude<GroupKey, "all">, ScoredFood[]> = {
      always: [],
      safe: [],
      tryBite: [],
      dislikes: [],
    };
    for (const s of matchingFoods) {
      const g = groupOf(s);
      if (g) buckets[g].push(s);
    }
    const order: Array<Exclude<GroupKey, "all">> =
      slot === "try_bite" ? ["tryBite", "always", "safe", "dislikes"] : ["always", "safe", "tryBite", "dislikes"];
    return order.map((key) => ({ key: key as GroupKey, items: buckets[key] })).filter((g) => g.items.length > 0);
  }, [matchingFoods, showAll, slot]);

  const visibleFoodCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const scoredRecipes = useMemo(
    () =>
      recipes
        .filter((r) => !query || r.name.toLowerCase().includes(query))
        .map((recipe) => ({
          recipe,
          missing: countMissingForRecipe(recipe, foods),
          fit: getKidRecipeFit(fitKid, recipe, foodById, resultIndex),
          recipeFoods: (recipe.food_ids ?? [])
            .map((id) => foodById.get(id))
            .filter((f): f is Food => Boolean(f)),
        }))
        .sort((a, b) => {
          if (Boolean(a.fit.allergen) !== Boolean(b.fit.allergen)) return a.fit.allergen ? 1 : -1;
          if ((a.missing === 0) !== (b.missing === 0)) return a.missing === 0 ? -1 : 1;
          return a.recipe.name.localeCompare(b.recipe.name);
        }),
    [recipes, query, foods, fitKid, foodById, resultIndex],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setSearchQuery("");
        setActiveTab("foods");
        setShowAll(false);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const groupTitle = (key: GroupKey): string => {
    switch (key) {
      case "always":
        return t("planner.picker.groups.always", { defaultValue: "Always eats" });
      case "safe":
        return t("planner.picker.groups.safe", { defaultValue: "Safe" });
      case "tryBite":
        return t("planner.picker.groups.tryBite", { defaultValue: "Try bite" });
      case "dislikes":
        return t("planner.picker.groups.dislikes", { defaultValue: "Dislikes" });
      default:
        return t("planner.picker.groups.all", { defaultValue: "All foods" });
    }
  };

  const allergenText = (allergen: string) =>
    kid
      ? t("planner.picker.allergenFor", {
          defaultValue: "Contains {{allergen}}, {{name}} is allergic",
          allergen,
          name: kid.name,
        })
      : t("planner.picker.allergen", { defaultValue: "Contains {{allergen}}", allergen });

  const ateText = (fit: KidFit) =>
    fit.tries > 0
      ? t("planner.picker.ateCount", {
          defaultValue: "ate {{ate}}/{{tries}}",
          ate: fit.ate,
          tries: fit.tries,
        })
      : null;

  const renderFood = ({ food, fit, inStock }: ScoredFood) => {
    const blocked = Boolean(fit.allergen);
    const reasonId = `${idPrefix}-food-${food.id}-reason`;
    const ate = ateText(fit);
    return (
      <Button
        key={food.id}
        variant="outline"
        className={cn(
          "w-full justify-start h-auto min-h-11 p-3 sm:p-4",
          blocked && "cursor-not-allowed opacity-70",
        )}
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? reasonId : undefined}
        onClick={() => {
          if (blocked) return;
          onSelectFood(food.id);
          handleOpenChange(false);
        }}
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium truncate">{food.name}</span>
            <Badge variant="secondary" className="shrink-0">
              {food.category}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {blocked && fit.allergen && (
              <Badge id={reasonId} variant="destructive" className="gap-1">
                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                {allergenText(fit.allergen)}
              </Badge>
            )}
            {!blocked && fit.disliked && (
              <Badge variant="outline" className="border-warning/40 text-warning font-normal">
                {t("planner.picker.dislikeBadge", { defaultValue: "Dislikes" })}
              </Badge>
            )}
            {inStock ? (
              <span>
                {t("planner.picker.stock", {
                  defaultValue: "Have {{qty}} {{unit}}",
                  qty: food.quantity ?? 0,
                  unit: food.unit || t("planner.picker.servings", { defaultValue: "servings" }),
                })}
              </span>
            ) : (
              <Badge variant="secondary" className="gap-1 font-normal">
                <ShoppingCart className="h-3 w-3" aria-hidden="true" />
                {t("planner.picker.needToBuyFood", { defaultValue: "Need to buy" })}
              </Badge>
            )}
            {ate && <span>{ate}</span>}
          </div>
        </div>
      </Button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-none sm:w-full sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {kid
              ? t("planner.picker.titleForKid", {
                  defaultValue: "Add to {{slot}} for {{name}}",
                  slot: slotLabel,
                  name: kid.name,
                })
              : t("planner.picker.title", { defaultValue: "Add to {{slot}}", slot: slotLabel })}
            {formattedDate && (
              <span className="text-sm text-muted-foreground ml-2">({formattedDate})</span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("planner.picker.description", { defaultValue: "Select foods to add to the meal plan" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder={t("planner.picker.searchPlaceholder", { defaultValue: "Search foods or recipes..." })}
              aria-label={t("planner.picker.searchLabel", { defaultValue: "Search foods or recipes" })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="foods">
                <Apple className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("planner.picker.foodsTab", { defaultValue: "Foods ({{count}})", count: visibleFoodCount })}
              </TabsTrigger>
              <TabsTrigger value="recipes">
                <ChefHat className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("planner.picker.recipesTab", { defaultValue: "Recipes ({{count}})", count: scoredRecipes.length })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="foods" className="mt-4 space-y-3">
              <div className="flex items-center justify-end gap-2">
                <Switch
                  id={`${idPrefix}-show-all`}
                  checked={showAll}
                  onCheckedChange={setShowAll}
                />
                <Label htmlFor={`${idPrefix}-show-all`} className="text-sm">
                  {t("planner.picker.showAll", { defaultValue: "All foods" })}
                </Label>
              </div>
              <ScrollArea className="max-h-[50vh] pr-4 [&>[data-radix-scroll-area-viewport]]:max-h-[50vh]">
                {visibleFoodCount === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Apple className="h-12 w-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
                    <p>{t("planner.picker.noFoods", { defaultValue: "No foods found" })}</p>
                    <p className="text-sm">
                      {showAll
                        ? t("planner.picker.noFoodsHint", {
                            defaultValue: "Try adjusting your search or add more foods to the pantry",
                          })
                        : t("planner.picker.noFoodsHintGrouped", {
                            defaultValue: "Try a different search, or switch on All foods",
                          })}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groups.map((group) => (
                      <section key={group.key} aria-labelledby={`${idPrefix}-group-${group.key}`}>
                        <h3
                          id={`${idPrefix}-group-${group.key}`}
                          className="text-sm font-semibold text-foreground mb-2"
                        >
                          {groupTitle(group.key)}{" "}
                          <span className="font-normal text-muted-foreground">({group.items.length})</span>
                        </h3>
                        <div className="space-y-2">{group.items.map(renderFood)}</div>
                      </section>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="recipes" className="mt-4">
              <ScrollArea className="max-h-[50vh] pr-4 [&>[data-radix-scroll-area-viewport]]:max-h-[50vh]">
                {scoredRecipes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ChefHat className="h-12 w-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
                    <p>{t("planner.picker.noRecipes", { defaultValue: "No recipes found" })}</p>
                    <p className="text-sm">
                      {t("planner.picker.noRecipesHint", { defaultValue: "Create recipes to use complete meals" })}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scoredRecipes.map(({ recipe, missing, fit, recipeFoods }) => {
                      const blocked = Boolean(fit.allergen);
                      const reasonId = `${idPrefix}-recipe-${recipe.id}-reason`;
                      const ate = ateText(fit);
                      return (
                        <Button
                          key={recipe.id}
                          variant="outline"
                          className={cn(
                            "w-full justify-start h-auto min-h-11 p-3 sm:p-4",
                            blocked && "cursor-not-allowed opacity-70",
                          )}
                          aria-disabled={blocked || undefined}
                          aria-describedby={blocked ? reasonId : undefined}
                          onClick={() => {
                            if (blocked) return;
                            onSelectRecipe(recipe.id);
                            handleOpenChange(false);
                          }}
                        >
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-medium truncate">{recipe.name}</span>
                              {missing > 0 && (
                                <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
                                  <ShoppingCart className="h-3 w-3" aria-hidden="true" />
                                  {t("planner.picker.needToBuy", {
                                    defaultValue: "Need to buy ({{count}})",
                                    count: missing,
                                  })}
                                </Badge>
                              )}
                            </div>
                            {recipe.description && (
                              <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                                {recipe.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1">
                              {blocked && fit.allergen && (
                                <Badge id={reasonId} variant="destructive" className="gap-1">
                                  <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                                  {allergenText(fit.allergen)}
                                </Badge>
                              )}
                              {!blocked && fit.disliked && (
                                <Badge variant="outline" className="border-warning/40 text-warning font-normal text-xs">
                                  {t("planner.picker.recipeHasDislike", { defaultValue: "Has a disliked food" })}
                                </Badge>
                              )}
                              {recipeFoods.slice(0, 4).map((food) => (
                                <Badge key={food.id} variant="outline" className="text-xs">
                                  {food.name}
                                </Badge>
                              ))}
                              {recipeFoods.length > 4 && (
                                <Badge variant="outline" className="text-xs">
                                  {t("planner.picker.more", {
                                    defaultValue: "+{{count}} more",
                                    count: recipeFoods.length - 4,
                                  })}
                                </Badge>
                              )}
                              {ate && <span className="text-xs text-muted-foreground">{ate}</span>}
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

export const FoodSelectorDialog = memo(FoodSelectorDialogImpl);
