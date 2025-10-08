import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildWeekPlan, buildDayPlan } from "@/lib/mealPlanner";
import { Calendar, RefreshCw, Sparkles, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { MealSlot, PlanEntry } from "@/types";
import { SwapMealDialog } from "@/components/SwapMealDialog";
import { supabase } from "@/integrations/supabase/client";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
  { slot: "snack1", label: "Snack 1" },
  { slot: "snack2", label: "Snack 2" },
  { slot: "try_bite", label: "Try Bite" },
];

export default function Planner() {
  const { foods, kids, activeKidId, planEntries, setPlanEntries, updatePlanEntry, updateFood } = useApp();
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PlanEntry | null>(null);

  const activeKid = kids.find(k => k.id === activeKidId);

  const handleBuildWeek = () => {
    if (!activeKid) {
      toast.error("Please select a child first");
      return;
    }
    try {
      const newPlan = buildWeekPlan(activeKid.id, foods, planEntries);
      setPlanEntries(newPlan);
      toast.success(`Week plan generated for ${activeKid.name}!`, {
        description: "Meal plan ready with daily try bites",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to build plan");
    }
  };

  const handleMarkResult = async (entry: PlanEntry, result: "ate" | "tasted" | "refused") => {
    updatePlanEntry(entry.id, { result });
    
    // If marked as "ate", deduct from inventory
    if (result === "ate") {
      const food = foods.find(f => f.id === entry.food_id);
      if (food && (food.quantity ?? 0) > 0) {
        try {
          // Call the database function to deduct quantity
          const { error } = await supabase.rpc('deduct_food_quantity', {
            _food_id: entry.food_id,
            _amount: 1
          });

          if (error) throw error;

          // Update local state
          updateFood(entry.food_id, {
            ...food,
            quantity: Math.max(0, (food.quantity || 0) - 1)
          });

          if ((food.quantity || 0) <= 1) {
            toast.info(`${food.name} is now out of stock!`, {
              description: "Add it to your grocery list"
            });
          }
        } catch (error) {
          console.error('Error deducting quantity:', error);
          toast.error("Failed to update inventory");
        }
      }
    }
    
    toast.success(`Marked as ${result}`);
  };

  const handleSwapMeal = (entry: PlanEntry) => {
    setSelectedEntry(entry);
    setSwapDialogOpen(true);
  };

  const handleSwapConfirm = (newFoodId: string) => {
    if (!selectedEntry) return;
    
    updatePlanEntry(selectedEntry.id, { food_id: newFoodId });
    const newFood = foods.find(f => f.id === newFoodId);
    toast.success(`Swapped to ${newFood?.name}`);
  };

  const handleShuffleDay = (date: string) => {
    if (!activeKid) return;

    try {
      // Remove existing entries for this date
      const otherEntries = planEntries.filter(e => e.date !== date || e.kid_id !== activeKidId);
      
      // Generate new entries for this date
      const newDayPlan = buildDayPlan(activeKid.id, date, foods, planEntries);
      
      // Combine
      setPlanEntries([...otherEntries, ...newDayPlan]);
      
      const dayName = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
      toast.success(`${dayName} shuffled!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to shuffle day");
    }
  };

  // Group entries by date (filter by active kid)
  const planByDate: Record<string, PlanEntry[]> = {};
  planEntries
    .filter(entry => entry.kid_id === activeKidId)
    .forEach(entry => {
      if (!planByDate[entry.date]) {
        planByDate[entry.date] = [];
      }
      planByDate[entry.date].push(entry);
    });

  const dates = Object.keys(planByDate).sort();

  const getFood = (foodId: string) => foods.find(f => f.id === foodId);

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Weekly Meal Planner
              {activeKid && <span className="text-primary"> - {activeKid.name}</span>}
            </h1>
            <p className="text-muted-foreground">
              7-day meal rotation with daily try bites
            </p>
          </div>
          <Button onClick={handleBuildWeek} size="lg" className="shadow-lg" disabled={!activeKid}>
            <RefreshCw className="h-5 w-5 mr-2" />
            Build Week Plan
          </Button>
        </div>

        {planEntries.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Meal Plan Yet</h3>
              <p className="text-muted-foreground mb-6">
                Click "Build Week Plan" to generate a 7-day meal schedule with safe foods and daily try bites
              </p>
              <Button onClick={handleBuildWeek} size="lg">
                <Sparkles className="h-5 w-5 mr-2" />
                Generate My First Plan
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {dates.map((date, dayIndex) => {
              const dayEntries = planByDate[date];
              const dayName = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              });

              return (
                <Card key={date} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary">{dayIndex + 1}</span>
                      </div>
                      <h3 className="text-xl font-semibold">{dayName}</h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShuffleDay(date)}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Shuffle Day
                    </Button>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {MEAL_SLOTS.map(({ slot, label }) => {
                      const entry = dayEntries.find(e => e.meal_slot === slot);
                      const food = entry ? getFood(entry.food_id) : null;

                      return (
                        <div
                          key={slot}
                          className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-sm font-medium text-muted-foreground">{label}</p>
                            {slot === "try_bite" && (
                              <Sparkles className="h-4 w-4 text-try-bite" />
                            )}
                          </div>
                          
                          {food && (
                            <>
                              <div className="flex items-start justify-between mb-3">
                                <p className="font-semibold">{food.name}</p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => entry && handleSwapMeal(entry)}
                                  title="Swap this meal"
                                >
                                  <Shuffle className="h-4 w-4" />
                                </Button>
                              </div>

                              {food.allergens && food.allergens.length > 0 && (
                                <div className="mb-2">
                                  <Badge variant="secondary" className="text-xs">
                                    ⚠️ {food.allergens.join(", ")}
                                  </Badge>
                                </div>
                              )}
                              
                              {entry && (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant={entry.result === "ate" ? "default" : "outline"}
                                    onClick={() => handleMarkResult(entry, "ate")}
                                    className={entry.result === "ate" ? "bg-safe-food text-white" : ""}
                                  >
                                    Ate
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={entry.result === "tasted" ? "default" : "outline"}
                                    onClick={() => handleMarkResult(entry, "tasted")}
                                    className={entry.result === "tasted" ? "bg-secondary text-white" : ""}
                                  >
                                    Tasted
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={entry.result === "refused" ? "default" : "outline"}
                                    onClick={() => handleMarkResult(entry, "refused")}
                                    className={entry.result === "refused" ? "bg-destructive text-white" : ""}
                                  >
                                    Refused
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <SwapMealDialog
          open={swapDialogOpen}
          onOpenChange={setSwapDialogOpen}
          entry={selectedEntry}
          foods={foods}
          onSwap={handleSwapConfirm}
        />
      </div>
    </div>
  );
}
