import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, Trash2 } from "lucide-react";
import { Recipe, Kid } from "@/types";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";

interface PlanEntry {
  id: string;
  date: string;
  recipe_id: string;
  kid_id: string | null;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
}

interface MealPlanningCalendarProps {
  planEntries: PlanEntry[];
  recipes: Recipe[];
  kids: Kid[];
  activeKidId: string | null;
  onAddMeal: (date: string, mealType: string) => void;
  onRemoveMeal: (entryId: string) => void;
  onEditMeal: (entry: PlanEntry) => void;
}

const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { value: "lunch", label: "Lunch", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { value: "dinner", label: "Dinner", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { value: "snack", label: "Snack", color: "bg-green-100 text-green-800 border-green-300" },
];

export function MealPlanningCalendar({
  planEntries,
  recipes,
  kids,
  activeKidId,
  onAddMeal,
  onRemoveMeal,
  onEditMeal,
}: MealPlanningCalendarProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(), { weekStartsOn: 0 }); // Sunday
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  const goToPreviousWeek = () => {
    setCurrentWeekStart(addDays(currentWeekStart, -7));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(addDays(currentWeekStart, 7));
  };

  const goToToday = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
  };

  const getEntriesForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return planEntries.filter(entry => {
      const entryDate = parseISO(entry.date);
      const matchesDate = isSameDay(entryDate, date);
      const matchesKid = activeKidId === null || entry.kid_id === activeKidId;
      return matchesDate && matchesKid;
    });
  };

  const getRecipe = (recipeId: string) => {
    return recipes.find(r => r.id === recipeId);
  };

  const getMealTypeConfig = (mealType: string) => {
    return MEAL_TYPES.find(m => m.value === mealType) || MEAL_TYPES[0];
  };

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">
              {format(currentWeekStart, "MMMM yyyy")}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPreviousWeek}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextWeek}
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Calendar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {weekDays.map((day, dayIndex) => {
          const isToday = isSameDay(day, new Date());
          const entries = getEntriesForDay(day);

          // Group entries by meal type
          const entriesByMealType = MEAL_TYPES.map(mealType => ({
            ...mealType,
            entries: entries.filter(e => e.meal_type === mealType.value),
          }));

          return (
            <Card
              key={dayIndex}
              className={`p-4 min-h-[400px] ${isToday ? "ring-2 ring-primary" : ""}`}
            >
              {/* Day Header */}
              <div className="mb-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground font-medium">
                    {format(day, "EEE")}
                  </p>
                  <p className={`text-2xl font-bold ${isToday ? "text-primary" : ""}`}>
                    {format(day, "d")}
                  </p>
                </div>
              </div>

              {/* Meal Sections */}
              <div className="space-y-4">
                {entriesByMealType.map(mealSection => (
                  <div key={mealSection.value} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className={`text-xs ${mealSection.color}`}
                      >
                        {mealSection.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => onAddMeal(format(day, "yyyy-MM-dd"), mealSection.value)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Meal Entries */}
                    <div className="space-y-2">
                      {mealSection.entries.map(entry => {
                        const recipe = getRecipe(entry.recipe_id);
                        if (!recipe) return null;

                        return (
                          <div
                            key={entry.id}
                            className="group relative p-2 rounded-md border bg-card hover:shadow-md transition-all cursor-pointer"
                            onClick={() => onEditMeal(entry)}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-xs font-medium line-clamp-2 flex-1">
                                {recipe.name}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 h-5 w-5 p-0 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveMeal(entry.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                            {recipe.prepTime && (
                              <p className="text-xs text-muted-foreground mt-1">
                                ⏱️ {recipe.prepTime}m
                              </p>
                            )}
                          </div>
                        );
                      })}

                      {mealSection.entries.length === 0 && (
                        <div className="text-xs text-muted-foreground italic p-2 text-center">
                          No {mealSection.label.toLowerCase()} planned
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Legend */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium">Meal Types:</span>
          {MEAL_TYPES.map(mealType => (
            <Badge key={mealType.value} variant="outline" className={mealType.color}>
              {mealType.label}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}

