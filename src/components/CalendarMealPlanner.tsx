import { useState, useEffect, useCallback, useMemo, memo } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Food, PlanEntry, MealSlot, Recipe, Kid } from "@/types";
import { Sparkles, Calendar as CalendarIcon, AlertTriangle, Package, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Users, Copy, MoreVertical, Trash2, Save, BookTemplate } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { DailyMacrosSummary } from "@/components/DailyMacrosSummary";
import { SaveMealPlanTemplateDialog } from "@/components/SaveMealPlanTemplateDialog";
import { MealPlanTemplateGallery } from "@/components/MealPlanTemplateGallery";
import { ApplyTemplateDialog } from "@/components/ApplyTemplateDialog";
import { VoteResultsDisplay } from "@/components/VoteResultsDisplay";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

interface CalendarMealPlannerProps {
  weekStart: Date;
  planEntries: PlanEntry[];
  foods: Food[];
  recipes: Recipe[];
  kids: Kid[];
  kidId: string;
  kidName: string;
  kidAge?: number;
  kidWeight?: number;
  onUpdateEntry: (entryId: string, updates: Partial<PlanEntry>) => void;
  onAddEntry: (date: string, slot: MealSlot, foodId: string) => void;
  onOpenFoodSelector: (date: string, slot: MealSlot) => void;
  onCopyToChild: (entry: PlanEntry, targetKidId: string) => void;
  onCopyWeek?: (toDate: string) => void;
  onClearWeek?: () => void;
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

export const CalendarMealPlanner = memo(function CalendarMealPlanner({
  weekStart,
  planEntries,
  foods,
  recipes,
  kids,
  kidId,
  kidName,
  kidAge,
  kidWeight,
  onUpdateEntry,
  onAddEntry,
  onOpenFoodSelector,
  onCopyToChild,
  onCopyWeek,
  onClearWeek,
}: CalendarMealPlannerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedFood, setDraggedFood] = useState<Food | null>(null);
  const [mobileViewDay, setMobileViewDay] = useState(0); // For mobile day-by-day view
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set());
  const [nutritionData, setNutritionData] = useState<any[]>([]);
  const [showAllKids, setShowAllKids] = useState(false);

  // Template dialogs state
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showApplyTemplateDialog, setShowApplyTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // Load nutrition data
  useEffect(() => {
    const loadNutritionData = async () => {
      const { data, error } = await supabase
        .from('nutrition')
        .select('*');
      
      if (!error && data) {
        setNutritionData(data);
      }
    };
    
    loadNutritionData();
  }, []);

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
    
    logger.debug('Drag started:', active.id);
    
    // Find the entry being dragged
    const entry = planEntries.find(e => e.id === active.id);
    if (entry) {
      // For display in drag overlay
      if (entry.recipe_id) {
        const recipe = recipes.find(r => r.id === entry.recipe_id);
        logger.debug('Dragging recipe:', recipe?.name);
      } else {
        const food = foods.find(f => f.id === entry.food_id);
        setDraggedFood(food || null);
        logger.debug('Dragging food:', food?.name);
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    logger.debug('Drag ended - Active:', active.id, 'Over:', over?.id);
    
    if (!over) {
      setActiveId(null);
      setDraggedFood(null);
      logger.debug('No drop target, canceling drag');
      return;
    }

    const activeEntry = planEntries.find(e => e.id === active.id);
    if (!activeEntry) {
      setActiveId(null);
      setDraggedFood(null);
      logger.debug('Could not find active entry:', active.id);
      return;
    }

    // Parse the drop target: "date-slot" format
    const dropIdParts = (over.id as string).split('-');
    const targetSlot = dropIdParts[dropIdParts.length - 1];
    const targetDate = dropIdParts.slice(0, -1).join('-');
    
    logger.debug('Parsed drop target - Date:', targetDate, 'Slot:', targetSlot);
    
    if (targetDate && targetSlot) {
      // Don't do anything if dropping in the same slot
      if (activeEntry.date === targetDate && activeEntry.meal_slot === targetSlot) {
        logger.debug('Dropped in same slot, no update needed');
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
        
        logger.debug('Moving recipe with', allRecipeEntries.length, 'entries');
        
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
      logger.debug('Invalid drop target format');
    }

    setActiveId(null);
    setDraggedFood(null);
  };

  // Memoize food and recipe lookups to prevent recreating functions on every render
  const getFood = useCallback((foodId: string) => foods.find(f => f.id === foodId), [foods]);
  const getRecipe = useCallback((recipeId: string) => recipes.find(r => r.id === recipeId), [recipes]);

  // Memoize kid filter set for O(1) lookup instead of O(n) includes()
  const kidFilterSet = useMemo(() => {
    return new Set(showAllKids ? kids.map(k => k.id) : [kidId]);
  }, [showAllKids, kids, kidId]);

  // Memoize entries grouped by slot for efficient lookups
  const entriesBySlot = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();

    planEntries.forEach(entry => {
      if (!kidFilterSet.has(entry.kid_id)) return;

      const key = `${entry.date}-${entry.meal_slot}`;
      if (!map.has(key)) {
        map.set(key, []);
      }

      const entries = map.get(key)!;

      // Group by recipe_id - show recipes as single items
      if (entry.recipe_id) {
        const recipeKey = `${entry.recipe_id}-${entry.kid_id}`;
        const alreadyHasRecipe = entries.some(
          e => e.recipe_id && `${e.recipe_id}-${e.kid_id}` === recipeKey
        );
        if (!alreadyHasRecipe) {
          entries.push(entry);
        }
      } else {
        entries.push(entry);
      }
    });

    return map;
  }, [planEntries, kidFilterSet]);

  const getEntriesForSlot = useCallback((date: string, slot: MealSlot) => {
    return entriesBySlot.get(`${date}-${slot}`) || [];
  }, [entriesBySlot]);

  const toggleRecipeExpand = useCallback((recipeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRecipes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recipeId)) {
        newSet.delete(recipeId);
      } else {
        newSet.add(recipeId);
      }
      return newSet;
    });
  }, []);

  // Template handlers
  const handleSelectTemplate = (template: any) => {
    setSelectedTemplate(template);
    setShowApplyTemplateDialog(true);
  };

  const handleTemplateApplied = () => {
    // Refresh the plan entries - parent component should handle this
    // Could emit event or callback here
    logger.info('Template applied successfully');
  };

  const handleTemplateSaved = () => {
    logger.info('Template saved successfully');
  };

  const renderFoodBadge = (entry: PlanEntry, isDragging = false) => {
    const entryKid = kids.find(k => k.id === entry.kid_id);
    const otherKids = kids.filter(k => k.id !== entry.kid_id);
    
    // If it's a recipe entry, show recipe name
    if (entry.recipe_id) {
      const recipe = getRecipe(entry.recipe_id);
      if (recipe) {
        const isExpanded = expandedRecipes.has(entry.recipe_id);
        const ingredientFoods = (recipe.food_ids || [])
          .map(foodId => getFood(foodId))
          .filter(Boolean) as Food[];

        return (
          <div className="space-y-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "p-2 rounded border hover:shadow-md transition-all",
                      isDragging && "opacity-50",
                      "bg-card border-border"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-xs md:text-sm font-medium truncate flex-1 text-foreground cursor-move touch-none">
                          {recipe.name}
                        </span>
                        {showAllKids && entryKid && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                            {entryKid.name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          Recipe
                        </Badge>
                        {otherKids.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-5 w-5 p-0" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Copy to...</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {otherKids.map(kid => (
                                <DropdownMenuItem 
                                  key={kid.id}
                                  onClick={() => onCopyToChild(entry, kid.id)}
                                >
                                  <Copy className="h-3 w-3 mr-2" />
                                  {kid.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <button
                          onClick={(e) => toggleRecipeExpand(entry.recipe_id!, e)}
                          className="p-0.5 hover:bg-accent rounded"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </div>
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
            
            {isExpanded && ingredientFoods.length > 0 && (
              <div className="pl-2 space-y-0.5">
                {ingredientFoods.map(food => {
                  const isOutOfStock = (food.quantity || 0) === 0;
                  const isLowStock = (food.quantity || 0) > 0 && (food.quantity || 0) <= 2;
                  
                  return (
                    <div
                      key={food.id}
                      className={cn(
                        "px-2 py-1 rounded text-[10px] md:text-xs flex items-center justify-between",
                        isOutOfStock && "bg-destructive/10 text-destructive",
                        isLowStock && "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300",
                        !isOutOfStock && !isLowStock && "bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <span>• {food.name}</span>
                      {isOutOfStock ? (
                        <Package className="h-2.5 w-2.5" />
                      ) : isLowStock ? (
                        <AlertTriangle className="h-2.5 w-2.5" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-xs md:text-sm font-medium truncate flex-1 text-foreground">
                    {food.name}
                  </span>
                  {showAllKids && entryKid && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                      {entryKid.name}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isOutOfStock ? (
                    <Package className="h-3 w-3 text-destructive" />
                  ) : isLowStock ? (
                    <AlertTriangle className="h-3 w-3 text-yellow-600" />
                  ) : null}
                  {otherKids.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5 p-0" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Copy to...</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {otherKids.map(kid => (
                          <DropdownMenuItem 
                            key={kid.id}
                            onClick={() => onCopyToChild(entry, kid.id)}
                          >
                            <Copy className="h-3 w-3 mr-2" />
                            {kid.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
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

    // Get plan entry ID for vote results (use first entry)
    const planEntryId = entries.length > 0 ? entries[0].id : undefined;
    const recipeId = entries.length > 0 ? entries[0].recipe_id : undefined;

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

            {/* Show vote results if we have kids and entries */}
            {kids.length > 0 && (
              <VoteResultsDisplay
                planEntryId={planEntryId}
                recipeId={recipeId}
                mealDate={date}
                mealSlot={slot}
                kids={kids}
                compact={true}
                className="mt-1"
              />
            )}
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
      <div className="hidden lg:block space-y-4">
        {/* Week Actions Toolbar */}
        <div className="flex items-center justify-between gap-4 p-4 bg-card border rounded-lg">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Template Actions */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplateGallery(true)}
              className="bg-primary/5 hover:bg-primary/10"
            >
              <BookTemplate className="h-4 w-4 mr-2" />
              Use Template
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveTemplateDialog(true)}
            >
              <Save className="h-4 w-4 mr-2" />
              Save as Template
            </Button>

            {/* Divider */}
            <div className="h-6 w-px bg-border mx-1" />

            {/* Week Actions */}
            {onCopyWeek && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextWeek = addDays(weekStart, 7);
                  onCopyWeek(format(nextWeek, 'yyyy-MM-dd'));
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy to Next Week
              </Button>
            )}
            {onClearWeek && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearWeek}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Week
              </Button>
            )}
          </div>

          {/* View mode toggle */}
          {kids.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllKids(!showAllKids)}
            >
              <Users className="h-4 w-4 mr-2" />
              {showAllKids ? 'Show Active Child Only' : 'Show All Children'}
            </Button>
          )}
        </div>

        {/* Daily Macros Summary */}
        <div className="grid grid-cols-7 gap-2">
          {days.map(day => (
            <DailyMacrosSummary
              key={day.date}
              date={day.date}
              kidId={kidId}
              kidName={kidName}
              kidAge={kidAge}
              kidWeight={kidWeight}
              planEntries={planEntries}
              foods={foods}
              nutritionData={nutritionData}
            />
          ))}
        </div>

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
        {/* Daily Macros Summary for current day */}
        <DailyMacrosSummary
          date={days[mobileViewDay].date}
          kidId={kidId}
          kidName={kidName}
          kidAge={kidAge}
          kidWeight={kidWeight}
          planEntries={planEntries}
          foods={foods}
          nutritionData={nutritionData}
        />

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

      {/* Template Dialogs */}
      <SaveMealPlanTemplateDialog
        open={showSaveTemplateDialog}
        onOpenChange={setShowSaveTemplateDialog}
        startDate={format(weekStart, 'yyyy-MM-dd')}
        endDate={format(addDays(weekStart, 6), 'yyyy-MM-dd')}
        kidId={kidId}
        onTemplateSaved={handleTemplateSaved}
      />

      <MealPlanTemplateGallery
        open={showTemplateGallery}
        onOpenChange={setShowTemplateGallery}
        onSelectTemplate={handleSelectTemplate}
      />

      <ApplyTemplateDialog
        open={showApplyTemplateDialog}
        onOpenChange={setShowApplyTemplateDialog}
        template={selectedTemplate}
        kids={kids}
        onTemplateApplied={handleTemplateApplied}
      />
    </DndContext>
  );
});
