import { useState, useCallback, useMemo, memo } from "react";
import { format, addDays, addWeeks, subWeeks } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Food, Kid, MealSlot, PlanEntry, Recipe } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Loader2,
  MoreHorizontal,
  Copy,
  Trash2,
  Save,
  BookTemplate,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { WeekStrip } from "./WeekStrip";
import { FamilyMealCard } from "./FamilyMealCard";
import {
  MealQuickAddDrawer,
  MealQuickAddContext,
} from "./MealQuickAddDrawer";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
  { slot: "snack1", label: "Snack 1" },
  { slot: "snack2", label: "Snack 2" },
  { slot: "try_bite", label: "Try Bite" },
];

interface MobileMealPlannerProps {
  weekStart: Date;
  planEntries: PlanEntry[];
  foods: Food[];
  recipes: Recipe[];
  kids: Kid[];
  activeKidId: string | null;
  isGeneratingPlan: boolean;
  onAddEntry: (kidId: string, date: string, slot: MealSlot, foodId: string) => void;
  onUpdateEntry: (entryId: string, updates: Partial<PlanEntry>) => void;
  onSelectRecipe: (recipeId: string, date: string, slot: MealSlot, kidId: string) => void;
  onMarkResult: (entry: PlanEntry, result: "ate" | "tasted" | "refused") => void;
  onBuildWeek: () => void;
  onAIGenerate: () => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onCopyWeek?: (toDate: string) => void;
  onClearWeek?: () => void;
  onOpenTemplateGallery?: () => void;
  onSaveTemplate?: () => void;
}

export const MobileMealPlanner = memo(function MobileMealPlanner({
  weekStart,
  planEntries,
  foods,
  recipes,
  kids,
  activeKidId,
  isGeneratingPlan,
  onAddEntry,
  onUpdateEntry,
  onSelectRecipe,
  onMarkResult,
  onBuildWeek,
  onAIGenerate,
  onPreviousWeek,
  onNextWeek,
  onThisWeek,
  onCopyWeek,
  onClearWeek,
  onOpenTemplateGallery,
  onSaveTemplate,
}: MobileMealPlannerProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    // Default to today if it's within this week, otherwise Monday
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      if (format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")) {
        return i;
      }
    }
    return 0;
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerContext, setDrawerContext] = useState<MealQuickAddContext | null>(null);

  const singleKidMode = activeKidId !== null;
  const selectedDate = format(addDays(weekStart, selectedDayIndex), "yyyy-MM-dd");

  // Swipe between days
  const swipeRef = useSwipeGesture({
    onSwipeLeft: () => {
      if (selectedDayIndex < 6) {
        setSelectedDayIndex(selectedDayIndex + 1);
      } else {
        // Go to next week, start on first day
        onNextWeek();
        setSelectedDayIndex(0);
      }
    },
    onSwipeRight: () => {
      if (selectedDayIndex > 0) {
        setSelectedDayIndex(selectedDayIndex - 1);
      } else {
        // Go to previous week, start on last day
        onPreviousWeek();
        setSelectedDayIndex(6);
      }
    },
    threshold: 60,
    preventDefaultTouchmoveEvent: true,
  });

  // Get entries for a specific slot on the selected date
  const getSlotEntries = useCallback(
    (slot: MealSlot) => {
      if (singleKidMode) {
        return planEntries.filter(
          (e) =>
            e.date === selectedDate &&
            e.meal_slot === slot &&
            e.kid_id === activeKidId,
        );
      }
      // Family mode - get entries for all kids
      return planEntries.filter(
        (e) => e.date === selectedDate && e.meal_slot === slot,
      );
    },
    [planEntries, selectedDate, singleKidMode, activeKidId],
  );

  // Determine the "family meal" food_id for a given slot
  const getFamilyFoodId = useCallback(
    (slot: MealSlot): string | undefined => {
      const entries = getSlotEntries(slot);
      if (entries.length === 0) return undefined;

      const counts = new Map<string, number>();
      const seen = new Set<string>();
      entries.forEach((e) => {
        const key = `${e.kid_id}-${e.recipe_id || e.food_id}`;
        if (seen.has(key)) return;
        seen.add(key);
        const foodKey = e.recipe_id || e.food_id;
        counts.set(foodKey, (counts.get(foodKey) || 0) + 1);
      });

      let maxKey = "";
      let maxCount = 0;
      counts.forEach((count, key) => {
        if (count > maxCount) {
          maxCount = count;
          maxKey = key;
        }
      });

      // Return the food_id (not recipe_id) for the family meal
      const familyEntry = entries.find(
        (e) => (e.recipe_id || e.food_id) === maxKey,
      );
      return familyEntry?.food_id;
    },
    [getSlotEntries],
  );

  // --- Drawer handlers ---

  const handleTapAdd = useCallback(
    (date: string, slot: MealSlot, kidId?: string) => {
      setDrawerContext({
        date,
        slot,
        kidId: kidId || (singleKidMode ? activeKidId! : undefined),
        mode: "add",
      });
      setDrawerOpen(true);
    },
    [singleKidMode, activeKidId],
  );

  const handleTapChangeFamilyMeal = useCallback(
    (date: string, slot: MealSlot) => {
      setDrawerContext({
        date,
        slot,
        mode: "change",
        // No kidId = update for everyone (or the active kid in single mode)
        kidId: singleKidMode ? activeKidId! : undefined,
      });
      setDrawerOpen(true);
    },
    [singleKidMode, activeKidId],
  );

  const handleTapKidSubstitute = useCallback(
    (date: string, slot: MealSlot, kidId: string) => {
      const familyFoodId = getFamilyFoodId(slot);
      setDrawerContext({
        date,
        slot,
        kidId,
        familyFoodId,
        mode: "substitute",
      });
      setDrawerOpen(true);
    },
    [getFamilyFoodId],
  );

  // When a food is selected in the drawer
  const handleDrawerSelectFood = useCallback(
    (foodId: string, context: MealQuickAddContext) => {
      if (context.mode === "change" && !context.kidId) {
        // Family meal change: update all kids who were eating the old family meal
        const oldFamilyFoodId = getFamilyFoodId(context.slot);
        const existingEntries = planEntries.filter(
          (e) => e.date === context.date && e.meal_slot === context.slot,
        );

        // Update entries that match the old family food
        existingEntries.forEach((entry) => {
          if (
            !oldFamilyFoodId ||
            entry.food_id === oldFamilyFoodId
          ) {
            onUpdateEntry(entry.id, { food_id: foodId, recipe_id: undefined });
          }
        });

        // If no entries exist, add for all kids
        if (existingEntries.length === 0) {
          kids.forEach((kid) => {
            onAddEntry(kid.id, context.date, context.slot, foodId);
          });
        }
      } else if (context.kidId) {
        // Single kid add/change/substitute
        const existing = planEntries.find(
          (e) =>
            e.date === context.date &&
            e.meal_slot === context.slot &&
            e.kid_id === context.kidId,
        );

        if (existing) {
          onUpdateEntry(existing.id, { food_id: foodId, recipe_id: undefined });
        } else {
          onAddEntry(context.kidId, context.date, context.slot, foodId);
        }
      } else {
        // Add for all kids (new meal, family mode)
        kids.forEach((kid) => {
          const existing = planEntries.find(
            (e) =>
              e.date === context.date &&
              e.meal_slot === context.slot &&
              e.kid_id === kid.id,
          );
          if (existing) {
            onUpdateEntry(existing.id, { food_id: foodId, recipe_id: undefined });
          } else {
            onAddEntry(kid.id, context.date, context.slot, foodId);
          }
        });
      }
    },
    [planEntries, kids, onAddEntry, onUpdateEntry, getFamilyFoodId],
  );

  // When a recipe is selected in the drawer
  const handleDrawerSelectRecipe = useCallback(
    (recipeId: string, context: MealQuickAddContext) => {
      if (context.kidId) {
        onSelectRecipe(recipeId, context.date, context.slot, context.kidId);
      } else {
        // Add recipe for all kids
        kids.forEach((kid) => {
          onSelectRecipe(recipeId, context.date, context.slot, kid.id);
        });
      }
    },
    [kids, onSelectRecipe],
  );

  // "Eat with family" - reset a kid's substitute to the family meal
  const handleEatWithFamily = useCallback(
    (context: MealQuickAddContext) => {
      if (!context.kidId || !context.familyFoodId) return;
      const existing = planEntries.find(
        (e) =>
          e.date === context.date &&
          e.meal_slot === context.slot &&
          e.kid_id === context.kidId,
      );
      if (existing) {
        onUpdateEntry(existing.id, {
          food_id: context.familyFoodId,
          recipe_id: undefined,
        });
      } else {
        onAddEntry(context.kidId, context.date, context.slot, context.familyFoodId);
      }
    },
    [planEntries, onAddEntry, onUpdateEntry],
  );

  const selectedDayLabel = useMemo(() => {
    const date = addDays(weekStart, selectedDayIndex);
    return format(date, "EEEE, MMM d");
  }, [weekStart, selectedDayIndex]);

  return (
    <div className="space-y-4">
      {/* Week header with navigation */}
      <div className="flex items-center justify-between px-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            onPreviousWeek();
            setSelectedDayIndex(0);
          }}
          className="h-9 w-9"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <button
          onClick={onThisWeek}
          className="text-center active:scale-95 transition-transform"
        >
          <p className="text-sm font-bold text-foreground">
            {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d")}
          </p>
          <p className="text-xs text-muted-foreground">
            Tap for this week
          </p>
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            onNextWeek();
            setSelectedDayIndex(0);
          }}
          className="h-9 w-9"
          aria-label="Next week"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Week day strip */}
      <WeekStrip
        weekStart={weekStart}
        selectedDayIndex={selectedDayIndex}
        onSelectDay={setSelectedDayIndex}
        planEntries={planEntries}
        kids={kids}
      />

      {/* Action buttons */}
      <div className="flex gap-2 px-1">
        <Button
          onClick={onAIGenerate}
          size="sm"
          className="flex-1 shadow-md"
          disabled={isGeneratingPlan}
        >
          {isGeneratingPlan ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              AI Plan
            </>
          )}
        </Button>
        <Button
          onClick={onBuildWeek}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Quick Build
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onOpenTemplateGallery && (
              <DropdownMenuItem onClick={onOpenTemplateGallery}>
                <BookTemplate className="h-4 w-4 mr-2" />
                Use Template
              </DropdownMenuItem>
            )}
            {onSaveTemplate && (
              <DropdownMenuItem onClick={onSaveTemplate}>
                <Save className="h-4 w-4 mr-2" />
                Save as Template
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {onCopyWeek && (
              <DropdownMenuItem
                onClick={() =>
                  onCopyWeek(format(addWeeks(weekStart, 1), "yyyy-MM-dd"))
                }
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy to Next Week
              </DropdownMenuItem>
            )}
            {onClearWeek && (
              <DropdownMenuItem onClick={onClearWeek} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Week
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Selected day label */}
      <div className="px-1">
        <h2 className="text-lg font-bold text-foreground">{selectedDayLabel}</h2>
      </div>

      {/* Meal cards - swipeable area */}
      <div ref={swipeRef} className="space-y-3 px-1 pb-24">
        {MEAL_SLOTS.map(({ slot, label }) => {
          const entries = getSlotEntries(slot);
          return (
            <FamilyMealCard
              key={slot}
              slot={slot}
              label={label}
              date={selectedDate}
              entries={entries}
              kids={kids}
              foods={foods}
              recipes={recipes}
              singleKidMode={singleKidMode}
              activeKidId={activeKidId}
              onTapAdd={handleTapAdd}
              onTapChangeFamilyMeal={handleTapChangeFamilyMeal}
              onTapKidSubstitute={handleTapKidSubstitute}
              onMarkResult={onMarkResult}
            />
          );
        })}
      </div>

      {/* Quick-add drawer */}
      <MealQuickAddDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        context={drawerContext}
        foods={foods}
        recipes={recipes}
        kids={kids}
        onSelectFood={handleDrawerSelectFood}
        onSelectRecipe={handleDrawerSelectRecipe}
        onEatWithFamily={handleEatWithFamily}
      />
    </div>
  );
});
