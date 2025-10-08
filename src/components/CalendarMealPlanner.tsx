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
} from "@dnd-kit/core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Food, PlanEntry, MealSlot } from "@/types";
import { Sparkles, Calendar as CalendarIcon, AlertTriangle, Package } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";

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
  { slot: "breakfast", label: "Breakfast", color: "bg-orange-100 border-orange-300" },
  { slot: "lunch", label: "Lunch", color: "bg-green-100 border-green-300" },
  { slot: "dinner", label: "Dinner", color: "bg-blue-100 border-blue-300" },
  { slot: "snack1", label: "Snack 1", color: "bg-purple-100 border-purple-300" },
  { slot: "snack2", label: "Snack 2", color: "bg-pink-100 border-pink-300" },
  { slot: "try_bite", label: "Try Bite", color: "bg-yellow-100 border-yellow-300" },
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
    
    // Find the food being dragged
    const entry = planEntries.find(e => e.id === active.id);
    if (entry) {
      const food = foods.find(f => f.id === entry.food_id);
      setDraggedFood(food || null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      setDraggedFood(null);
      return;
    }

    const activeEntry = planEntries.find(e => e.id === active.id);
    if (!activeEntry) {
      setActiveId(null);
      setDraggedFood(null);
      return;
    }

    // Parse the drop target: "date-slot" format
    const [targetDate, targetSlot] = (over.id as string).split('-');
    
    if (targetDate && targetSlot) {
      // Check if there's already an entry for this slot on this date
      const existingEntry = planEntries.find(
        e => e.date === targetDate && e.meal_slot === targetSlot && e.kid_id === kidId
      );

      if (existingEntry && existingEntry.id !== activeEntry.id) {
        // Swap the two entries
        onUpdateEntry(existingEntry.id, {
          date: activeEntry.date,
          meal_slot: activeEntry.meal_slot,
        });
      }

      // Update the dragged entry
      onUpdateEntry(activeEntry.id, {
        date: targetDate,
        meal_slot: targetSlot as MealSlot,
      });
    }

    setActiveId(null);
    setDraggedFood(null);
  };

  const getFood = (foodId: string) => foods.find(f => f.id === foodId);

  const getEntryForSlot = (date: string, slot: MealSlot) => {
    return planEntries.find(
      e => e.date === date && e.meal_slot === slot && e.kid_id === kidId
    );
  };

  const renderFoodBadge = (food: Food, isDragging = false) => {
    const isOutOfStock = (food.quantity || 0) === 0;
    const isLowStock = (food.quantity || 0) > 0 && (food.quantity || 0) <= 2;

    return (
      <div
        className={`p-2 rounded border ${
          isDragging ? 'opacity-50' : ''
        } ${
          isOutOfStock
            ? 'bg-destructive/10 border-destructive'
            : isLowStock
            ? 'bg-yellow-50 border-yellow-300'
            : 'bg-card border-border'
        } cursor-move hover:shadow-md transition-shadow`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate flex-1">{food.name}</span>
          {isOutOfStock ? (
            <Package className="h-3 w-3 text-destructive flex-shrink-0" />
          ) : isLowStock ? (
            <AlertTriangle className="h-3 w-3 text-yellow-600 flex-shrink-0" />
          ) : null}
        </div>
        {food.quantity !== undefined && food.quantity !== null && (
          <div className="text-xs text-muted-foreground mt-1">
            Stock: {food.quantity}
          </div>
        )}
      </div>
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
  const DraggableMeal = ({ entry, food }: { entry: PlanEntry; food: Food }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: entry.id,
    });

    return (
      <div ref={setNodeRef} {...listeners} {...attributes}>
        {renderFoodBadge(food, isDragging)}
      </div>
    );
  };

  // Droppable slot component
  const DroppableSlot = ({ 
    dropId, 
    entry, 
    food, 
    color,
    date,
    slot,
  }: { 
    dropId: string; 
    entry: PlanEntry | undefined; 
    food: Food | null; 
    color: string;
    date: string;
    slot: MealSlot;
  }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: dropId,
    });

    return (
      <div
        ref={setNodeRef}
        className={`min-h-[80px] rounded-lg border-2 border-dashed p-2 ${
          food ? color : 'bg-muted/30 border-muted'
        } ${isOver ? 'ring-2 ring-primary' : ''} transition-all cursor-pointer`}
        onClick={() => !food && onOpenFoodSelector(date, slot)}
      >
        {entry && food ? (
          <DraggableMeal entry={entry} food={food} />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground hover:text-primary transition-colors">
            Click to add
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
      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          {/* Header with days */}
          <div className="grid grid-cols-8 gap-2 mb-2">
            <div className="font-medium text-sm text-muted-foreground">Meals</div>
            {days.map(day => (
              <div key={day.date} className="text-center">
                <div className="text-sm font-semibold">{day.label}</div>
                <div className="text-xs text-muted-foreground">
                  {day.month} {day.dayNum}
                </div>
              </div>
            ))}
          </div>

          {/* Meal rows */}
          {MEAL_SLOTS.map(({ slot, label, color }) => (
            <div key={slot} className="grid grid-cols-8 gap-2 mb-2">
              <div className={`flex items-center justify-center rounded-lg p-2 ${color}`}>
                <span className="text-sm font-medium">{label}</span>
              </div>
              
              {days.map(day => {
                const entry = getEntryForSlot(day.date, slot);
                const food = entry ? getFood(entry.food_id) : null;
                const dropId = `${day.date}-${slot}`;

                return (
                  <DroppableSlot
                    key={dropId}
                    dropId={dropId}
                    entry={entry}
                    food={food}
                    color={color}
                    date={day.date}
                    slot={slot}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeId && draggedFood ? (
          <div className="rotate-3">
            {renderFoodBadge(draggedFood)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
