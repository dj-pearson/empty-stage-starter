import { useState, useEffect, useRef, useCallback, useMemo, memo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Food, PlanEntry, MealSlot, Recipe, Kid } from "@/types";
import {
  Sparkles,
  AlertTriangle,
  Users,
  Copy,
  MoreVertical,
  Trash2,
  Save,
  BookTemplate,
  GripVertical,
  Plus,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Minus,
  Star,
  Repeat,
  ShoppingCart,
  ArrowRightLeft,
  CalendarDays,
  ListPlus,
  ShieldCheck,
  ThumbsDown,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { DailyMacrosSummary } from "@/components/DailyMacrosSummary";
import { indexNutritionByName, useTrustedNutritionCatalog } from "@/lib/trustedNutritionCatalog";
import { VoteResultsDisplay } from "@/components/VoteResultsDisplay";
import { PlannerTemplatesController } from "@/components/meal-planner/PlannerTemplatesController";
import { logger } from "@/lib/logger";
import { countMissingForRecipe } from "@/lib/recipeShortfall";
import { fatigueByRecipe, type RecipeFatigue } from "@/lib/tonightModeRanking";
import { TwistMealSheet } from "@/components/TwistMealSheet";
import { useVarietyNudgePref } from "@/hooks/useVarietyNudgePref";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { analytics } from "@/lib/analytics";
import { getKidFoodFit, getKidRecipeFit } from "@/lib/kidFit";

/// US-298: threshold for surfacing the "try a twist?" chip. A recipe scoring
/// >= 0.4 is far enough above the median repeat rate that the nudge is
/// warranted without being too aggressive.
const FATIGUE_CHIP_THRESHOLD = 0.4;
const FATIGUE_LOOKBACK_DAYS = 21;

/** How far outside a cell's rect a drop still counts as that cell, in px. */
const DROP_MARGIN_PX = 8;

// Register GSAP plugin
gsap.registerPlugin(Draggable);

export type PlanResult = "ate" | "tasted" | "refused";

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
  /** Fallback for a move when onMoveEntries is not wired. */
  onUpdateEntry?: (entryId: string, updates: Partial<PlanEntry>) => void;
  onAddEntry?: (date: string, slot: MealSlot, foodId: string) => void;
  onOpenFoodSelector: (date: string, slot: MealSlot, kidId?: string) => void;
  onCopyToChild: (entry: PlanEntry, targetKidId: string) => void;
  /** Copy THIS grid's kid's week to the week starting `toDate`. */
  onCopyWeek?: (toDate: string, kidId: string) => void;
  /** Clear THIS grid's kid's week. The page confirms and offers Undo. */
  onClearWeek?: (kidId: string) => void;
  /**
   * US-290: open the missing-ingredients dialog for a recipe scheduled in
   * a plan cell.
   */
  onOpenMissingForRecipe?: (recipeId: string) => void;
  /** C2: delete these rows (every row of a recipe for one kid/date/slot). */
  onDeleteEntries?: (ids: string[]) => void;
  /** C2: log how the meal went. */
  onMarkResult?: (entry: PlanEntry, result: PlanResult) => void;
  /** C2: move these rows to date/slot in one write. */
  onMoveEntries?: (ids: string[], date: string, slot: MealSlot) => void;
  /** C2: push the week's ingredients to the grocery list. */
  onPushWeekToGrocery?: () => void;
  /** C2: swap one recipe for another in a kid's slot (the twist sheet). */
  onReplaceRecipeInSlot?: (
    kidId: string,
    date: string,
    slot: MealSlot,
    oldRecipeId: string,
    newRecipeId: string
  ) => void;
  /**
   * The page owns one PlannerTemplatesController. When these are passed the
   * toolbar buttons open it; without them the grid renders its own.
   */
  onOpenSaveTemplate?: () => void;
  onOpenTemplateGallery?: () => void;
}

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
  { slot: "snack1", label: "Snack 1" },
  { slot: "snack2", label: "Snack 2" },
  { slot: "try_bite", label: "Try Bite" },
];

const DAYS_IN_WEEK = 7;

/* ------------------------------------------------------------------------ */
/* Kid fit signals                                                           */
/* ------------------------------------------------------------------------ */

type KidFitResult = ReturnType<typeof getKidFoodFit>;

function KidFitSignals({ fit, kidName }: { fit: KidFitResult; kidName: string }) {
  const { t } = useTranslation();
  // An allergen hit always wins and stands alone: nothing else about the item
  // matters until that is dealt with.
  if (fit.allergen) {
    const label = t("planner.grid.fit.allergen", {
      defaultValue: "Contains {{allergen}}, {{name}} is allergic",
      allergen: fit.allergen,
      name: kidName,
    });
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        data-testid="kid-fit-allergen"
        className="inline-flex min-h-6 items-center gap-0.5 rounded-md bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground"
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {fit.allergen}
      </span>
    );
  }

  const signals: ReactElement[] = [];
  if (fit.safe || fit.alwaysEats) {
    const label = t("planner.grid.fit.safe", { defaultValue: "Safe food for {{name}}", name: kidName });
    signals.push(
      <span key="safe" role="img" aria-label={label} title={label} data-testid="kid-fit-safe"
        className="inline-flex min-h-6 min-w-6 items-center justify-center text-safe-food">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  } else if (fit.tryBite) {
    const label = t("planner.grid.fit.tryBite", { defaultValue: "Try bite for {{name}}", name: kidName });
    signals.push(
      <span key="try" role="img" aria-label={label} title={label} data-testid="kid-fit-try-bite"
        className="inline-flex min-h-6 min-w-6 items-center justify-center text-try-bite">
        <Star className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  } else if (fit.disliked) {
    const label = t("planner.grid.fit.disliked", { defaultValue: "{{name}} dislikes this", name: kidName });
    signals.push(
      <span key="dislike" role="img" aria-label={label} title={label} data-testid="kid-fit-disliked"
        className="inline-flex min-h-6 min-w-6 items-center justify-center text-muted-foreground">
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  if (fit.offered > 0) {
    signals.push(
      <span key="history" className="text-[10px] text-muted-foreground whitespace-nowrap" data-testid="kid-fit-history">
        {t("planner.grid.fit.history", {
          defaultValue: "ate {{ate}} of {{offered}}",
          ate: fit.ate,
          offered: fit.offered,
        })}
      </span>
    );
  }
  if (signals.length === 0) return null;
  return <>{signals.slice(0, 2)}</>;
}

function ResultPill({ result }: { result: PlanResult }) {
  const { t } = useTranslation();
  const config = {
    ate: { icon: Check, cls: "bg-success/15 text-foreground", iconCls: "text-success", label: t("planner.grid.result.ate", { defaultValue: "Ate" }) },
    tasted: { icon: Minus, cls: "bg-warning/15 text-foreground", iconCls: "text-warning", label: t("planner.grid.result.tasted", { defaultValue: "Tasted" }) },
    refused: { icon: X, cls: "bg-destructive/15 text-foreground", iconCls: "text-destructive", label: t("planner.grid.result.refused", { defaultValue: "Refused" }) },
  }[result];
  const Icon = config.icon;
  return (
    <span
      className={cn("inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium", config.cls)}
      data-testid="plan-entry-result"
    >
      <Icon className={cn("h-3 w-3", config.iconCls)} aria-hidden="true" />
      {config.label}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* One draggable item                                                        */
/* ------------------------------------------------------------------------ */

interface DayInfo {
  date: string;
  label: string;
  longLabel: string;
  dayNum: string;
  month: string;
  isToday: boolean;
}

interface DraggableMealItemProps {
  entry: PlanEntry;
  /** Every row this item stands for: all of a recipe's rows for one kid/date/slot. */
  groupIds: string[];
  food: Food | undefined;
  recipe: Recipe | undefined;
  entryKid: Kid | undefined;
  otherKids: Kid[];
  foods: Food[];
  foodById: Map<string, Food>;
  kidHistory: PlanEntry[];
  showKidBadge: boolean;
  isExpanded: boolean;
  days: DayInfo[];
  reducedMotion: boolean;
  onToggleRecipeExpand: (recipeId: string, e: React.MouseEvent) => void;
  onCopyToChild: (entry: PlanEntry, targetKidId: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMoveEntry: (entryId: string, targetDate: string, targetSlot: MealSlot) => void;
  onOpenMissingForRecipe?: (recipeId: string) => void;
  onDeleteEntries?: (ids: string[]) => void;
  onMarkResult?: (entry: PlanEntry, result: PlanResult) => void;
  /** US-298: precomputed variety fatigue for this entry's recipe. */
  fatigue?: RecipeFatigue;
  /** US-298: opens the twist sheet for this entry. */
  onOpenTwist?: (entry: PlanEntry) => void;
}

const DraggableMealItem = memo(function DraggableMealItem({
  entry,
  groupIds,
  food,
  recipe,
  entryKid,
  otherKids,
  foods,
  foodById,
  kidHistory,
  showKidBadge,
  isExpanded,
  days,
  reducedMotion,
  onToggleRecipeExpand,
  onCopyToChild,
  containerRef,
  onMoveEntry,
  onOpenMissingForRecipe,
  onDeleteEntries,
  onMarkResult,
  fatigue,
  onOpenTwist,
}: DraggableMealItemProps) {
  const { t } = useTranslation();
  const mealRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // The drop handler reads the entry's CURRENT date/slot through this ref, so
  // the Draggable does not have to be rebuilt when a realtime tick hands us a
  // fresh entry object.
  const entryRef = useRef(entry);
  entryRef.current = entry;

  // US-290: recomputed only when the recipe or pantry changes.
  const missingCount = useMemo(() => (recipe ? countMissingForRecipe(recipe, foods) : 0), [recipe, foods]);

  useEffect(() => {
    if (missingCount > 0 && entry.recipe_id) {
      analytics.trackEvent("plan_entry_missing_chip_shown", {
        recipe_id: entry.recipe_id,
        missing_count: missingCount,
      });
    }
  }, [missingCount, entry.recipe_id]);

  const fatigueChipVisible = !!fatigue && fatigue.score >= FATIGUE_CHIP_THRESHOLD;
  useEffect(() => {
    if (fatigueChipVisible && entry.recipe_id) {
      analytics.trackEvent("variety_chip_shown", {
        recipe_id: entry.recipe_id,
        score: fatigue?.score,
        count: fatigue?.count,
      });
    }
  }, [fatigueChipVisible, entry.recipe_id, fatigue?.score, fatigue?.count]);

  const fit = useMemo<KidFitResult | null>(() => {
    if (!entryKid) return null;
    if (recipe) return getKidRecipeFit(entryKid, recipe, foodById, kidHistory);
    if (food) return getKidFoodFit(entryKid, food, kidHistory);
    return null;
  }, [entryKid, recipe, food, foodById, kidHistory]);

  /**
   * The cell under the pointer, inside THIS grid only. Family view stacks one
   * grid per child, and a document-wide nearest-centre search let a drag
   * land in a sibling's grid. A cell counts only when the pointer is within
   * its rect plus a small margin; anywhere else bounces back.
   */
  const findCellAt = useCallback(
    (pointerX: number, pointerY: number): { date: string; slot: MealSlot; element: HTMLDivElement } | null => {
      const root = containerRef.current;
      if (!root) return null;
      // Draggable's pointerX/Y are page coordinates; rects are viewport ones.
      const x = pointerX - (window.scrollX || 0);
      const y = pointerY - (window.scrollY || 0);
      let best: { date: string; slot: MealSlot; element: HTMLDivElement; d: number } | null = null;
      root.querySelectorAll<HTMLDivElement>("[data-cell-date][data-cell-slot]").forEach((element) => {
        const date = element.dataset.cellDate;
        const slot = element.dataset.cellSlot as MealSlot | undefined;
        if (!date || !slot) return;
        const r = element.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (
          x < r.left - DROP_MARGIN_PX ||
          x > r.right + DROP_MARGIN_PX ||
          y < r.top - DROP_MARGIN_PX ||
          y > r.bottom + DROP_MARGIN_PX
        ) {
          return;
        }
        const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        if (!best || d < best.d) best = { date, slot, element, d };
      });
      const hit = best as { date: string; slot: MealSlot; element: HTMLDivElement; d: number } | null;
      return hit ? { date: hit.date, slot: hit.slot, element: hit.element } : null;
    },
    [containerRef]
  );

  useEffect(() => {
    if (!mealRef.current || !handleRef.current || !containerRef.current) return;

    const element = mealRef.current;
    const dur = (s: number) => (reducedMotion ? 0 : s);
    const glow = "0 0 0 2px hsl(var(--primary) / 0.3)";
    let highlightedCell: HTMLDivElement | null = null;

    const clearHighlight = () => {
      if (highlightedCell) {
        gsap.to(highlightedCell, { boxShadow: "none", duration: dur(0.2), ease: "power2.out" });
        highlightedCell = null;
      }
    };

    const draggables = Draggable.create(element, {
      type: "x,y",
      trigger: handleRef.current,
      bounds: containerRef.current,
      edgeResistance: 0.75,
      cursor: "grab",
      activeCursor: "grabbing",
      zIndexBoost: true,
      allowEventDefault: true,

      onDragStart: function () {
        setIsDragging(true);
        gsap.to(element, {
          ...(reducedMotion ? {} : { scale: 1.05 }),
          boxShadow: `0 12px 24px -8px hsl(var(--foreground) / 0.25), ${glow}`,
          duration: dur(0.2),
          ease: "power2.out",
        });
      },

      onDrag: function () {
        const hit = findCellAt(this.pointerX, this.pointerY);
        if (highlightedCell && highlightedCell !== hit?.element) clearHighlight();
        if (hit?.element && hit.element !== highlightedCell) {
          highlightedCell = hit.element;
          gsap.to(highlightedCell, {
            boxShadow: "0 0 0 2px hsl(var(--primary) / 0.3), inset 0 0 16px hsl(var(--primary) / 0.1)",
            duration: dur(0.15),
            ease: "power2.out",
          });
        }
      },

      onDragEnd: function () {
        setIsDragging(false);
        clearHighlight();
        const target = findCellAt(this.pointerX, this.pointerY);
        const current = entryRef.current;

        if (target && (target.date !== current.date || target.slot !== current.meal_slot)) {
          // Move now and reset in place: the item re-renders in its new cell.
          // It used to glide home first and then teleport, a visible double move.
          onMoveEntry(current.id, target.date, target.slot);
          gsap.set(element, { x: 0, y: 0, scale: 1, rotation: 0, boxShadow: "" });
          if (!reducedMotion) {
            gsap.fromTo(
              target.element,
              { boxShadow: "0 0 0 0px hsl(var(--primary) / 0.3)" },
              { boxShadow: "0 0 0 10px hsl(var(--primary) / 0)", duration: 0.4, ease: "power2.out" }
            );
          }
          return;
        }

        gsap.to(element, {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          boxShadow: "",
          duration: dur(0.3),
          ease: "power2.out",
        });
      },
    });

    return () => {
      draggables[0]?.kill();
    };
  }, [entry.id, containerRef, findCellAt, onMoveEntry, reducedMotion]);

  const name = recipe?.name ?? food?.name ?? "";
  const dayInfo = days.find((d) => d.date === entry.date);
  const slotLabel = MEAL_SLOTS.find((s) => s.slot === entry.meal_slot)?.label ?? entry.meal_slot;
  const itemLabel = t("planner.grid.itemLabel", {
    defaultValue: "{{name}}, {{day}}, {{slot}}",
    name,
    day: dayInfo?.longLabel ?? entry.date,
    slot: slotLabel,
  });
  const result = entry.result ?? null;

  if (!recipe && !food) return null;

  const isOutOfStock = !recipe && (food?.quantity || 0) === 0;
  const isLowStock = !recipe && (food?.quantity || 0) > 0 && (food?.quantity || 0) <= 2;

  const itemMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 min-h-6 min-w-6 p-0 hover:bg-accent shrink-0"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("planner.grid.menu.open", { defaultValue: "Actions for {{name}}", name })}
          data-testid="plan-entry-menu"
        >
          <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onMarkResult && (
          <>
            <DropdownMenuLabel>{t("planner.grid.menu.howItWent", { defaultValue: "How did it go?" })}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onMarkResult(entry, "ate")}>
              <Check className="h-4 w-4 mr-2 text-success" aria-hidden="true" />
              {t("planner.grid.result.ate", { defaultValue: "Ate" })}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMarkResult(entry, "tasted")}>
              <Minus className="h-4 w-4 mr-2 text-warning" aria-hidden="true" />
              {t("planner.grid.result.tasted", { defaultValue: "Tasted" })}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMarkResult(entry, "refused")}>
              <X className="h-4 w-4 mr-2 text-destructive" aria-hidden="true" />
              {t("planner.grid.result.refused", { defaultValue: "Refused" })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CalendarDays className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("planner.grid.menu.moveTo", { defaultValue: "Move to..." })}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {days.map((d) => (
              <DropdownMenuSub key={d.date}>
                <DropdownMenuSubTrigger>{d.longLabel}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {MEAL_SLOTS.map((s) => (
                    <DropdownMenuItem
                      key={s.slot}
                      disabled={d.date === entry.date && s.slot === entry.meal_slot}
                      onSelect={() => onMoveEntry(entry.id, d.date, s.slot)}
                    >
                      {t(`planner.slots.${s.slot}`, { defaultValue: s.label })}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {otherKids.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("planner.grid.menu.copyTo", { defaultValue: "Copy to child" })}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {otherKids.map((kid) => (
                <DropdownMenuItem key={kid.id} onSelect={() => onCopyToChild(entry, kid.id)}>
                  {kid.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {recipe && onOpenTwist && (
          <DropdownMenuItem onSelect={() => onOpenTwist(entry)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("planner.grid.menu.swap", { defaultValue: "Swap for something similar" })}
          </DropdownMenuItem>
        )}
        {onDeleteEntries && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDeleteEntries(groupIds)}
              data-testid="plan-entry-remove"
            >
              <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("planner.grid.menu.remove", { defaultValue: "Remove" })}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const ingredientFoods = recipe
    ? (recipe.food_ids || []).map((id) => foodById.get(id)).filter((f): f is Food => !!f)
    : [];

  return (
    <div
      ref={mealRef}
      role="group"
      tabIndex={0}
      aria-roledescription={t("planner.grid.itemRole", { defaultValue: "planned meal" })}
      aria-label={itemLabel}
      data-testid="plan-entry-item"
      className={cn(
        "gsap-meal-item rounded-xl border bg-card transition-colors select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "border-border hover:border-primary/40",
        isDragging && "z-50 pointer-events-none min-w-[200px] shadow-lg"
      )}
    >
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1">
          <span
            ref={handleRef}
            className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md text-muted-foreground cursor-grab active:cursor-grabbing touch-none hover:bg-accent"
            aria-hidden="true"
            data-testid="plan-entry-drag-handle"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          {recipe && (
            <Badge className="text-[10px] px-1 py-0 bg-primary/15 text-foreground border-0 font-medium shrink-0 hover:bg-primary/15">
              {t("planner.grid.recipe", { defaultValue: "Recipe" })}
            </Badge>
          )}
          {showKidBadge && entryKid && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
              {entryKid.name}
            </Badge>
          )}
          <span className="ml-auto" />
          {recipe && (
            <button
              type="button"
              onClick={(e) => onToggleRecipeExpand(recipe.id, e)}
              className="inline-flex min-h-6 min-w-6 items-center justify-center hover:bg-accent rounded-md transition-colors shrink-0"
              aria-label={t("planner.grid.toggleIngredients", { defaultValue: "Show ingredients for {{name}}", name })}
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
            </button>
          )}
          {itemMenu}
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs font-medium text-foreground line-clamp-3 leading-tight hyphens-auto" data-testid="plan-entry-name">
                {name}
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="font-semibold">{name}</p>
              {recipe ? (
                <>
                  {recipe.description && <p className="text-xs text-muted-foreground">{recipe.description}</p>}
                  <p className="text-xs mt-1">
                    {t("planner.grid.ingredientCount", {
                      defaultValue: "{{count}} ingredients",
                      count: recipe.food_ids?.length || 0,
                    })}
                  </p>
                </>
              ) : (
                <p className="text-xs">
                  {t("planner.grid.stock", {
                    defaultValue: "Stock: {{qty}} {{unit}}",
                    qty: food?.quantity || 0,
                    unit: food?.unit || "servings",
                  })}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {!isDragging && (
          <div className="flex flex-wrap items-center gap-1">
            {fit && <KidFitSignals fit={fit} kidName={entryKid?.name ?? ""} />}
            {result && <ResultPill result={result as PlanResult} />}
            {isOutOfStock && (
              <span className="inline-flex min-h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
                data-testid="plan-entry-need-to-buy">
                <ShoppingCart className="h-3 w-3" aria-hidden="true" />
                {t("planner.grid.needToBuy", { defaultValue: "Need to buy" })}
              </span>
            )}
            {isLowStock && (
              <span className="inline-flex min-h-6 items-center gap-1 rounded-md bg-warning/15 px-1.5 text-[10px] font-medium text-foreground">
                <AlertTriangle className="h-3 w-3 text-warning" aria-hidden="true" />
                {t("planner.grid.lowStock", { defaultValue: "Low" })}
              </span>
            )}
            {/* US-290: N missing -- opens the missing-ingredients dialog. */}
            {missingCount > 0 && onOpenMissingForRecipe && entry.recipe_id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  analytics.trackEvent("plan_entry_missing_chip_tapped", {
                    recipe_id: entry.recipe_id,
                    missing_count: missingCount,
                  });
                  onOpenMissingForRecipe(entry.recipe_id!);
                }}
                className="inline-flex min-h-6 items-center gap-1 rounded-md bg-warning/15 px-1.5 text-[10px] font-medium text-foreground hover:bg-warning/25 transition-colors"
                aria-label={t("planner.grid.missingLabel", {
                  defaultValue: "{{count}} ingredients to buy, open list",
                  count: missingCount,
                })}
                data-testid="plan-entry-missing-chip"
              >
                <ShoppingCart className="h-3 w-3 text-warning" aria-hidden="true" />
                {t("planner.grid.missing", { defaultValue: "{{count}} to buy", count: missingCount })}
              </button>
            )}
            {/* US-298: variety-fatigue chip. */}
            {fatigueChipVisible && (
              onOpenTwist ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTwist(entry);
                  }}
                  className="inline-flex min-h-6 items-center gap-1 rounded-md bg-warning/15 px-1.5 text-[10px] font-medium text-foreground hover:bg-warning/25 transition-colors"
                  title={t("planner.grid.fatigueTitle", {
                    defaultValue: "Made {{count}}x in the last 3 weeks, try a twist?",
                    count: fatigue!.count,
                  })}
                  aria-label={t("planner.grid.fatigueLabel", {
                    defaultValue: "Made {{count}} times, pick a twist",
                    count: fatigue!.count,
                  })}
                  data-testid="plan-entry-variety-chip"
                >
                  <Repeat className="h-3 w-3 text-warning" aria-hidden="true" />
                  {fatigue!.count}x
                </button>
              ) : (
                <span
                  className="inline-flex min-h-6 items-center gap-1 rounded-md bg-warning/15 px-1.5 text-[10px] font-medium text-foreground"
                  title={t("planner.grid.fatigueTitleStatic", {
                    defaultValue: "Made {{count}}x in the last 3 weeks",
                    count: fatigue!.count,
                  })}
                  data-testid="plan-entry-variety-chip"
                >
                  <Repeat className="h-3 w-3 text-warning" aria-hidden="true" />
                  {fatigue!.count}x
                </span>
              )
            )}
          </div>
        )}
      </div>

      {!isDragging && recipe && isExpanded && ingredientFoods.length > 0 && (
        <ul className="px-2 pb-2 space-y-1">
          {ingredientFoods.map((f) => {
            const out = (f.quantity || 0) === 0;
            const low = !out && (f.quantity || 0) <= 2;
            return (
              <li key={f.id} className="px-2 py-1 rounded-md text-[11px] flex items-center justify-between gap-1 bg-muted/60 text-foreground">
                <span className="truncate">{f.name}</span>
                {out && (
                  <span className="inline-flex items-center gap-0.5 text-muted-foreground shrink-0">
                    <ShoppingCart className="h-3 w-3" aria-hidden="true" />
                    {t("planner.grid.needToBuy", { defaultValue: "Need to buy" })}
                  </span>
                )}
                {low && (
                  <span className="inline-flex items-center gap-0.5 text-muted-foreground shrink-0">
                    <AlertTriangle className="h-3 w-3 text-warning" aria-hidden="true" />
                    {t("planner.grid.lowStock", { defaultValue: "Low" })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* The week grid                                                             */
/* ------------------------------------------------------------------------ */

const EMPTY_ENTRIES: PlanEntry[] = [];

export const GSAPCalendarMealPlanner = memo(function GSAPCalendarMealPlanner({
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
  onOpenFoodSelector,
  onCopyToChild,
  onCopyWeek,
  onClearWeek,
  onOpenMissingForRecipe,
  onDeleteEntries,
  onMarkResult,
  onMoveEntries,
  onPushWeekToGrocery,
  onReplaceRecipeInSlot,
  onOpenSaveTemplate,
  onOpenTemplateGallery,
}: GSAPCalendarMealPlannerProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set());
  const [showAllKids, setShowAllKids] = useState(false);
  const nutritionData = useTrustedNutritionCatalog();
  const nutritionByName = useMemo(() => indexNutritionByName(nutritionData), [nutritionData]);

  // Only used when the page does not own a PlannerTemplatesController.
  const [ownSaveOpen, setOwnSaveOpen] = useState(false);
  const [ownGalleryOpen, setOwnGalleryOpen] = useState(false);
  const ownsTemplates = !onOpenSaveTemplate && !onOpenTemplateGallery;

  // US-298: the entry the twist sheet was opened from.
  const [twistContext, setTwistContext] = useState<PlanEntry | null>(null);
  const { enabled: varietyNudgesEnabled } = useVarietyNudgePref();

  // Read by handleMoveEntry, so a realtime tick does not give it (and every
  // Draggable that depends on it) a new identity.
  const planEntriesRef = useRef(planEntries);
  planEntriesRef.current = planEntries;

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const kidById = useMemo(() => new Map(kids.map((k) => [k.id, k])), [kids]);
  /** Siblings per kid, stable across renders so memo(DraggableMealItem) holds. */
  const otherKidsById = useMemo(
    () => new Map(kids.map((k) => [k.id, kids.filter((o) => o.id !== k.id)])),
    [kids]
  );

  const days = useMemo<DayInfo[]>(() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    return Array.from({ length: DAYS_IN_WEEK }, (_, i) => {
      const date = addDays(weekStart, i);
      const key = format(date, "yyyy-MM-dd");
      return {
        date: key,
        label: format(date, "EEE"),
        longLabel: format(date, "EEEE, MMM d"),
        dayNum: format(date, "d"),
        month: format(date, "MMM"),
        isToday: key === todayKey,
      };
    });
  }, [weekStart]);

  /// US-298: fatigue per recipe for THIS grid's kid, counting servings (not
  /// ingredient rows) and ignoring meals that have not happened yet.
  const fatigueByRecipeId = useMemo(() => {
    if (!varietyNudgesEnabled) return new Map<string, RecipeFatigue>();
    return fatigueByRecipe(planEntries, kidId, format(new Date(), "yyyy-MM-dd"), FATIGUE_LOOKBACK_DAYS);
  }, [planEntries, varietyNudgesEnabled, kidId]);

  /** Logged rows per kid, the history kid-fit reads. */
  const historyByKid = useMemo(() => {
    const out = new Map<string, PlanEntry[]>();
    for (const e of planEntries) {
      if (!e.result) continue;
      const list = out.get(e.kid_id);
      if (list) list.push(e);
      else out.set(e.kid_id, [e]);
    }
    return out;
  }, [planEntries]);

  /**
   * One pass over planEntries per render instead of a filter per cell: the
   * visible week bucketed by `${date}|${slot}`, with a recipe's rows for one
   * kid collapsed to one item whose groupIds carry every row.
   */
  const { buckets, groupIdsByEntry } = useMemo(() => {
    const weekDates = new Set(days.map((d) => d.date));
    const visibleKids = showAllKids ? new Set(kids.map((k) => k.id)) : new Set([kidId]);
    const buckets = new Map<string, PlanEntry[]>();
    const groupIdsByEntry = new Map<string, string[]>();
    const recipeRep = new Map<string, string>();
    for (const e of planEntries) {
      if (!weekDates.has(e.date) || !visibleKids.has(e.kid_id)) continue;
      const cell = `${e.date}|${e.meal_slot}`;
      if (e.recipe_id) {
        const groupKey = `${cell}|${e.recipe_id}|${e.kid_id}`;
        const rep = recipeRep.get(groupKey);
        if (rep) {
          groupIdsByEntry.get(rep)!.push(e.id);
          continue;
        }
        recipeRep.set(groupKey, e.id);
      }
      groupIdsByEntry.set(e.id, [e.id]);
      const list = buckets.get(cell);
      if (list) list.push(e);
      else buckets.set(cell, [e]);
    }
    return { buckets, groupIdsByEntry };
  }, [planEntries, days, showAllKids, kids, kidId]);

  const toggleRecipeExpand = useCallback((recipeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRecipes((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  }, []);

  /**
   * Move an item: every row of a recipe for THIS kid, date and slot, in one
   * write. The recipe filter had no kid check, so moving Emma's dinner also
   * moved her brother's copy of it; and it issued one update per ingredient.
   */
  const handleMoveEntry = useCallback(
    (entryId: string, targetDate: string, targetSlot: MealSlot) => {
      const all = planEntriesRef.current;
      const entry = all.find((e) => e.id === entryId);
      if (!entry) return;
      const ids = entry.recipe_id
        ? all
            .filter(
              (e) =>
                e.recipe_id === entry.recipe_id &&
                e.kid_id === entry.kid_id &&
                e.date === entry.date &&
                e.meal_slot === entry.meal_slot
            )
            .map((e) => e.id)
        : [entry.id];
      if (onMoveEntries) {
        onMoveEntries(ids, targetDate, targetSlot);
      } else if (onUpdateEntry) {
        for (const id of ids) onUpdateEntry(id, { date: targetDate, meal_slot: targetSlot });
      }
    },
    [onMoveEntries, onUpdateEntry]
  );

  const openTwist = useCallback((entry: PlanEntry) => {
    if (entry.recipe_id) setTwistContext(entry);
  }, []);
  const twistEnabled = !!onReplaceRecipeInSlot;

  const twistOriginal = twistContext?.recipe_id ? recipeById.get(twistContext.recipe_id) ?? null : null;
  const twistKid = twistContext ? kidById.get(twistContext.kid_id) ?? null : null;
  const fatigueScoreFor = useCallback((id: string) => fatigueByRecipeId.get(id)?.score ?? 0, [fatigueByRecipeId]);

  const openSave = onOpenSaveTemplate ?? (() => setOwnSaveOpen(true));
  const openGallery = onOpenTemplateGallery ?? (() => setOwnGalleryOpen(true));

  const slotLabel = (slot: MealSlot, fallback: string) => t(`planner.slots.${slot}`, { defaultValue: fallback });

  return (
    <div ref={containerRef} className="gsap-calendar-planner relative space-y-4">
      {/* Week actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-card border rounded-xl">
        <div className="flex items-center gap-2 flex-wrap">
          {onPushWeekToGrocery && (
            <Button size="sm" onClick={onPushWeekToGrocery} data-testid="planner-push-week">
              <ListPlus className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("planner.grid.pushWeek", { defaultValue: "Add week to list" })}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={openGallery}>
            <BookTemplate className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("planner.grid.useTemplate", { defaultValue: "Use template" })}
          </Button>
          <Button variant="outline" size="sm" onClick={openSave}>
            <Save className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("planner.grid.saveTemplate", { defaultValue: "Save as template" })}
          </Button>

          {(onCopyWeek || onClearWeek) && <div className="h-6 w-px bg-border mx-1" aria-hidden="true" />}

          {onCopyWeek && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopyWeek(format(addDays(weekStart, 7), "yyyy-MM-dd"), kidId)}
            >
              <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("planner.grid.copyWeek", { defaultValue: "Copy to next week" })}
            </Button>
          )}
          {onClearWeek && (
            <Button variant="outline" size="sm" onClick={() => onClearWeek(kidId)}>
              <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("planner.grid.clearWeek", { defaultValue: "Clear week" })}
            </Button>
          )}
        </div>

        {kids.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAllKids((v) => !v)}
            aria-pressed={showAllKids}
            className={showAllKids ? "bg-primary/10 border-primary/30" : ""}
          >
            <Users className="h-4 w-4 mr-2" aria-hidden="true" />
            {showAllKids
              ? t("planner.grid.showActiveOnly", { defaultValue: "Show {{name}} only", name: kidName })
              : t("planner.grid.showAll", { defaultValue: "Show all children" })}
          </Button>
        )}
      </div>

      {/* Daily macros, one per column so they line up with the grid */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-8 gap-3 min-w-[1000px] px-4">
          <div aria-hidden="true" />
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
              nutritionByName={nutritionByName}
            />
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <div
          className="min-w-[1000px] p-4"
          role="table"
          aria-label={t("planner.grid.tableLabel", { defaultValue: "Meal plan for {{name}}", name: kidName })}
        >
          <div className="grid grid-cols-8 gap-3 mb-3" role="row">
            <div
              role="columnheader"
              className="text-sm font-semibold text-muted-foreground flex items-center justify-center"
            >
              {t("planner.grid.meals", { defaultValue: "Meals" })}
            </div>
            {days.map((day) => (
              <div
                key={day.date}
                role="columnheader"
                aria-current={day.isToday ? "date" : undefined}
                className={cn(
                  "text-center p-2 rounded-xl transition-colors",
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

          {MEAL_SLOTS.map(({ slot, label }) => {
            const slotName = slotLabel(slot, label);
            return (
              <div key={slot} className="grid grid-cols-8 gap-3 mb-3" role="row">
                <div
                  role="rowheader"
                  className="flex items-center justify-center gap-1.5 rounded-xl p-3 border bg-muted/30"
                >
                  <span className="text-sm font-semibold text-foreground">{slotName}</span>
                  {slot === "try_bite" && <Sparkles className="h-4 w-4 text-try-bite" aria-hidden="true" />}
                </div>

                {days.map((day) => {
                  const entries = buckets.get(`${day.date}|${slot}`) ?? EMPTY_ENTRIES;
                  const addLabel = t("planner.grid.addLabel", {
                    defaultValue: "Add {{slot}} for {{day}}",
                    slot: slotName.toLowerCase(),
                    day: day.longLabel,
                  });

                  return (
                    <div
                      key={day.date}
                      role="cell"
                      data-cell-date={day.date}
                      data-cell-slot={slot}
                      className={cn(
                        "min-h-[90px] rounded-xl border border-dashed p-2 transition-colors bg-muted/30",
                        entries.length > 0 ? "border-border" : "border-border/60",
                        "hover:border-primary/40 group"
                      )}
                    >
                      {entries.length > 0 ? (
                        <div className="space-y-2">
                          {entries.map((entry) => {
                            const entryKid = kidById.get(entry.kid_id);
                            return (
                              <DraggableMealItem
                                key={entry.id}
                                entry={entry}
                                groupIds={groupIdsByEntry.get(entry.id) ?? [entry.id]}
                                food={foodById.get(entry.food_id)}
                                recipe={entry.recipe_id ? recipeById.get(entry.recipe_id) : undefined}
                                entryKid={entryKid}
                                otherKids={otherKidsById.get(entry.kid_id) ?? kids}
                                foods={foods}
                                foodById={foodById}
                                kidHistory={historyByKid.get(entry.kid_id) ?? EMPTY_ENTRIES}
                                showKidBadge={showAllKids}
                                isExpanded={!!entry.recipe_id && expandedRecipes.has(entry.recipe_id)}
                                days={days}
                                reducedMotion={reducedMotion}
                                onToggleRecipeExpand={toggleRecipeExpand}
                                onCopyToChild={onCopyToChild}
                                containerRef={containerRef}
                                onMoveEntry={handleMoveEntry}
                                onOpenMissingForRecipe={onOpenMissingForRecipe}
                                onDeleteEntries={onDeleteEntries}
                                onMarkResult={onMarkResult}
                                fatigue={
                                  entry.recipe_id && entry.kid_id === kidId
                                    ? fatigueByRecipeId.get(entry.recipe_id)
                                    : undefined
                                }
                                onOpenTwist={twistEnabled ? openTwist : undefined}
                              />
                            );
                          })}

                          {kids.length > 0 && (
                            <VoteResultsDisplay
                              mealDate={day.date}
                              mealSlot={slot}
                              kids={kids}
                              compact={true}
                              className="mt-1"
                            />
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenFoodSelector(day.date, slot, kidId);
                            }}
                            aria-label={addLabel}
                            className="w-full min-h-6 py-1 rounded-lg border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors text-xs font-medium flex items-center justify-center gap-1"
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                            {t("planner.grid.addMore", { defaultValue: "Add more" })}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenFoodSelector(day.date, slot, kidId)}
                          aria-label={addLabel}
                          className="flex items-center justify-center h-full min-h-[72px] w-full text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                        >
                          <span className="flex flex-col items-center gap-1">
                            <Plus
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity"
                              aria-hidden="true"
                            />
                            <span className="text-xs font-medium">{t("planner.grid.addMeal", { defaultValue: "Add meal" })}</span>
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {ownsTemplates && (
        <PlannerTemplatesController
          kids={kids}
          activeKidId={kidId}
          weekStart={weekStart}
          saveOpen={ownSaveOpen}
          onSaveOpenChange={setOwnSaveOpen}
          galleryOpen={ownGalleryOpen}
          onGalleryOpenChange={setOwnGalleryOpen}
          onApplied={(start) => logger.info("Template applied", { start })}
        />
      )}

      {/* US-298: "Twist this meal". Swaps the recipe for the whole slot for
          this kid, not the recipe_id on one ingredient row. */}
      {twistEnabled && (
        <TwistMealSheet
          open={twistContext !== null}
          onOpenChange={(next) => {
            if (!next) setTwistContext(null);
          }}
          original={twistOriginal}
          recipes={recipes}
          foods={foods}
          kid={twistKid}
          fatigueScoreFor={fatigueScoreFor}
          onSwap={(newRecipeId) => {
            if (!twistContext?.recipe_id || !onReplaceRecipeInSlot) return;
            onReplaceRecipeInSlot(
              twistContext.kid_id,
              twistContext.date,
              twistContext.meal_slot,
              twistContext.recipe_id,
              newRecipeId
            );
          }}
        />
      )}
    </div>
  );
});
