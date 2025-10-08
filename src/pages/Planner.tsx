import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildWeekPlan } from "@/lib/mealPlanner";
import { Calendar, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { MealSlot, PlanEntry } from "@/types";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
  { slot: "snack1", label: "Snack 1" },
  { slot: "snack2", label: "Snack 2" },
  { slot: "try_bite", label: "Try Bite" },
];

export default function Planner() {
  const { foods, kids, activeKidId, planEntries, setPlanEntries, updatePlanEntry } = useApp();

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

  const handleMarkResult = (entry: PlanEntry, result: "ate" | "tasted" | "refused") => {
    updatePlanEntry(entry.id, { result });
    toast.success(`Marked as ${result}`);
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
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary">{dayIndex + 1}</span>
                    </div>
                    <h3 className="text-xl font-semibold">{dayName}</h3>
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
                              <p className="font-semibold mb-3">{food.name}</p>
                              
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
      </div>
    </div>
  );
}
