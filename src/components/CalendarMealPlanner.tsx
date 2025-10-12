import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Food, PlanEntry, MealSlot } from "@/types";
import { Sparkles, Calendar as CalendarIcon, AlertTriangle, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";

interface CalendarMealPlannerProps {
  weekStart: Date;
  planEntries: PlanEntry[];
  foods: Food[];
  recipes: any[];
  kidId: string;
  onUpdateEntry: (entryId: string, updates: Partial<PlanEntry>) => void;
  onAddEntry: (date: string, slot: MealSlot, foodId: string) => void;
  onOpenFoodSelector: (date: string, slot: MealSlot) => void;
}

const MEAL_SLOTS: { slot: MealSlot; label: string; color: string }[] = [
  { slot: "breakfast", label: "Breakfast", color: "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700" },
  { slot: "lunch", label: "Lunch", color: "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700" },
  { slot: "dinner", label: "Dinner", color: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700" },
  { slot: "snack1", label: "Snack 1", color: "bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700" },
  { slot: "snack2", label: "Snack 2", color: "bg-pink-100 dark:bg-pink-900/30 border-pink-300 dark:border-pink-700" },
  { slot: "try_bite", label: "Try Bite", color: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700" },
];

const DAYS_IN_WEEK = 7;

export function CalendarMealPlanner({
  weekStart,
  planEntries,
  foods,
  recipes,
  kidId,
  onUpdateEntry,
  onAddEntry,
  onOpenFoodSelector,
}: CalendarMealPlannerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedFood, setDraggedFood] = useState<Food | null>(null);
  const [mobileViewDay, setMobileViewDay] = useState(0); // For mobile day-by-day view

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    
    console.log('Drag started:', active.id);
    
    // Find the entry being dragged
    const entry = planEntries.find(e => e.id === active.id);
    if (entry) {
      // For display in drag overlay
      if (entry.recipe_id) {
        const recipe = recipes.find(r => r.id === entry.recipe_id);
        console.log('Dragging recipe:', recipe?.name);
      } else {
        const food = foods.find(f => f.id === entry.food_id);
        setDraggedFood(food || null);
        console.log('Dragging food:', food?.name);
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    console.log('Drag ended - Active:', active.id, 'Over:', over?.id);
    
    if (!over) {
      setActiveId(null);
      setDraggedFood(null);
      console.log('No drop target, canceling drag');
      return;
    }

    const activeEntry = planEntries.find(e => e.id === active.id);
    if (!activeEntry) {
      setActiveId(null);
      setDraggedFood(null);
      console.log('Could not find active entry:', active.id);
      return;
    }

    // Parse the drop target: "date-slot" format
    const dropIdParts = (over.id as string).split('-');
    const targetSlot = dropIdParts[dropIdParts.length - 1];
    const targetDate = dropIdParts.slice(0, -1).join('-');
    
    console.log('Parsed drop target - Date:', targetDate, 'Slot:', targetSlot);
    
    if (targetDate && targetSlot) {
      // Don't do anything if dropping in the same slot
      if (activeEntry.date === targetDate && activeEntry.meal_slot === targetSlot) {
        console.log('Dropped in same slot, no update needed');
        setActiveId(null);
        setDraggedFood(null);
        return;
      }
      
      // If this is a recipe entry, move ALL entries with same recipe_id
      if (activeEntry.recipe_id) {
        const allRecipeEntries = planEntries.filter(
          e => e.recipe_id === activeEntry.recipe_id && 
               e.date === activeEntry.date && 
               e.meal_slot === activeEntry.meal_slot
        );
        
        console.log('Moving recipe with', allRecipeEntries.length, 'entries');
        
        allRecipeEntries.forEach(entry => {
          onUpdateEntry(entry.id, {
            date: targetDate,
            meal_slot: targetSlot as MealSlot,
          });
        });
      } else {
        // Regular food entry - just move this one
        onUpdateEntry(activeEntry.id, {
          date: targetDate,
          meal_slot: targetSlot as MealSlot,
        });
      }
    } else {
      console.log('Invalid drop target format');
    }

    setActiveId(null);
    setDraggedFood(null);
  };

  const getFood = (foodId: string) => foods.find(f => f.id === foodId);
  const getRecipe = (recipeId: string) => recipes.find(r => r.id === recipeId);

  const getEntriesForSlot = (date: string, slot: MealSlot) => {
    const allEntries = planEntries.filter(
      e => e.date === date && e.meal_slot === slot && e.kid_id === kidId
    );
    
    // Group by recipe_id - show recipes as single items
    const grouped: PlanEntry[] = [];
    const recipeIds = new Set<string>();
    
    allEntries.forEach(entry => {
      if (entry.recipe_id) {
        // Only add first entry of each recipe
        if (!recipeIds.has(entry.recipe_id)) {
          recipeIds.add(entry.recipe_id);
          grouped.push(entry);
        }
      } else {
        // Regular food entries
        grouped.push(entry);
      }
    });
    
    return grouped;
  };

  const renderFoodBadge = (entry: PlanEntry, isDragging = false) => {
    // If it's a recipe entry, show recipe name
    if (entry.recipe_id) {
      const recipe = getRecipe(entry.recipe_id);
      if (recipe) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "p-2 rounded border cursor-move hover:shadow-md transition-all touch-none",
                    isDragging && "opacity-50",
                    "bg-card border-border"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs md:text-sm font-medium truncate flex-1 text-foreground">
                      {recipe.name}
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                      Recipe
                    </Badge>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p className="font-medium">{recipe.name}</p>
                  <p className="text-xs">{recipe.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {recipe.food_ids?.length || 0} ingredients
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
    }
    
    // Regular food entry
    const food = getFood(entry.food_id);
    if (!food) return null;
    
    const isOutOfStock = (food.quantity || 0) === 0;
    const isLowStock = (food.quantity || 0) > 0 && (food.quantity || 0) <= 2;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "p-2 rounded border cursor-move hover:shadow-md transition-all touch-none",
                isDragging && "opacity-50",
                isOutOfStock && "bg-destructive/10 border-destructive",
                isLowStock && "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700",
                !isOutOfStock && !isLowStock && "bg-card border-border"
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs md:text-sm font-medium truncate flex-1 text-foreground">
                  {food.name}
                </span>
                {isOutOfStock ? (
                  <Package className="h-3 w-3 text-destructive flex-shrink-0" />
                ) : isLowStock ? (
                  <AlertTriangle className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                ) : null}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-medium">{food.name}</p>
              <p className="text-xs">Stock: {food.quantity || 0} {food.unit || 'servings'}</p>
              <p className="text-xs">Category: {food.category}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const days = Array.from({ length: DAYS_IN_WEEK }, (_, i) => {
    const date = addDays(weekStart, i);
    return {
      date: format(date, 'yyyy-MM-dd'),
      label: format(date, 'EEE'),
      dayNum: format(date, 'd'),
      month: format(date, 'MMM'),
    };
  });

  // Draggable meal component
  const DraggableMeal = ({ entry }: { entry: PlanEntry }) => {
    const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
      id: entry.id,
    });

    const style = transform ? {
      transform: CSS.Translate.toString(transform),
    } : undefined;

    return (
      <div ref={setNodeRef} {...listeners} {...attributes} style={style}>
        {renderFoodBadge(entry, isDragging)}
      </div>
    );
  };

  // Droppable slot component
  const DroppableSlot = ({ 
    dropId, 
    entries, 
    color,
    date,
    slot,
  }: { 
    dropId: string; 
    entries: PlanEntry[]; 
    color: string;
    date: string;
    slot: MealSlot;
  }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: dropId,
    });

    const hasEntries = entries.length > 0;

    return (
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[70px] md:min-h-[80px] rounded-lg border-2 border-dashed p-1.5 md:p-2 w-full",
          hasEntries ? color : 'bg-muted/30 border-muted',
          isOver && 'ring-2 ring-primary bg-primary/10',
          "transition-all cursor-pointer"
        )}
        onClick={() => !hasEntries && onOpenFoodSelector(date, slot)}
      >
        {hasEntries ? (
          <div className="space-y-1">
            {entries.map((entry) => (
              <DraggableMeal key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[10px] md:text-xs text-muted-foreground hover:text-primary transition-colors">
            <span className="hidden md:inline">Click to add</span>
            <span className="md:hidden">+</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Desktop View */}
      <div className="hidden lg:block">
        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            {/* Header with days */}
            <div className="grid grid-cols-8 gap-2 mb-2">
              <div className="font-medium text-sm text-foreground w-[120px]">Meals</div>
              {days.map(day => (
                <div key={day.date} className="text-center flex-1">
                  <div className="text-sm font-semibold text-foreground">{day.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {day.month} {day.dayNum}
                  </div>
                </div>
              ))}
            </div>

            {/* Meal rows */}
            {MEAL_SLOTS.map(({ slot, label, color }) => (
              <div key={slot} className="grid grid-cols-8 gap-2 mb-2">
                <div className={cn("flex items-center justify-center rounded-lg p-2 w-[120px]", color)}>
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </div>
                
                {days.map(day => {
                  const entries = getEntriesForSlot(day.date, slot);
                  const dropId = `${day.date}-${slot}`;

                  return (
                    <div key={dropId} className="flex-1">
                      <DroppableSlot
                        dropId={dropId}
                        entries={entries}
                        color={color}
                        date={day.date}
                        slot={slot}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile View - Day by Day */}
      <div className="lg:hidden space-y-4">
        {/* Mobile Day Navigation */}
        <div className="flex items-center justify-between bg-card p-4 rounded-lg border">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMobileViewDay(Math.max(0, mobileViewDay - 1))}
            disabled={mobileViewDay === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <div className="font-semibold text-foreground">
              {days[mobileViewDay].label}
            </div>
            <div className="text-xs text-muted-foreground">
              {days[mobileViewDay].month} {days[mobileViewDay].dayNum}
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMobileViewDay(Math.min(DAYS_IN_WEEK - 1, mobileViewDay + 1))}
            disabled={mobileViewDay === DAYS_IN_WEEK - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile Meal Cards */}
        <div className="space-y-3">
          {MEAL_SLOTS.map(({ slot, label, color }) => {
            const day = days[mobileViewDay];
            const entries = getEntriesForSlot(day.date, slot);
            const dropId = `${day.date}-${slot}`;

            return (
              <Card key={slot} className={color}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground">{label}</span>
                    {slot === "try_bite" && <Sparkles className="h-4 w-4 text-try-bite" />}
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <DroppableSlot
                    dropId={dropId}
                    entries={entries}
                    color={color}
                    date={day.date}
                    slot={slot}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeId ? (
          (() => {
            const entry = planEntries.find(e => e.id === activeId);
            return entry ? (
              <div className="rotate-3 cursor-grabbing opacity-90">
                {renderFoodBadge(entry)}
              </div>
            ) : null;
          })()
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
