import { useState, useCallback } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GSAPCalendarMealPlanner } from "@/components/GSAPCalendarMealPlanner";
import { FoodSelectorDialog } from "@/components/FoodSelectorDialog";
import { DetailedTrackingDialog } from "@/components/DetailedTrackingDialog";
import { MobileMealPlanner } from "@/components/meal-planner/MobileMealPlanner";
import { buildWeekPlan } from "@/lib/mealPlanner";
import {
  Calendar,
  Sparkles,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { MealSlot, PlanEntry } from "@/types";
import { SwapMealDialog } from "@/components/SwapMealDialog";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { format, startOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import { calculateAge } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { logger } from "@/lib/logger";

export default function Planner() {
  const {
    foods,
    kids,
    recipes,
    activeKidId,
    setActiveKid,
    planEntries,
    setPlanEntries,
    updatePlanEntry,
    addPlanEntry,
    updateFood,
    copyWeekPlan,
    deleteWeekPlan,
  } = useApp();

  const isMobile = useMediaQuery("(max-width: 1023px)");

  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PlanEntry | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [foodSelectorOpen, setFoodSelectorOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    slot: MealSlot;
    kidId: string;
  } | null>(null);
  const [detailedTrackingOpen, setDetailedTrackingOpen] = useState(false);
  const [trackingEntry, setTrackingEntry] = useState<PlanEntry | null>(null);

  const activeKid = kids.find((k) => k.id === activeKidId);

  // --- Shared handlers (used by both mobile and desktop) ---

  const checkStockIssues = () => {
    const outOfStock = foods.filter(
      (f) => f.is_safe && (f.quantity || 0) === 0
    );
    const lowStock = foods.filter(
      (f) => f.is_safe && (f.quantity || 0) > 0 && (f.quantity || 0) <= 2
    );

    if (outOfStock.length > 0 || lowStock.length > 0) {
      let message = "";
      if (outOfStock.length > 0) {
        message += `Out of stock: ${outOfStock
          .slice(0, 3)
          .map((f) => f.name)
          .join(", ")}${
          outOfStock.length > 3 ? ` and ${outOfStock.length - 3} more` : ""
        }. `;
      }
      if (lowStock.length > 0) {
        message += `Low stock: ${lowStock
          .slice(0, 3)
          .map((f) => `${f.name} (${f.quantity})`)
          .join(", ")}${
          lowStock.length > 3 ? ` and ${lowStock.length - 3} more` : ""
        }.`;
      }
      toast.warning("Stock Issues Detected", { description: message });
    }
  };

  const handleBuildWeek = () => {
    if (!activeKid) {
      toast.error("Please select a child first");
      return;
    }

    checkStockIssues();

    try {
      const newPlan = buildWeekPlan(activeKid.id, foods, planEntries);
      setPlanEntries(newPlan);
      toast.success(`Week plan generated for ${activeKid.name}!`, {
        description: "Meal plan ready with daily try bites",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to build plan"
      );
    }
  };

  const handleAIMealPlan = async (days: number = 7) => {
    if (!activeKid) {
      toast.error("Please select a child first");
      return;
    }

    setIsGeneratingPlan(true);
    try {
      const { data: aiSettings, error: aiError } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("is_active", true)
        .single();

      if (aiError || !aiSettings) {
        toast.error(
          "No active AI model configured. Please set one up in Admin settings."
        );
        setIsGeneratingPlan(false);
        return;
      }

      const { data, error } = await invokeEdgeFunction("ai-meal-plan", {
        body: {
          kid: activeKid,
          foods,
          recipes,
          planHistory: planEntries,
          aiModel: aiSettings,
          days,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const newEntries: PlanEntry[] = [];
      data.plan.forEach((day: any) => {
        Object.entries(day.meals).forEach(([slot, foodId]) => {
          if (foodId) {
            newEntries.push({
              id: `${activeKid.id}-${day.date}-${slot}`,
              kid_id: activeKid.id,
              date: day.date,
              meal_slot: slot as MealSlot,
              food_id: foodId as string,
              result: null,
            });
          }
        });
      });

      const dates = data.plan.map((d: any) => d.date);
      const filteredEntries = planEntries.filter(
        (e) => !dates.includes(e.date) || e.kid_id !== activeKidId
      );

      setPlanEntries([...filteredEntries, ...newEntries]);
      toast.success(`AI generated ${days}-day meal plan!`, {
        description: "Review and adjust as needed",
      });
    } catch (error) {
      logger.error("Error generating AI meal plan:", error);
      toast.error("Failed to generate AI meal plan. Please try again.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleUpdateEntry = useCallback((entryId: string, updates: Partial<PlanEntry>) => {
    updatePlanEntry(entryId, updates);
  }, [updatePlanEntry]);

  // Desktop handler (original signature)
  const handleAddEntry = useCallback((date: string, slot: MealSlot, foodId: string) => {
    if (!activeKid) return;
    addPlanEntry({
      kid_id: activeKid.id,
      date,
      meal_slot: slot,
      food_id: foodId,
      result: null,
    });
  }, [activeKid, addPlanEntry]);

  // Mobile handler (accepts kidId directly)
  const handleMobileAddEntry = useCallback(
    (kidId: string, date: string, slot: MealSlot, foodId: string) => {
      addPlanEntry({
        kid_id: kidId,
        date,
        meal_slot: slot,
        food_id: foodId,
        result: null,
      });
    },
    [addPlanEntry]
  );

  // Mobile recipe scheduling handler
  const handleMobileSelectRecipe = useCallback(
    async (recipeId: string, date: string, slot: MealSlot, kidId: string) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe || recipe.food_ids.length === 0) return;

      try {
        const { error } = await supabase.rpc("schedule_recipe_to_plan", {
          p_kid_id: kidId,
          p_recipe_id: recipe.id,
          p_date: date,
          p_meal_slot: slot,
        });

        if (error) throw error;

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: planData } = await supabase
            .from("plan_entries")
            .select("*")
            .order("date", { ascending: true });

          if (planData) {
            setPlanEntries(planData as any);
          }
        }

        toast.success(
          `${recipe.name} (${recipe.food_ids.length} items) added`
        );
      } catch (error) {
        logger.error("Error scheduling recipe:", error);
        toast.error("Failed to schedule recipe");
      }
    },
    [recipes, setPlanEntries]
  );

  const handlePreviousWeek = () => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  };

  const handleThisWeek = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
  };

  const handleCopyWeek = async (toDate: string) => {
    if (!activeKidId || !copyWeekPlan) return;

    try {
      const fromDate = format(currentWeekStart, "yyyy-MM-dd");
      await copyWeekPlan(fromDate, toDate, activeKidId);
      toast.success("Week plan copied successfully!");
      setCurrentWeekStart(addWeeks(currentWeekStart, 1));
    } catch (error) {
      logger.error("Error copying week:", error);
      toast.error("Failed to copy week plan");
    }
  };

  const handleClearWeek = async () => {
    if (!activeKidId || !deleteWeekPlan) return;

    try {
      const weekStart = format(currentWeekStart, "yyyy-MM-dd");
      await deleteWeekPlan(weekStart, activeKidId);
      toast.success("Week plan cleared");
    } catch (error) {
      logger.error("Error clearing week:", error);
      toast.error("Failed to clear week plan");
    }
  };

  const handleOpenFoodSelector = (
    date: string,
    slot: MealSlot,
    kidId?: string
  ) => {
    const targetKidId = kidId || activeKidId;
    if (!targetKidId) {
      toast.error("Please select a child first");
      return;
    }
    setSelectedSlot({ date, slot, kidId: targetKidId });
    setFoodSelectorOpen(true);
  };

  const handleSelectFood = (foodId: string) => {
    if (!selectedSlot) return;

    const targetKid = kids.find((k) => k.id === selectedSlot.kidId);
    if (!targetKid) {
      toast.error("Could not find the selected child");
      return;
    }

    addPlanEntry({
      kid_id: selectedSlot.kidId,
      date: selectedSlot.date,
      meal_slot: selectedSlot.slot,
      food_id: foodId,
      result: null,
    });
    toast.success("Meal added to calendar");
  };

  const handleSelectRecipe = async (recipeId: string) => {
    if (!selectedSlot) return;

    const targetKid = kids.find((k) => k.id === selectedSlot.kidId);
    if (!targetKid) {
      toast.error("Could not find the selected child");
      return;
    }

    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe || recipe.food_ids.length === 0) return;

    try {
      const { error } = await supabase.rpc("schedule_recipe_to_plan", {
        p_kid_id: selectedSlot.kidId,
        p_recipe_id: recipe.id,
        p_date: selectedSlot.date,
        p_meal_slot: selectedSlot.slot,
      });

      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: planData } = await supabase
          .from("plan_entries")
          .select("*")
          .order("date", { ascending: true });

        if (planData) {
          setPlanEntries(planData as any);
        }
      }

      toast.success(
        `${recipe.name} (${recipe.food_ids.length} items) added to calendar`
      );
    } catch (error) {
      logger.error("Error scheduling recipe:", error);
      toast.error("Failed to schedule recipe");
    }
  };

  const handleMarkResult = useCallback(async (
    entry: PlanEntry,
    result: "ate" | "tasted" | "refused",
    attemptId?: string
  ) => {
    const updates: Partial<PlanEntry> = { result };
    if (attemptId) {
      updates.food_attempt_id = attemptId;
    }

    updatePlanEntry(entry.id, updates);

    if (result === "ate") {
      const food = foods.find((f) => f.id === entry.food_id);
      if (food && (food.quantity ?? 0) > 0) {
        try {
          const { error } = await supabase.rpc("deduct_food_quantity", {
            _food_id: entry.food_id,
            _amount: 1,
          });

          if (error) throw error;

          updateFood(entry.food_id, {
            ...food,
            quantity: Math.max(0, (food.quantity || 0) - 1),
          });

          if ((food.quantity || 0) <= 1) {
            toast.info(`${food.name} is now out of stock!`, {
              description: "Add it to your grocery list",
            });
          }
        } catch (error) {
          logger.error("Error deducting quantity:", error);
          toast.error("Failed to update inventory");
        }
      }
    }

    if (!attemptId) {
      toast.success(`Marked as ${result}`);
    }
  }, [foods, updatePlanEntry, updateFood]);

  const handleCopyToChild = async (
    entry: PlanEntry,
    targetKidId: string
  ) => {
    if (entry.recipe_id) {
      const recipeEntries = planEntries.filter(
        (e) =>
          e.recipe_id === entry.recipe_id &&
          e.date === entry.date &&
          e.meal_slot === entry.meal_slot &&
          e.kid_id === entry.kid_id
      );

      for (const recipeEntry of recipeEntries) {
        await addPlanEntry({
          kid_id: targetKidId,
          date: recipeEntry.date,
          meal_slot: recipeEntry.meal_slot,
          food_id: recipeEntry.food_id,
          recipe_id: recipeEntry.recipe_id,
          is_primary_dish: recipeEntry.is_primary_dish,
        } as any);
      }

      const targetKid = kids.find((k) => k.id === targetKidId);
      toast.success(`Recipe copied to ${targetKid?.name}'s plan`);
    } else {
      await addPlanEntry({
        kid_id: targetKidId,
        date: entry.date,
        meal_slot: entry.meal_slot,
        food_id: entry.food_id,
      } as any);

      const targetKid = kids.find((k) => k.id === targetKidId);
      toast.success(`Meal copied to ${targetKid?.name}'s plan`);
    }
  };

  const handleSwapConfirm = (newFoodId: string) => {
    if (!selectedEntry) return;
    updatePlanEntry(selectedEntry.id, { food_id: newFoodId });
    const newFood = foods.find((f) => f.id === newFoodId);
    toast.success(`Swapped to ${newFood?.name}`);
  };

  // --- No children empty state ---
  if (kids.length === 0) {
    return (
      <div className="min-h-screen pb-20 bg-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Children Added</h3>
              <p className="text-muted-foreground mb-6">
                Please add a child to start planning meals
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // --- Mobile layout ---
  if (isMobile) {
    return (
      <div className="min-h-screen pb-20 bg-background">
        <div className="px-3 pt-4 pb-2">
          {/* Compact mobile header */}
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-bold text-foreground">
              Meal Planner
            </h1>
            {activeKid && (
              <span className="text-sm font-medium text-primary">
                {activeKid.name}
              </span>
            )}
          </div>

          <MobileMealPlanner
            weekStart={currentWeekStart}
            planEntries={planEntries}
            foods={foods}
            recipes={recipes}
            kids={kids}
            activeKidId={activeKidId}
            isGeneratingPlan={isGeneratingPlan}
            onAddEntry={handleMobileAddEntry}
            onUpdateEntry={handleUpdateEntry}
            onSelectRecipe={handleMobileSelectRecipe}
            onMarkResult={handleMarkResult}
            onBuildWeek={handleBuildWeek}
            onAIGenerate={() => handleAIMealPlan(7)}
            onPreviousWeek={handlePreviousWeek}
            onNextWeek={handleNextWeek}
            onThisWeek={handleThisWeek}
            onCopyWeek={handleCopyWeek}
            onClearWeek={handleClearWeek}
          />
        </div>
      </div>
    );
  }

  // --- Desktop layout (existing) ---
  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                Weekly Meal Planner
                {activeKid && (
                  <span className="text-primary"> - {activeKid.name}</span>
                )}
              </h1>
              <p className="text-muted-foreground">
                Plan meals for your family's week
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => handleAIMealPlan(7)}
                size="lg"
                className="shadow-lg"
                disabled={!activeKid || isGeneratingPlan}
              >
                {isGeneratingPlan ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    AI Generate Week
                  </>
                )}
              </Button>
              <Button
                onClick={handleBuildWeek}
                variant="outline"
                size="lg"
                disabled={!activeKid}
              >
                <RefreshCw className="h-5 w-5 mr-2" />
                Quick Build
              </Button>
            </div>
          </div>

          {/* Week Navigation */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePreviousWeek}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-center min-w-[200px]">
                  <div className="font-semibold">
                    Week of {format(currentWeekStart, "MMM d, yyyy")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(currentWeekStart, "MMM d")} -{" "}
                    {format(addWeeks(currentWeekStart, 1), "MMM d")}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNextWeek}
                  aria-label="Next week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={handleThisWeek}
                className="min-h-[44px]"
              >
                <Calendar className="h-4 w-4 mr-2" />
                This Week
              </Button>
            </div>
          </Card>
        </div>

        {activeKidId === null ? (
          // Family Mode - Show all children
          <div className="space-y-6">
            {kids.map((kid) => {
              const kidAge = calculateAge(kid.date_of_birth);
              return (
                <div key={kid.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">{kid.name}'s Plan</h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveKid(kid.id)}
                    >
                      View Details
                    </Button>
                  </div>
                  <GSAPCalendarMealPlanner
                    weekStart={currentWeekStart}
                    planEntries={planEntries}
                    foods={foods}
                    recipes={recipes}
                    kids={kids}
                    kidId={kid.id}
                    kidName={kid.name}
                    kidAge={kidAge !== null ? kidAge : undefined}
                    kidWeight={
                      kid.weight_kg ? Number(kid.weight_kg) : undefined
                    }
                    onUpdateEntry={handleUpdateEntry}
                    onAddEntry={handleAddEntry}
                    onOpenFoodSelector={handleOpenFoodSelector}
                    onCopyToChild={handleCopyToChild}
                    onCopyWeek={handleCopyWeek}
                    onClearWeek={handleClearWeek}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          // Single child mode
          <GSAPCalendarMealPlanner
            weekStart={currentWeekStart}
            planEntries={planEntries}
            foods={foods}
            recipes={recipes}
            kids={kids}
            kidId={activeKidId}
            kidName={activeKid!.name}
            kidAge={activeKid!.age}
            kidWeight={
              activeKid!.weight_kg ? Number(activeKid!.weight_kg) : undefined
            }
            onUpdateEntry={handleUpdateEntry}
            onAddEntry={handleAddEntry}
            onOpenFoodSelector={handleOpenFoodSelector}
            onCopyToChild={handleCopyToChild}
            onCopyWeek={handleCopyWeek}
            onClearWeek={handleClearWeek}
          />
        )}

        <FoodSelectorDialog
          open={foodSelectorOpen}
          onOpenChange={setFoodSelectorOpen}
          foods={foods}
          recipes={recipes}
          slot={selectedSlot?.slot || null}
          date={selectedSlot?.date || null}
          onSelectFood={handleSelectFood}
          onSelectRecipe={handleSelectRecipe}
        />

        <SwapMealDialog
          open={swapDialogOpen}
          onOpenChange={setSwapDialogOpen}
          entry={selectedEntry}
          foods={foods}
          onSwap={handleSwapConfirm}
        />

        {trackingEntry && (
          <DetailedTrackingDialog
            open={detailedTrackingOpen}
            onOpenChange={setDetailedTrackingOpen}
            entry={trackingEntry}
            food={foods.find((f) => f.id === trackingEntry.food_id)!}
            kidId={activeKidId!}
            onComplete={(result, attemptId) => {
              if (trackingEntry) {
                handleMarkResult(trackingEntry, result, attemptId);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
