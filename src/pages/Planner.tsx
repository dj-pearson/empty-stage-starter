import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarMealPlanner } from "@/components/CalendarMealPlanner";
import { FoodSelectorDialog } from "@/components/FoodSelectorDialog";
import { DetailedTrackingDialog } from "@/components/DetailedTrackingDialog";
import { buildWeekPlan, buildDayPlan } from "@/lib/mealPlanner";
import { Calendar, RefreshCw, Sparkles, Shuffle, AlertTriangle, Package, ChevronLeft, ChevronRight, Loader2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { MealSlot, PlanEntry } from "@/types";
import { SwapMealDialog } from "@/components/SwapMealDialog";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
  { slot: "snack1", label: "Snack 1" },
  { slot: "snack2", label: "Snack 2" },
  { slot: "try_bite", label: "Try Bite" },
];

export default function Planner() {
  const { foods, kids, recipes, activeKidId, planEntries, setPlanEntries, updatePlanEntry, addPlanEntry, updateFood } = useApp();
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PlanEntry | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [foodSelectorOpen, setFoodSelectorOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [detailedTrackingOpen, setDetailedTrackingOpen] = useState(false);
  const [trackingEntry, setTrackingEntry] = useState<PlanEntry | null>(null);

  const activeKid = kids.find(k => k.id === activeKidId);

  const checkStockIssues = () => {
    const outOfStock = foods.filter(f => f.is_safe && (f.quantity || 0) === 0);
    const lowStock = foods.filter(f => f.is_safe && (f.quantity || 0) > 0 && (f.quantity || 0) <= 2);
    
    if (outOfStock.length > 0 || lowStock.length > 0) {
      let message = "";
      if (outOfStock.length > 0) {
        message += `Out of stock: ${outOfStock.slice(0, 3).map(f => f.name).join(', ')}${outOfStock.length > 3 ? ` and ${outOfStock.length - 3} more` : ''}. `;
      }
      if (lowStock.length > 0) {
        message += `Low stock: ${lowStock.slice(0, 3).map(f => `${f.name} (${f.quantity})`).join(', ')}${lowStock.length > 3 ? ` and ${lowStock.length - 3} more` : ''}.`;
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
      toast.error(error instanceof Error ? error.message : "Failed to build plan");
    }
  };

  const handleAIMealPlan = async (days: number = 7) => {
    if (!activeKid) {
      toast.error("Please select a child first");
      return;
    }

    setIsGeneratingPlan(true);
    try {
      // Get active AI model
      const { data: aiSettings, error: aiError } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('is_active', true)
        .single();

      if (aiError || !aiSettings) {
        toast.error("No active AI model configured. Please set one up in Admin settings.");
        setIsGeneratingPlan(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('ai-meal-plan', {
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

      // Convert AI plan to plan entries
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

      // Remove existing entries for this date range and kid
      const dates = data.plan.map((d: any) => d.date);
      const filteredEntries = planEntries.filter(
        e => !dates.includes(e.date) || e.kid_id !== activeKidId
      );

      setPlanEntries([...filteredEntries, ...newEntries]);
      toast.success(`AI generated ${days}-day meal plan!`, {
        description: "Review and adjust as needed",
      });
    } catch (error) {
      console.error('Error generating AI meal plan:', error);
      toast.error("Failed to generate AI meal plan. Please try again.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleUpdateEntry = (entryId: string, updates: Partial<PlanEntry>) => {
    updatePlanEntry(entryId, updates);
  };

  const handleAddEntry = (date: string, slot: MealSlot, foodId: string) => {
    if (!activeKid) return;
    
    addPlanEntry({
      kid_id: activeKid.id,
      date,
      meal_slot: slot,
      food_id: foodId,
      result: null,
    });
  };

  const handlePreviousWeek = () => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  };

  const handleThisWeek = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
  };

  const handleOpenFoodSelector = (date: string, slot: MealSlot) => {
    setSelectedSlot({ date, slot });
    setFoodSelectorOpen(true);
  };

  const handleSelectFood = (foodId: string) => {
    if (!selectedSlot || !activeKid) return;
    handleAddEntry(selectedSlot.date, selectedSlot.slot, foodId);
    toast.success("Meal added to calendar");
  };

  const handleSelectRecipe = async (recipeId: string) => {
    if (!selectedSlot || !activeKid) return;

    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe || recipe.food_ids.length === 0) return;

    try {
      // Use the database function to schedule the full recipe
      const { error } = await supabase.rpc('schedule_recipe_to_plan', {
        p_kid_id: activeKid.id,
        p_recipe_id: recipe.id,
        p_date: selectedSlot.date,
        p_meal_slot: selectedSlot.slot
      });

      if (error) {
        throw error;
      }

      // Refresh plan entries from database
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: planData } = await supabase
          .from('plan_entries')
          .select('*')
          .order('date', { ascending: true });

        if (planData) {
          setPlanEntries(planData as any);
        }
      }

      toast.success(`${recipe.name} (${recipe.food_ids.length} items) added to calendar`);
    } catch (error) {
      console.error('Error scheduling recipe:', error);
      toast.error("Failed to schedule recipe");
    }
  };

  const handleMarkResult = async (entry: PlanEntry, result: "ate" | "tasted" | "refused", attemptId?: string) => {
    const updates: Partial<PlanEntry> = { result };
    if (attemptId) {
      updates.food_attempt_id = attemptId;
    }

    updatePlanEntry(entry.id, updates);

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

    if (!attemptId) {
      toast.success(`Marked as ${result}`);
    }
  };

  const handleOpenDetailedTracking = (entry: PlanEntry) => {
    setTrackingEntry(entry);
    setDetailedTrackingOpen(true);
  };

  const handleDetailedTrackingComplete = (result: "ate" | "tasted" | "refused", attemptId?: string) => {
    if (trackingEntry) {
      handleMarkResult(trackingEntry, result, attemptId);
    }
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

    checkStockIssues();

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
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                Weekly Meal Planner
                {activeKid && <span className="text-primary"> - {activeKid.name}</span>}
              </h1>
              <p className="text-muted-foreground">
                Drag and drop meals to plan your week
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
                <Button variant="outline" size="icon" onClick={handlePreviousWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-center min-w-[200px]">
                  <div className="font-semibold">
                    Week of {format(currentWeekStart, 'MMM d, yyyy')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(currentWeekStart, 'MMM d')} - {format(addWeeks(currentWeekStart, 1), 'MMM d')}
                  </div>
                </div>
                <Button variant="outline" size="icon" onClick={handleNextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={handleThisWeek}>
                <Calendar className="h-4 w-4 mr-2" />
                This Week
              </Button>
            </div>
          </Card>
        </div>

        {!activeKid ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Select a Child</h3>
              <p className="text-muted-foreground mb-6">
                Please select a child to start planning meals
              </p>
            </div>
          </Card>
        ) : (
          <CalendarMealPlanner
            weekStart={currentWeekStart}
            planEntries={planEntries}
            foods={foods}
            recipes={recipes}
            kidId={activeKidId!}
            onUpdateEntry={handleUpdateEntry}
            onAddEntry={handleAddEntry}
            onOpenFoodSelector={handleOpenFoodSelector}
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
                          className="p-4 rounded-lg border-2 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all hover:border-primary/50"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <p className="text-sm font-semibold text-foreground uppercase tracking-wide">{label}</p>
                            {slot === "try_bite" && (
                              <Sparkles className="h-5 w-5 text-try-bite" />
                            )}
                          </div>
                          
                          {food ? (
                            <>
                              <div className="flex items-start justify-between mb-3">
                                <p className="font-bold text-lg text-foreground leading-tight">{food.name}</p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => entry && handleSwapMeal(entry)}
                                  title="Swap this meal"
                                  className="hover:bg-primary/20"
                                >
                                  <Shuffle className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Stock Status */}
                              {food.quantity !== undefined && food.quantity !== null && (
                                <div className="mb-3">
                                  {food.quantity === 0 ? (
                                    <Badge variant="destructive" className="gap-1 font-semibold">
                                      <Package className="h-3 w-3" />
                                      Out of Stock
                                    </Badge>
                                  ) : food.quantity <= 2 ? (
                                    <Badge variant="secondary" className="gap-1 font-semibold bg-yellow-500/20 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-300 border-yellow-500/50">
                                      <AlertTriangle className="h-3 w-3" />
                                      Low Stock ({food.quantity})
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="gap-1 font-semibold border-green-500/50 bg-green-500/10 text-green-900 dark:bg-green-500/20 dark:text-green-300">
                                      In Stock ({food.quantity})
                                    </Badge>
                                  )}
                                </div>
                              )}

                              {food.allergens && food.allergens.length > 0 && (
                                <div className="mb-3">
                                  <Badge variant="secondary" className="text-xs font-semibold bg-orange-500/20 text-orange-900 dark:bg-orange-500/30 dark:text-orange-300 border-orange-500/50">
                                    ⚠️ {food.allergens.join(", ")}
                                  </Badge>
                                </div>
                              )}
                              
                              {entry && (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant={entry.result === "ate" ? "default" : "outline"}
                                      onClick={() => handleMarkResult(entry, "ate")}
                                      className={entry.result === "ate" ? "bg-safe-food hover:bg-safe-food/90 text-white font-semibold" : "font-semibold hover:bg-safe-food/10"}
                                    >
                                      Ate
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={entry.result === "tasted" ? "default" : "outline"}
                                      onClick={() => handleMarkResult(entry, "tasted")}
                                      className={entry.result === "tasted" ? "bg-secondary hover:bg-secondary/90 text-white font-semibold" : "font-semibold hover:bg-secondary/10"}
                                    >
                                      Tasted
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={entry.result === "refused" ? "default" : "outline"}
                                      onClick={() => handleMarkResult(entry, "refused")}
                                      className={entry.result === "refused" ? "bg-destructive hover:bg-destructive/90 text-white font-semibold" : "font-semibold hover:bg-destructive/10"}
                                    >
                                      Refused
                                    </Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="ghost">
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent>
                                        <DropdownMenuItem onClick={() => handleOpenDetailedTracking(entry)}>
                                          📊 Track in Detail
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleSwapMeal(entry)}>
                                          🔄 Swap Food
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  {entry.food_attempt_id && (
                                    <Badge variant="outline" className="text-xs">
                                      ✓ Detailed tracking
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-center py-4">
                              <p className="text-muted-foreground font-medium">No meal planned</p>
                            </div>
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

        {trackingEntry && (
          <DetailedTrackingDialog
            open={detailedTrackingOpen}
            onOpenChange={setDetailedTrackingOpen}
            entry={trackingEntry}
            food={foods.find(f => f.id === trackingEntry.food_id)!}
            kidId={activeKidId!}
            onComplete={handleDetailedTrackingComplete}
          />
        )}
      </div>
    </div>
  );
}
