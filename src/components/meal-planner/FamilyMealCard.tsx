import { useMemo, memo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Food, Kid, MealSlot, PlanEntry, Recipe } from "@/types";
import {
  Plus,
  Sparkles,
  ArrowRightLeft,
  AlertTriangle,
  Check,
  Users,
} from "lucide-react";

interface FamilyMealCardProps {
  slot: MealSlot;
  label: string;
  date: string;
  entries: PlanEntry[];
  kids: Kid[];
  foods: Food[];
  recipes: Recipe[];
  singleKidMode: boolean;
  activeKidId: string | null;
  onTapAdd: (date: string, slot: MealSlot, kidId?: string) => void;
  onTapChangeFamilyMeal: (date: string, slot: MealSlot) => void;
  onTapKidSubstitute: (date: string, slot: MealSlot, kidId: string) => void;
  onMarkResult: (entry: PlanEntry, result: "ate" | "tasted" | "refused") => void;
}

const SLOT_CONFIG: Record<MealSlot, { icon: string; accent: string; bg: string }> = {
  breakfast: {
    icon: "sunrise",
    accent: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50",
  },
  lunch: {
    icon: "sun",
    accent: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/50",
  },
  dinner: {
    icon: "moon",
    accent: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50",
  },
  snack1: {
    icon: "cookie",
    accent: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/50",
  },
  snack2: {
    icon: "apple",
    accent: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800/50",
  },
  try_bite: {
    icon: "sparkles",
    accent: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50",
  },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const FamilyMealCard = memo(function FamilyMealCard({
  slot,
  label,
  date,
  entries,
  kids,
  foods,
  recipes,
  singleKidMode,
  activeKidId,
  onTapAdd,
  onTapChangeFamilyMeal,
  onTapKidSubstitute,
  onMarkResult,
}: FamilyMealCardProps) {
  const config = SLOT_CONFIG[slot];

  const getFood = (foodId: string) => foods.find((f) => f.id === foodId);
  const getRecipe = (recipeId: string) => recipes.find((r) => r.id === recipeId);

  // Determine "family meal" (most common food) and per-kid overrides
  const { familyMeal, kidMeals } = useMemo(() => {
    if (entries.length === 0) {
      return { familyMeal: null, kidMeals: new Map<string, { entry: PlanEntry; food: Food | undefined; recipe: Recipe | undefined }>() };
    }

    // Group entries by kid, deduplicating recipe entries
    const kidEntryMap = new Map<string, PlanEntry>();
    const seenRecipeKeys = new Set<string>();

    entries.forEach((entry) => {
      if (entry.recipe_id) {
        const key = `${entry.kid_id}-${entry.recipe_id}`;
        if (seenRecipeKeys.has(key)) return;
        seenRecipeKeys.add(key);
      }
      // Keep the primary dish for recipes, or any entry for single foods
      if (!kidEntryMap.has(entry.kid_id) || entry.is_primary_dish) {
        kidEntryMap.set(entry.kid_id, entry);
      }
    });

    // Count food occurrences to find the "family meal"
    const foodCounts = new Map<string, number>();
    kidEntryMap.forEach((entry) => {
      const key = entry.recipe_id || entry.food_id;
      foodCounts.set(key, (foodCounts.get(key) || 0) + 1);
    });

    // Family meal = most common food/recipe
    let familyFoodKey = "";
    let maxCount = 0;
    foodCounts.forEach((count, key) => {
      if (count > maxCount) {
        maxCount = count;
        familyFoodKey = key;
      }
    });

    // Find a representative entry for the family meal
    let familyEntry: PlanEntry | null = null;
    kidEntryMap.forEach((entry) => {
      const key = entry.recipe_id || entry.food_id;
      if (key === familyFoodKey && !familyEntry) {
        familyEntry = entry;
      }
    });

    const familyFood = familyEntry ? getFood(familyEntry.food_id) : null;
    const familyRecipe = familyEntry?.recipe_id ? getRecipe(familyEntry.recipe_id) : null;

    // Build per-kid meal data
    const kidMeals = new Map<string, { entry: PlanEntry; food: Food | undefined; recipe: Recipe | undefined }>();
    kidEntryMap.forEach((entry, kidId) => {
      kidMeals.set(kidId, {
        entry,
        food: getFood(entry.food_id),
        recipe: entry.recipe_id ? getRecipe(entry.recipe_id) : undefined,
      });
    });

    return {
      familyMeal: familyEntry
        ? {
            entry: familyEntry,
            food: familyFood,
            recipe: familyRecipe,
            foodKey: familyFoodKey,
          }
        : null,
      kidMeals,
    };
  }, [entries, foods, recipes]);

  const isEmpty = entries.length === 0;
  const isTryBite = slot === "try_bite";

  // Single kid mode - simpler card
  if (singleKidMode && activeKidId) {
    const kidMeal = kidMeals.get(activeKidId);
    const food = kidMeal?.food;
    const recipe = kidMeal?.recipe;
    const mealName = recipe?.name || food?.name;
    const entry = kidMeal?.entry;
    const isOutOfStock = food && (food.quantity || 0) === 0;

    return (
      <div className={cn("rounded-2xl border-2 p-4 transition-all", config.bg)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={cn("font-semibold text-sm", config.accent)}>{label}</span>
            {isTryBite && <Sparkles className={cn("h-4 w-4", config.accent)} />}
          </div>
          {entry && (
            <button
              onClick={() => onTapChangeFamilyMeal(date, slot)}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all"
              aria-label={`Change ${label}`}
            >
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {isEmpty ? (
          <button
            onClick={() => onTapAdd(date, slot, activeKidId)}
            className="w-full py-6 rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
          >
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", "bg-primary/10")}>
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Add meal</span>
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => onTapChangeFamilyMeal(date, slot)}
              className="w-full text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base text-foreground leading-snug">
                    {mealName || "Unknown food"}
                  </p>
                  {recipe && (
                    <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">
                      Recipe
                    </Badge>
                  )}
                </div>
                {isOutOfStock && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    Out
                  </Badge>
                )}
              </div>
            </button>

            {/* Result tracking buttons */}
            {entry && (
              <div className="flex gap-1.5">
                {(["ate", "tasted", "refused"] as const).map((result) => (
                  <button
                    key={result}
                    onClick={() => onMarkResult(entry, result)}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition-all active:scale-95",
                      "border",
                      entry.result === result
                        ? result === "ate"
                          ? "bg-green-500 text-white border-green-500"
                          : result === "tasted"
                            ? "bg-amber-500 text-white border-amber-500"
                            : "bg-red-500 text-white border-red-500"
                        : "bg-background/80 text-muted-foreground border-border hover:border-primary/30",
                    )}
                  >
                    {result === "ate" ? "Ate" : result === "tasted" ? "Tasted" : "Refused"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Family mode - show family meal with per-kid overrides
  const relevantKids = kids.length > 0 ? kids : [];

  return (
    <div className={cn("rounded-2xl border-2 p-4 transition-all", config.bg)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("font-semibold text-sm", config.accent)}>{label}</span>
          {isTryBite && <Sparkles className={cn("h-4 w-4", config.accent)} />}
        </div>
        {familyMeal && (
          <button
            onClick={() => onTapChangeFamilyMeal(date, slot)}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all"
            aria-label={`Change family ${label}`}
          >
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {isEmpty ? (
        <button
          onClick={() => onTapAdd(date, slot)}
          className="w-full py-6 rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {relevantKids.length > 1 ? "Add family meal" : "Add meal"}
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          {/* Family meal name - tap to change for all */}
          <button
            onClick={() => onTapChangeFamilyMeal(date, slot)}
            className="w-full text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2">
              {relevantKids.length > 1 && (
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <p className="font-bold text-base text-foreground leading-snug">
                {familyMeal?.recipe?.name || familyMeal?.food?.name || "Unknown meal"}
              </p>
            </div>
          </button>

          {/* Per-kid row - shows who's eating what */}
          {relevantKids.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {relevantKids.map((kid) => {
                const kidMeal = kidMeals.get(kid.id);
                const isEatingFamily = kidMeal
                  ? (kidMeal.entry.recipe_id || kidMeal.entry.food_id) === familyMeal?.foodKey
                  : false;
                const hasSubstitute = kidMeal && !isEatingFamily;
                const noMeal = !kidMeal;
                const substituteName = hasSubstitute
                  ? kidMeal?.recipe?.name || kidMeal?.food?.name
                  : null;

                return (
                  <button
                    key={kid.id}
                    onClick={() => onTapKidSubstitute(date, slot, kid.id)}
                    className={cn(
                      "flex items-center gap-1.5 py-1.5 pl-1.5 pr-3 rounded-full transition-all active:scale-95",
                      "border",
                      isEatingFamily
                        ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                        : hasSubstitute
                          ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                          : "bg-muted/30 border-muted-foreground/20",
                    )}
                    aria-label={
                      isEatingFamily
                        ? `${kid.name} eating family meal`
                        : hasSubstitute
                          ? `${kid.name} eating ${substituteName}`
                          : `Add meal for ${kid.name}`
                    }
                  >
                    <Avatar className="h-6 w-6">
                      {kid.profile_picture_url && (
                        <AvatarImage src={kid.profile_picture_url} alt={kid.name} />
                      )}
                      <AvatarFallback className="text-[10px] font-bold bg-primary/20 text-primary">
                        {getInitials(kid.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start">
                      <span className="text-[11px] font-semibold leading-tight">
                        {kid.name}
                      </span>
                      {isEatingFamily && (
                        <span className="text-[9px] text-green-600 dark:text-green-400 flex items-center gap-0.5">
                          <Check className="h-2.5 w-2.5" />
                          Family meal
                        </span>
                      )}
                      {hasSubstitute && (
                        <span className="text-[9px] text-amber-600 dark:text-amber-400 truncate max-w-[80px]">
                          {substituteName}
                        </span>
                      )}
                      {noMeal && (
                        <span className="text-[9px] text-muted-foreground">
                          <Plus className="h-2.5 w-2.5 inline" /> Add
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Result tracking for family meal - shown in single-kid or when all eating same */}
          {familyMeal?.entry && relevantKids.length <= 1 && (
            <div className="flex gap-1.5">
              {(["ate", "tasted", "refused"] as const).map((result) => (
                <button
                  key={result}
                  onClick={() => onMarkResult(familyMeal.entry, result)}
                  className={cn(
                    "flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition-all active:scale-95",
                    "border",
                    familyMeal.entry.result === result
                      ? result === "ate"
                        ? "bg-green-500 text-white border-green-500"
                        : result === "tasted"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-red-500 text-white border-red-500"
                      : "bg-background/80 text-muted-foreground border-border hover:border-primary/30",
                  )}
                >
                  {result === "ate" ? "Ate" : result === "tasted" ? "Tasted" : "Refused"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
