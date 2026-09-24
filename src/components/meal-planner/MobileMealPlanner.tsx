import { useState, useCallback, useMemo, useEffect, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import { addDays, addWeeks } from "date-fns";
import { Button } from "@/components/ui/button";
import { Food, Kid, MealSlot, PlanEntry, Recipe } from "@/types";
import type { SlotTarget } from "@/contexts/PlanContext";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Loader2,
  MoreHorizontal,
  Copy,
  Trash2,
  Save,
  BookTemplate,
  ShoppingCart,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { groupSlot, kidsOnFamilyMeal, type FamilyTarget } from "@/lib/familySlot";
import { isoDay, todayIndex, weekdayIndex } from "@/lib/mobilePlannerDay";
import { WeekStrip } from "./WeekStrip";
import { FamilyMealCard, type MealOutcome } from "./FamilyMealCard";
import { MealQuickAddDrawer, MealQuickAddContext } from "./MealQuickAddDrawer";
import "@/i18n/appLocale";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
  { slot: "snack1", label: "Snack 1" },
  { slot: "snack2", label: "Snack 2" },
  { slot: "try_bite", label: "Try Bite" },
];

const EMPTY: PlanEntry[] = [];
const PANEL_ID = "planner-day-panel";
const TAB_PREFIX = "planner-day";

function toSlotTarget(target: FamilyTarget): SlotTarget {
  return target.kind === "recipe" ? { recipeId: target.id } : { foodId: target.id };
}

interface MobileMealPlannerProps {
  weekStart: Date;
  planEntries: PlanEntry[];
  foods: Food[];
  recipes: Recipe[];
  kids: Kid[];
  activeKidId: string | null;
  isGeneratingPlan: boolean;
  /** Plain add into an empty slot for one kid. */
  onAddEntry: (kidId: string, date: string, slot: MealSlot, foodId: string) => void;
  /** Kept for callers; every change now goes through onReplaceSlot. */
  onUpdateEntry?: (entryId: string, updates: Partial<PlanEntry>) => void;
  /** One call for every kid, so one allergen check and one toast. */
  onSelectRecipeForKids: (recipeId: string, date: string, slot: MealSlot, kidIds: string[]) => void;
  onDeleteEntries: (ids: string[]) => void;
  /** Empty (kid, date, slot) for each kid and put one food or recipe there. */
  onReplaceSlot: (kidIds: string[], date: string, slot: MealSlot, target: SlotTarget) => void;
  onPushWeekToGrocery?: () => void;
  onMarkResult: (entry: PlanEntry, result: MealOutcome) => void;
  onBuildWeek: () => void;
  onAIGenerate: () => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onCopyWeek?: (toDate: string, kidId?: string) => void;
  onClearWeek?: (kidId?: string) => void;
  onOpenTemplateGallery?: () => void;
  onSaveTemplate?: () => void;
}

export const MobileMealPlanner = memo(function MobileMealPlanner({
  weekStart,
  planEntries,
  foods,
  recipes,
  kids,
  activeKidId,
  isGeneratingPlan,
  onAddEntry,
  onSelectRecipeForKids,
  onDeleteEntries,
  onReplaceSlot,
  onPushWeekToGrocery,
  onMarkResult,
  onBuildWeek,
  onAIGenerate,
  onPreviousWeek,
  onNextWeek,
  onThisWeek,
  onCopyWeek,
  onClearWeek,
  onOpenTemplateGallery,
  onSaveTemplate,
}: MobileMealPlannerProps) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();

  const [today, setToday] = useState(() => isoDay(new Date()));
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => Math.max(todayIndex(weekStart), 0));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerContext, setDrawerContext] = useState<MealQuickAddContext | null>(null);

  const singleKidMode = activeKidId !== null;
  const selectedDate = isoDay(addDays(weekStart, selectedDayIndex));
  const weekStartIso = isoDay(weekStart);
  const weekEndIso = isoDay(addDays(weekStart, 6));
  const isCurrentWeek = today >= weekStartIso && today <= weekEndIso;

  // A tab left open overnight wakes up on a new day: move "today" (and the
  // selection, if it was sitting on the old today) instead of logging
  // yesterday's dinner against the wrong date.
  const selectionRef = useRef({ selectedDayIndex, weekStart, today });
  selectionRef.current = { selectedDayIndex, weekStart, today };
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = new Date();
      const next = isoDay(now);
      const cur = selectionRef.current;
      if (next === cur.today) return;
      const wasOnToday = isoDay(addDays(cur.weekStart, cur.selectedDayIndex)) === cur.today;
      setToday(next);
      const idx = todayIndex(cur.weekStart, now);
      if (wasOnToday && idx >= 0) setSelectedDayIndex(idx);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const handleThisWeek = useCallback(() => {
    onThisWeek();
    // Weeks all start on the same weekday, so today's index is known before
    // the parent's new weekStart arrives.
    setSelectedDayIndex(weekdayIndex(weekStart, new Date()));
  }, [onThisWeek, weekStart]);

  const handleToday = useCallback(() => {
    const idx = todayIndex(weekStart);
    if (idx >= 0) setSelectedDayIndex(idx);
  }, [weekStart]);

  // Swipe between days
  const swipeRef = useSwipeGesture({
    onSwipeLeft: () => {
      if (selectedDayIndex < 6) {
        setSelectedDayIndex(selectedDayIndex + 1);
      } else {
        onNextWeek();
        setSelectedDayIndex(0);
      }
    },
    onSwipeRight: () => {
      if (selectedDayIndex > 0) {
        setSelectedDayIndex(selectedDayIndex - 1);
      } else {
        onPreviousWeek();
        setSelectedDayIndex(6);
      }
    },
    threshold: 60,
    preventDefaultTouchmoveEvent: true,
  });

  // One pass over the plan for the selected day, one array per slot. An empty
  // slot gets the same EMPTY array every render so its card's memo() holds.
  const slotEntries = useMemo(() => {
    const map = new Map<MealSlot, PlanEntry[]>();
    for (const e of planEntries) {
      if (e.date !== selectedDate) continue;
      if (singleKidMode && e.kid_id !== activeKidId) continue;
      const list = map.get(e.meal_slot);
      if (list) list.push(e);
      else map.set(e.meal_slot, [e]);
    }
    return map;
  }, [planEntries, selectedDate, singleKidMode, activeKidId]);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  // Handlers read the latest plan through refs so they keep one identity and
  // the cards' memo() is not defeated by a new closure per render.
  const latest = useRef({ planEntries, slotEntries, kids, singleKidMode, activeKidId });
  latest.current = { planEntries, slotEntries, kids, singleKidMode, activeKidId };

  const rowsFor = useCallback((date: string, slot: MealSlot, kidIds: readonly string[]) => {
    const set = new Set(kidIds);
    return latest.current.planEntries.filter(
      (e) => e.date === date && e.meal_slot === slot && set.has(e.kid_id),
    );
  }, []);

  // --- Drawer openers ---

  const handleTapAdd = useCallback((date: string, slot: MealSlot, kidId?: string) => {
    const { singleKidMode: single, activeKidId: active } = latest.current;
    setDrawerContext({
      date,
      slot,
      kidId: kidId ?? (single && active ? active : undefined),
      mode: "add",
    });
    setDrawerOpen(true);
  }, []);

  const handleTapChangeFamilyMeal = useCallback((date: string, slot: MealSlot) => {
    const { singleKidMode: single, activeKidId: active, kids: allKids, planEntries: all } = latest.current;
    if (single && active) {
      setDrawerContext({ date, slot, kidId: active, mode: "change" });
    } else {
      const group = groupSlot(all.filter((e) => e.date === date && e.meal_slot === slot));
      const ids = allKids.map((k) => k.id);
      // Change what the family is eating; a kid on a substitute keeps it.
      const onFamily = kidsOnFamilyMeal(group, ids);
      setDrawerContext({
        date,
        slot,
        kidId: allKids.length === 1 ? allKids[0].id : undefined,
        kidIds: onFamily.length > 0 ? onFamily : ids,
        familyTarget: group.familyTarget ?? undefined,
        mode: "change",
      });
    }
    setDrawerOpen(true);
  }, []);

  const handleTapKidSubstitute = useCallback((date: string, slot: MealSlot, kidId: string) => {
    const group = groupSlot(
      latest.current.planEntries.filter((e) => e.date === date && e.meal_slot === slot),
    );
    setDrawerContext({
      date,
      slot,
      kidId,
      familyTarget: group.familyTarget ?? undefined,
      mode: "substitute",
    });
    setDrawerOpen(true);
  }, []);

  // --- Drawer results ---

  const handleDrawerSelectFood = useCallback(
    (foodId: string, context: MealQuickAddContext, kidIds: string[]) => {
      if (kidIds.length === 0) return;
      const existing = rowsFor(context.date, context.slot, kidIds);
      if (kidIds.length === 1 && existing.length === 0) {
        onAddEntry(kidIds[0], context.date, context.slot, foodId);
        return;
      }
      onReplaceSlot(kidIds, context.date, context.slot, { foodId });
    },
    [rowsFor, onAddEntry, onReplaceSlot],
  );

  const handleDrawerSelectRecipe = useCallback(
    (recipeId: string, context: MealQuickAddContext, kidIds: string[]) => {
      if (kidIds.length === 0) return;
      if (rowsFor(context.date, context.slot, kidIds).length === 0) {
        onSelectRecipeForKids(recipeId, context.date, context.slot, kidIds);
        return;
      }
      onReplaceSlot(kidIds, context.date, context.slot, { recipeId });
    },
    [rowsFor, onSelectRecipeForKids, onReplaceSlot],
  );

  // "Eat with family": put the kid back on the family dish, recipe and all.
  const handleEatWithFamily = useCallback(
    (context: MealQuickAddContext) => {
      if (!context.kidId || !context.familyTarget) return;
      onReplaceSlot([context.kidId], context.date, context.slot, toSlotTarget(context.familyTarget));
    },
    [onReplaceSlot],
  );

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) setDrawerContext(null);
  }, []);

  const handlePushWeek = useCallback(() => onPushWeekToGrocery?.(), [onPushWeekToGrocery]);

  const locale = i18n.language || undefined;
  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric" }),
    [locale],
  );
  const shortFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }), [locale]);
  const selectedDayLabel = dayFmt.format(addDays(weekStart, selectedDayIndex));
  const weekRangeLabel = `${shortFmt.format(weekStart)} - ${shortFmt.format(addDays(weekStart, 6))}`;

  const press = reduceMotion ? "" : "transition-transform active:scale-95";
  const kidForWeekOps = activeKidId ?? undefined;

  return (
    <div className="space-y-4">
      {/* Week header with navigation */}
      <div className="flex items-center justify-between px-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPreviousWeek}
          aria-label={t("planner.mobile.previousWeek", { defaultValue: "Previous week" })}
          className="min-h-11 min-w-11"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-bold text-foreground">{weekRangeLabel}</p>
          {isCurrentWeek ? (
            <button
              type="button"
              onClick={handleToday}
              className={cn(
                "min-h-8 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15",
                press,
              )}
            >
              {t("planner.mobile.today", { defaultValue: "Today" })}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleThisWeek}
              className={cn("min-h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-muted", press)}
            >
              {t("planner.mobile.tapForThisWeek", { defaultValue: "Tap for this week" })}
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNextWeek}
          aria-label={t("planner.mobile.nextWeek", { defaultValue: "Next week" })}
          className="min-h-11 min-w-11"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <WeekStrip
        weekStart={weekStart}
        selectedDayIndex={selectedDayIndex}
        onSelectDay={setSelectedDayIndex}
        planEntries={planEntries}
        kids={kids}
        activeKidId={activeKidId}
        today={today}
        panelId={PANEL_ID}
        tabIdPrefix={TAB_PREFIX}
      />

      {/* Action buttons */}
      <div className="flex gap-2 px-1">
        <Button onClick={onAIGenerate} size="sm" className="flex-1 min-h-11" disabled={isGeneratingPlan}>
          {isGeneratingPlan ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              {t("planner.mobile.generating", { defaultValue: "Generating..." })}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {t("planner.mobile.aiPlan", { defaultValue: "AI Plan" })}
            </>
          )}
        </Button>
        <Button onClick={onBuildWeek} variant="outline" size="sm" className="flex-1 min-h-11">
          <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {t("planner.mobile.quickBuild", { defaultValue: "Quick Build" })}
        </Button>
        {onPushWeekToGrocery && (
          <Button
            onClick={handlePushWeek}
            variant="outline"
            size="sm"
            className="flex-1 min-h-11"
            aria-label={t("planner.mobile.shopThisWeek", { defaultValue: "Shop this week" })}
          >
            <ShoppingCart className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {t("planner.mobile.shop", { defaultValue: "Shop" })}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11 shrink-0"
              aria-label={t("planner.mobile.moreOptions", { defaultValue: "More options" })}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onOpenTemplateGallery && (
              <DropdownMenuItem onClick={onOpenTemplateGallery}>
                <BookTemplate className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("planner.mobile.useTemplate", { defaultValue: "Use Template" })}
              </DropdownMenuItem>
            )}
            {onSaveTemplate && (
              <DropdownMenuItem onClick={onSaveTemplate}>
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("planner.mobile.saveTemplate", { defaultValue: "Save as Template" })}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {onCopyWeek && (
              <DropdownMenuItem onClick={() => onCopyWeek(isoDay(addWeeks(weekStart, 1)), kidForWeekOps)}>
                <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("planner.mobile.copyNextWeek", { defaultValue: "Copy to Next Week" })}
              </DropdownMenuItem>
            )}
            {onClearWeek && (
              <DropdownMenuItem onClick={() => onClearWeek(kidForWeekOps)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("planner.mobile.clearWeek", { defaultValue: "Clear Week" })}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-1">
        <h2 className="text-lg font-bold text-foreground">{selectedDayLabel}</h2>
      </div>

      {/* Meal cards - swipeable area */}
      <div
        ref={swipeRef}
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${TAB_PREFIX}-${selectedDayIndex}`}
        className="space-y-3 px-1 pb-24"
      >
        {MEAL_SLOTS.map(({ slot, label }) => (
          <FamilyMealCard
            key={slot}
            slot={slot}
            label={t(`planner.mobile.slot.${slot}`, { defaultValue: label })}
            date={selectedDate}
            today={today}
            entries={slotEntries.get(slot) ?? EMPTY}
            kids={kids}
            foodById={foodById}
            recipeById={recipeById}
            singleKidMode={singleKidMode}
            activeKidId={activeKidId}
            onTapAdd={handleTapAdd}
            onTapChangeFamilyMeal={handleTapChangeFamilyMeal}
            onTapKidSubstitute={handleTapKidSubstitute}
            onMarkResult={onMarkResult}
            onDeleteEntries={onDeleteEntries}
            onNeedToBuy={onPushWeekToGrocery ? handlePushWeek : undefined}
          />
        ))}
      </div>

      <MealQuickAddDrawer
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        context={drawerContext}
        foods={foods}
        recipes={recipes}
        kids={kids}
        planEntries={planEntries}
        onSelectFood={handleDrawerSelectFood}
        onSelectRecipeForKids={handleDrawerSelectRecipe}
        onEatWithFamily={handleEatWithFamily}
      />
    </div>
  );
});
