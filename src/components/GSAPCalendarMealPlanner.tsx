import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Food, PlanEntry, MealSlot, Recipe, Kid } from "@/types";
import {
  Sparkles,
  Calendar as CalendarIcon,
  AlertTriangle,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Users,
  Copy,
  MoreVertical,
  Trash2,
  Save,
  BookTemplate,
  GripVertical,
  Plus,
} from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { DailyMacrosSummary } from "@/components/DailyMacrosSummary";
import { SaveMealPlanTemplateDialog } from "@/components/SaveMealPlanTemplateDialog";
import { MealPlanTemplateGallery } from "@/components/MealPlanTemplateGallery";
import { ApplyTemplateDialog } from "@/components/ApplyTemplateDialog";
import { VoteResultsDisplay } from "@/components/VoteResultsDisplay";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Register GSAP plugin
gsap.registerPlugin(Draggable);

interface GSAPCalendarMealPlannerProps {
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
  onOpenFoodSelector: (date: string, slot: MealSlot, kidId?: string) => void;
  onCopyToChild: (entry: PlanEntry, targetKidId: string) => void;
  onCopyWeek?: (toDate: string) => void;
  onClearWeek?: () => void;
}

const MEAL_SLOTS: { slot: MealSlot; label: string; color: string; gradient: string }[] = [
  { 
    slot: "breakfast", 
    label: "Breakfast", 
    color: "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700",
    gradient: "from-orange-50 to-orange-100/50 dark:from-orange-950/40 dark:to-orange-900/20"
  },
  { 
    slot: "lunch", 
    label: "Lunch", 
    color: "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700",
    gradient: "from-green-50 to-green-100/50 dark:from-green-950/40 dark:to-green-900/20"
  },
  { 
    slot: "dinner", 
    label: "Dinner", 
    color: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700",
    gradient: "from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20"
  },
  { 
    slot: "snack1", 
    label: "Snack 1", 
    color: "bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700",
    gradient: "from-purple-50 to-purple-100/50 dark:from-purple-950/40 dark:to-purple-900/20"
  },
  { 
    slot: "snack2", 
    label: "Snack 2", 
    color: "bg-pink-100 dark:bg-pink-900/30 border-pink-300 dark:border-pink-700",
    gradient: "from-pink-50 to-pink-100/50 dark:from-pink-950/40 dark:to-pink-900/20"
  },
  { 
    slot: "try_bite", 
    label: "Try Bite", 
    color: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700",
    gradient: "from-yellow-50 to-yellow-100/50 dark:from-yellow-950/40 dark:to-yellow-900/20"
  },
];

const DAYS_IN_WEEK = 7;

// GSAP Draggable Meal Item Component
function DraggableMealItem({
  entry,
  food,
  recipe,
  kids,
  showAllKids,
  expandedRecipes,
  onToggleRecipeExpand,
  onCopyToChild,
  containerRef,
  cellRefs,
  onMoveEntry,
  getFood,
}: {
  entry: PlanEntry;
  food: Food | undefined;
  recipe: Recipe | undefined;
  kids: Kid[];
  showAllKids: boolean;
  expandedRecipes: Set<string>;
  onToggleRecipeExpand: (recipeId: string, e: React.MouseEvent) => void;
  onCopyToChild: (entry: PlanEntry, targetKidId: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  cellRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onMoveEntry: (entryId: string, targetDate: string, targetSlot: MealSlot) => void;
  getFood: (foodId: string) => Food | undefined;
}) {
  const mealRef = useRef<HTMLDivElement>(null);
  const draggableRef = useRef<Draggable[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const velocityTracker = useRef({ x: 0, y: 0, lastX: 0, lastY: 0, lastTime: 0 });

  const entryKid = kids.find((k) => k.id === entry.kid_id);
  const otherKids = kids.filter((k) => k.id !== entry.kid_id);

  // Find closest cell based on screen coordinates (pointer position)
  // Using DOM query instead of refs for reliability
  const findClosestCell = useCallback((pointerX: number, pointerY: number): { date: string; slot: MealSlot; element: HTMLDivElement } | null => {
    let closest: { date: string; slot: MealSlot; element: HTMLDivElement; distance: number } | null = null;

    // Determine if we're on desktop (lg breakpoint is 1024px)
    const isDesktop = window.innerWidth >= 1024;
    const viewType = isDesktop ? "desktop" : "mobile";

    // Query cells directly from the DOM using data attributes
    const cells = document.querySelectorAll<HTMLDivElement>(`[data-cell-view="${viewType}"]`);
    
    // GSAP's pointerX/pointerY are PAGE coordinates (include scroll)
    // getBoundingClientRect returns VIEWPORT coordinates
    // We need to convert pointer to viewport coordinates by subtracting scroll
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const viewportPointerX = pointerX - scrollX;
    const viewportPointerY = pointerY - scrollY;
    
    cells.forEach((element) => {
      const date = element.dataset.cellDate;
      const slot = element.dataset.cellSlot;
      
      if (!date || !slot) return;
      
      const rect = element.getBoundingClientRect();
      
      // Skip cells with zero dimensions (hidden elements)
      if (rect.width === 0 || rect.height === 0) return;
      
      // Calculate center of cell in viewport coordinates
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Calculate distance from viewport pointer to cell center
      const distance = Math.sqrt(Math.pow(viewportPointerX - centerX, 2) + Math.pow(viewportPointerY - centerY, 2));

      if (!closest || distance < closest.distance) {
        closest = { date, slot: slot as MealSlot, element, distance };
      }
    });

    return closest ? { date: closest.date, slot: closest.slot, element: closest.element } : null;
  }, []);

  // Initialize GSAP Draggable
  useEffect(() => {
    if (!mealRef.current || !containerRef.current) return;

    const element = mealRef.current;
    let highlightedCell: HTMLDivElement | null = null;

    draggableRef.current = Draggable.create(element, {
      type: "x,y",
      bounds: containerRef.current,
      edgeResistance: 0.75,
      cursor: "grab",
      activeCursor: "grabbing",
      zIndexBoost: true,
      allowEventDefault: true,

      onDragStart: function() {
        setIsDragging(true);
        // Initialize velocity tracker with pointer position (screen coordinates)
        velocityTracker.current = { x: 0, y: 0, lastX: this.pointerX, lastY: this.pointerY, lastTime: Date.now() };

        // Fluid scale and shadow animation
        gsap.to(element, {
          scale: 1.1,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 3px rgba(249, 115, 22, 0.5)",
          rotation: gsap.utils.random(-3, 3),
          duration: 0.25,
          ease: "power3.out",
        });
      },

      onDrag: function() {
        // Track velocity for momentum using pointer position
        const now = Date.now();
        const dt = (now - velocityTracker.current.lastTime) / 1000;
        if (dt > 0) {
          velocityTracker.current.x = (this.pointerX - velocityTracker.current.lastX) / dt;
          velocityTracker.current.y = (this.pointerY - velocityTracker.current.lastY) / dt;
        }
        velocityTracker.current.lastX = this.pointerX;
        velocityTracker.current.lastY = this.pointerY;
        velocityTracker.current.lastTime = now;

        // Find and highlight closest cell using actual pointer position
        const closest = findClosestCell(this.pointerX, this.pointerY);
        
        if (highlightedCell && highlightedCell !== closest?.element) {
          gsap.to(highlightedCell, {
            scale: 1,
            boxShadow: "none",
            borderColor: "",
            duration: 0.2,
            ease: "power2.out",
          });
        }

        if (closest?.element && closest.element !== highlightedCell) {
          highlightedCell = closest.element;
          gsap.to(highlightedCell, {
            scale: 1.02,
            boxShadow: "0 0 20px rgba(249, 115, 22, 0.3), inset 0 0 20px rgba(249, 115, 22, 0.1)",
            duration: 0.2,
            ease: "power2.out",
          });
        }
      },

      onDragEnd: function() {
        setIsDragging(false);

        // Clear highlight
        if (highlightedCell) {
          gsap.to(highlightedCell, {
            scale: 1,
            boxShadow: "none",
            duration: 0.3,
            ease: "power2.out",
          });
          highlightedCell = null;
        }

        // Apply momentum using pointer velocity
        const momentumFactor = 0.05; // Reduced for more precise drops
        const vx = Math.max(-1000, Math.min(1000, velocityTracker.current.x)) * momentumFactor;
        const vy = Math.max(-1000, Math.min(1000, velocityTracker.current.y)) * momentumFactor;

        // Use the final pointer position plus momentum to find target cell
        const projectedX = this.pointerX + vx;
        const projectedY = this.pointerY + vy;

        const target = findClosestCell(projectedX, projectedY);

        if (target) {
          // Success ripple effect on the target cell
          gsap.fromTo(target.element,
            { boxShadow: "0 0 0 0px rgba(249, 115, 22, 0.4)" },
            { boxShadow: "0 0 0 15px rgba(249, 115, 22, 0)", duration: 0.5, ease: "power2.out" }
          );

          // Animate back to original position with bounce
          gsap.to(element, {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            duration: 0.4,
            ease: "back.out(1.5)",
            onComplete: () => {
              // Perform the actual data move after animation
              if (target.date !== entry.date || target.slot !== entry.meal_slot) {
                onMoveEntry(entry.id, target.date, target.slot);
              }
            },
          });
        } else {
          // Bounce back to origin
          gsap.to(element, {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            duration: 0.5,
            ease: "back.out(2)",
          });
        }
      },
    });

    return () => {
      draggableRef.current?.[0]?.kill();
    };
  }, [entry, containerRef, cellRefs, findClosestCell, onMoveEntry]);

  // Render recipe entry
  if (entry.recipe_id && recipe) {
    const isExpanded = expandedRecipes.has(entry.recipe_id);
    const ingredientFoods = (recipe.food_ids || [])
      .map((foodId) => getFood(foodId))
      .filter(Boolean) as Food[];

    return (
      <div
        ref={mealRef}
        className={cn(
          "gsap-meal-item rounded-xl border-2 transition-all select-none",
          "bg-gradient-to-br from-card via-card to-background",
          "border-border hover:border-primary/40",
          isDragging && "z-50 pointer-events-none min-w-[200px]"
        )}
        style={{ touchAction: "none" }}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                "p-2.5",
                isDragging && "p-3"
              )}>
                {/* Expanded view when dragging */}
                {isDragging ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-bold text-foreground whitespace-normal">
                        {recipe.name}
                      </span>
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-0 font-medium shrink-0">
                        Recipe
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
                      <span>{recipe.food_ids?.length || 0} ingredients</span>
                      {recipe.description && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[150px]">{recipe.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Normal compact view */
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 cursor-grab active:cursor-grabbing" />
                      <Badge className="text-[9px] px-1 py-0 bg-primary/20 text-primary border-0 font-medium shrink-0">
                        Recipe
                      </Badge>
                      {showAllKids && entryKid && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                          {entryKid.name}
                        </Badge>
                      )}
                      {otherKids.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 p-0 hover:bg-accent shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Copy to...</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {otherKids.map((kid) => (
                              <DropdownMenuItem key={kid.id} onClick={() => onCopyToChild(entry, kid.id)}>
                                <Copy className="h-3 w-3 mr-2" />
                                {kid.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <button
                        onClick={(e) => onToggleRecipeExpand(entry.recipe_id!, e)}
                        className="p-0.5 hover:bg-accent rounded-md transition-colors shrink-0 ml-auto"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </div>
                    <p className="text-[11px] font-medium text-white/90 dark:text-white/90 line-clamp-3 leading-tight hyphens-auto">
                      {recipe.name}
                    </p>
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="font-semibold">{recipe.name}</p>
              <p className="text-xs text-muted-foreground">{recipe.description}</p>
              <p className="text-xs mt-1">{recipe.food_ids?.length || 0} ingredients</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {!isDragging && isExpanded && ingredientFoods.length > 0 && (
          <div className="px-3 pb-2.5 pt-0 space-y-1">
            {ingredientFoods.map((f) => {
              const isOutOfStock = (f.quantity || 0) === 0;
              const isLowStock = (f.quantity || 0) > 0 && (f.quantity || 0) <= 2;
              return (
                <div
                  key={f.id}
                  className={cn(
                    "px-2 py-1 rounded-md text-[11px] flex items-center justify-between",
                    isOutOfStock && "bg-destructive/10 text-destructive",
                    isLowStock && "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
                    !isOutOfStock && !isLowStock && "bg-muted/60 text-muted-foreground"
                  )}
                >
                  <span>• {f.name}</span>
                  {isOutOfStock && <Package className="h-3 w-3" />}
                  {isLowStock && <AlertTriangle className="h-3 w-3" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Render food entry
  if (!food) return null;

  const isOutOfStock = (food.quantity || 0) === 0;
  const isLowStock = (food.quantity || 0) > 0 && (food.quantity || 0) <= 2;

  return (
    <div
      ref={mealRef}
      className={cn(
        "gsap-meal-item rounded-xl border-2 transition-all select-none",
        "bg-gradient-to-br from-card via-card to-background",
        isOutOfStock && "border-destructive/50 bg-destructive/5",
        isLowStock && "border-yellow-400/50 bg-yellow-50 dark:bg-yellow-950/20",
        !isOutOfStock && !isLowStock && "border-border hover:border-primary/40",
        isDragging && "z-50 pointer-events-none min-w-[200px]"
      )}
      style={{ touchAction: "none" }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "p-2.5",
              isDragging && "p-3"
            )}>
              {/* Expanded view when dragging */}
              {isDragging ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-bold text-foreground whitespace-normal">
                      {food.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
                    <span className="capitalize">{food.category}</span>
                    <span>•</span>
                    <span>{food.quantity || 0} {food.unit || "servings"}</span>
                  </div>
                </div>
              ) : (
                /* Normal compact view */
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 cursor-grab active:cursor-grabbing" />
                    {isOutOfStock && <Package className="h-3 w-3 text-destructive shrink-0" />}
                    {isLowStock && <AlertTriangle className="h-3 w-3 text-yellow-600 shrink-0" />}
                    {showAllKids && entryKid && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                        {entryKid.name}
                      </Badge>
                    )}
                    {otherKids.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 p-0 hover:bg-accent shrink-0 ml-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Copy to...</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {otherKids.map((kid) => (
                            <DropdownMenuItem key={kid.id} onClick={() => onCopyToChild(entry, kid.id)}>
                              <Copy className="h-3 w-3 mr-2" />
                              {kid.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-white/90 dark:text-white/90 line-clamp-3 leading-tight hyphens-auto">
                    {food.name}
                  </p>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="font-semibold">{food.name}</p>
            <p className="text-xs">Stock: {food.quantity || 0} {food.unit || "servings"}</p>
            <p className="text-xs text-muted-foreground">Category: {food.category}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function GSAPCalendarMealPlanner({
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
}: GSAPCalendarMealPlannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [mobileViewDay, setMobileViewDay] = useState(0);
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
      const { data, error } = await supabase.from("nutrition").select("*");
      if (!error && data) {
        setNutritionData(data);
      }
    };
    loadNutritionData();
  }, []);


  const getFood = useCallback((foodId: string) => foods.find((f) => f.id === foodId), [foods]);
  const getRecipe = useCallback((recipeId: string) => recipes.find((r) => r.id === recipeId), [recipes]);

  const getEntriesForSlot = useCallback((date: string, slot: MealSlot) => {
    const kidFilter = showAllKids ? kids.map((k) => k.id) : [kidId];
    const allEntries = planEntries.filter(
      (e) => e.date === date && e.meal_slot === slot && kidFilter.includes(e.kid_id)
    );

    // Group by recipe_id
    const grouped: PlanEntry[] = [];
    const recipeIds = new Set<string>();

    allEntries.forEach((entry) => {
      if (entry.recipe_id) {
        const recipeKey = `${entry.recipe_id}-${entry.kid_id}`;
        if (!recipeIds.has(recipeKey)) {
          recipeIds.add(recipeKey);
          grouped.push(entry);
        }
      } else {
        grouped.push(entry);
      }
    });

    return grouped;
  }, [planEntries, showAllKids, kids, kidId]);

  const toggleRecipeExpand = (recipeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRecipes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(recipeId)) {
        newSet.delete(recipeId);
      } else {
        newSet.add(recipeId);
      }
      return newSet;
    });
  };

  const handleMoveEntry = useCallback((entryId: string, targetDate: string, targetSlot: MealSlot) => {
    const entry = planEntries.find((e) => e.id === entryId);
    if (!entry) return;

    // If recipe, move all recipe entries
    if (entry.recipe_id) {
      const allRecipeEntries = planEntries.filter(
        (e) =>
          e.recipe_id === entry.recipe_id &&
          e.date === entry.date &&
          e.meal_slot === entry.meal_slot
      );

      allRecipeEntries.forEach((e) => {
        onUpdateEntry(e.id, { date: targetDate, meal_slot: targetSlot });
      });
    } else {
      onUpdateEntry(entryId, { date: targetDate, meal_slot: targetSlot });
    }
  }, [planEntries, onUpdateEntry]);

  // Template handlers
  const handleSelectTemplate = (template: any) => {
    setSelectedTemplate(template);
    setShowApplyTemplateDialog(true);
  };

  const days = Array.from({ length: DAYS_IN_WEEK }, (_, i) => {
    const date = addDays(weekStart, i);
    return {
      date: format(date, "yyyy-MM-dd"),
      label: format(date, "EEE"),
      dayNum: format(date, "d"),
      month: format(date, "MMM"),
      isToday: format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"),
    };
  });

  // Cell ref setter
  const setCellRef = useCallback((key: string, element: HTMLDivElement | null) => {
    if (element) {
      cellRefs.current.set(key, element);
    } else {
      cellRefs.current.delete(key);
    }
  }, []);

  return (
    <div ref={containerRef} className="gsap-calendar-planner relative">
      {/* Desktop View */}
      <div className="hidden lg:block space-y-4">
        {/* Week Actions Toolbar */}
        <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-card to-card/80 border rounded-xl shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplateGallery(true)}
              className="bg-primary/5 hover:bg-primary/10 border-primary/20"
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

            <div className="h-6 w-px bg-border mx-2" />

            {onCopyWeek && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextWeek = addDays(weekStart, 7);
                  onCopyWeek(format(nextWeek, "yyyy-MM-dd"));
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy to Next Week
              </Button>
            )}
            {onClearWeek && (
              <Button variant="outline" size="sm" onClick={onClearWeek}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Week
              </Button>
            )}
          </div>

          {kids.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllKids(!showAllKids)}
              className={showAllKids ? "bg-primary/10 border-primary/30" : ""}
            >
              <Users className="h-4 w-4 mr-2" />
              {showAllKids ? "Show Active Child Only" : "Show All Children"}
            </Button>
          )}
        </div>

        {/* Daily Macros Summary */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => (
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

        {/* Calendar Grid */}
        <div className="overflow-x-auto rounded-xl border bg-card/50 backdrop-blur-sm">
          <div className="min-w-[1000px] p-4">
            {/* Header with days */}
            <div className="grid grid-cols-8 gap-3 mb-4">
              <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center justify-center">
                Meals
              </div>
              {days.map((day) => (
                <div
                  key={day.date}
                  className={cn(
                    "text-center p-3 rounded-xl transition-colors",
                    day.isToday && "bg-primary/10 ring-2 ring-primary/30"
                  )}
                >
                  <div className="text-sm font-bold text-foreground">{day.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {day.month} {day.dayNum}
                  </div>
                </div>
              ))}
            </div>

            {/* Meal rows */}
            {MEAL_SLOTS.map(({ slot, label, color, gradient }) => (
              <div key={slot} className="grid grid-cols-8 gap-3 mb-3">
                <div
                  className={cn(
                    "flex items-center justify-center rounded-xl p-3 border",
                    color
                  )}
                >
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  {slot === "try_bite" && <Sparkles className="h-4 w-4 ml-2 text-yellow-600" />}
                </div>

                {days.map((day) => {
                  const entries = getEntriesForSlot(day.date, slot);
                  const cellKey = `desktop||${day.date}||${slot}`;
                  const planEntryId = entries.length > 0 ? entries[0].id : undefined;
                  const recipeId = entries.length > 0 ? entries[0].recipe_id : undefined;

                  return (
                    <div
                      key={cellKey}
                      ref={(el) => setCellRef(cellKey, el)}
                      data-cell-view="desktop"
                      data-cell-date={day.date}
                      data-cell-slot={slot}
                      className={cn(
                        "min-h-[90px] rounded-xl border-2 border-dashed p-2 transition-all",
                        `bg-gradient-to-br ${gradient}`,
                        entries.length > 0 ? "border-border/50" : "border-muted/50",
                        "hover:border-primary/40 hover:shadow-lg",
                        "group"
                      )}
                    >
                      {entries.length > 0 ? (
                        <div className="space-y-2">
                          {entries.map((entry) => (
                            <DraggableMealItem
                              key={entry.id}
                              entry={entry}
                              food={getFood(entry.food_id)}
                              recipe={entry.recipe_id ? getRecipe(entry.recipe_id) : undefined}
                              kids={kids}
                              showAllKids={showAllKids}
                              expandedRecipes={expandedRecipes}
                              onToggleRecipeExpand={toggleRecipeExpand}
                              onCopyToChild={onCopyToChild}
                              containerRef={containerRef}
                              cellRefs={cellRefs}
                              onMoveEntry={handleMoveEntry}
                              getFood={getFood}
                            />
                          ))}

                          {kids.length > 0 && (
                            <VoteResultsDisplay
                              planEntryId={planEntryId}
                              recipeId={recipeId}
                              mealDate={day.date}
                              mealSlot={slot}
                              kids={kids}
                              compact={true}
                              className="mt-1"
                            />
                          )}

                          {/* Add more button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenFoodSelector(day.date, slot, kidId);
                            }}
                            className="w-full py-1.5 rounded-lg border border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all text-xs font-medium flex items-center justify-center gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Add more
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => onOpenFoodSelector(day.date, slot, kidId)}
                          className="flex items-center justify-center h-full w-full text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <Plus className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span className="text-xs font-medium">Add meal</span>
                          </div>
                        </button>
                      )}
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
        <div className="flex items-center justify-between bg-gradient-to-r from-card to-card/80 p-4 rounded-xl border shadow-sm">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMobileViewDay(Math.max(0, mobileViewDay - 1))}
            disabled={mobileViewDay === 0}
            className="h-10 w-10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <div className={cn(
              "font-bold text-lg text-foreground",
              days[mobileViewDay].isToday && "text-primary"
            )}>
              {days[mobileViewDay].label}
            </div>
            <div className="text-sm text-muted-foreground">
              {days[mobileViewDay].month} {days[mobileViewDay].dayNum}
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMobileViewDay(Math.min(DAYS_IN_WEEK - 1, mobileViewDay + 1))}
            disabled={mobileViewDay === DAYS_IN_WEEK - 1}
            className="h-10 w-10"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Mobile Meal Cards */}
        <div className="space-y-3">
          {MEAL_SLOTS.map(({ slot, label, color, gradient }) => {
            const day = days[mobileViewDay];
            const entries = getEntriesForSlot(day.date, slot);
            const cellKey = `mobile||${day.date}||${slot}`;

            return (
              <Card key={slot} className={cn("overflow-hidden border-2", color)}>
                <CardHeader className="pb-2 bg-gradient-to-r from-transparent to-white/30 dark:to-black/20">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">{label}</span>
                    {slot === "try_bite" && <Sparkles className="h-4 w-4 text-yellow-600" />}
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div
                    ref={(el) => setCellRef(cellKey, el)}
                    data-cell-view="mobile"
                    data-cell-date={day.date}
                    data-cell-slot={slot}
                    className={cn(
                      "min-h-[80px] rounded-xl border-2 border-dashed p-2",
                      `bg-gradient-to-br ${gradient}`,
                      entries.length > 0 ? "border-border/50" : "border-muted/50"
                    )}
                  >
                    {entries.length > 0 ? (
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <DraggableMealItem
                            key={entry.id}
                            entry={entry}
                            food={getFood(entry.food_id)}
                            recipe={entry.recipe_id ? getRecipe(entry.recipe_id) : undefined}
                            kids={kids}
                            showAllKids={showAllKids}
                            expandedRecipes={expandedRecipes}
                            onToggleRecipeExpand={toggleRecipeExpand}
                            onCopyToChild={onCopyToChild}
                            containerRef={containerRef}
                            cellRefs={cellRefs}
                            onMoveEntry={handleMoveEntry}
                            getFood={getFood}
                          />
                        ))}

                        {/* Add more button for mobile */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFoodSelector(day.date, slot, kidId);
                          }}
                          className="w-full py-2 rounded-lg border border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:border-primary/50 hover:text-primary hover:bg-primary/5 active:bg-primary/10 transition-all text-sm font-medium flex items-center justify-center gap-1.5"
                        >
                          <Plus className="h-4 w-4" />
                          Add more
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onOpenFoodSelector(day.date, slot, kidId)}
                        className="flex items-center justify-center h-full w-full min-h-[60px] text-muted-foreground/60 hover:text-primary active:text-primary transition-colors cursor-pointer"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Plus className="h-5 w-5" />
                          <span className="text-xs font-medium">Tap to add</span>
                        </div>
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Template Dialogs */}
      <SaveMealPlanTemplateDialog
        open={showSaveTemplateDialog}
        onOpenChange={setShowSaveTemplateDialog}
        startDate={format(weekStart, "yyyy-MM-dd")}
        endDate={format(addDays(weekStart, 6), "yyyy-MM-dd")}
        kidId={kidId}
        onTemplateSaved={() => logger.info("Template saved successfully")}
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
        onTemplateApplied={() => logger.info("Template applied successfully")}
      />
    </div>
  );
}

