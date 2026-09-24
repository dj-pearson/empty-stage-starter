import { useRef, useEffect, memo, useMemo, useCallback, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { PlanEntry, Kid, MealSlot } from "@/types";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { isoDay } from "@/lib/mobilePlannerDay";
import "@/i18n/appLocale";

const SLOTS_PER_DAY = 6;

interface WeekStripProps {
  weekStart: Date;
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
  planEntries: PlanEntry[];
  kids: Kid[];
  /** Count only this kid's meals. Null counts a slot once any kid has it. */
  activeKidId?: string | null;
  /** yyyy-MM-dd of today; recomputed by the parent when the tab wakes. */
  today?: string;
  /** id of the day panel the tabs control. */
  panelId?: string;
  /** Prefix for the tab ids, so the panel can point back at its tab. */
  tabIdPrefix?: string;
}

/**
 * Filled slots per date for one week. One pass over planEntries instead of a
 * filter per day, and keyed on the kid so family mode and a single kid's view
 * do not share a count.
 */
function buildFilledSlots(
  planEntries: readonly PlanEntry[],
  weekStart: Date,
  activeKidId: string | null | undefined,
): Map<string, Set<MealSlot>> {
  const dates = new Set<string>();
  for (let i = 0; i < 7; i++) dates.add(isoDay(addDays(weekStart, i)));
  const map = new Map<string, Set<MealSlot>>();
  for (const e of planEntries) {
    if (!dates.has(e.date)) continue;
    if (activeKidId && e.kid_id !== activeKidId) continue;
    let set = map.get(e.date);
    if (!set) {
      set = new Set<MealSlot>();
      map.set(e.date, set);
    }
    set.add(e.meal_slot);
  }
  return map;
}

export const WeekStrip = memo(function WeekStrip({
  weekStart,
  selectedDayIndex,
  onSelectDay,
  planEntries,
  activeKidId = null,
  today,
  panelId,
  tabIdPrefix = "planner-day",
}: WeekStripProps) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayIso = today ?? isoDay(new Date());

  const filled = useMemo(
    () => buildFilledSlots(planEntries, weekStart, activeKidId),
    [planEntries, weekStart, activeKidId],
  );

  const weekdayFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || undefined, { weekday: "short" }),
    [i18n.language],
  );
  const longFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || undefined, { weekday: "long", month: "long", day: "numeric" }),
    [i18n.language],
  );

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        const dateStr = isoDay(date);
        return {
          dateStr,
          dayLabel: weekdayFmt.format(date),
          longLabel: longFmt.format(date),
          dayNum: format(date, "d"),
          isToday: dateStr === todayIso,
          filledSlots: filled.get(dateStr)?.size ?? 0,
        };
      }),
    [weekStart, filled, todayIso, weekdayFmt, longFmt],
  );

  // Scroll selected day into view
  useEffect(() => {
    const selectedEl = scrollRef.current?.children[selectedDayIndex] as HTMLElement | undefined;
    selectedEl?.scrollIntoView?.({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedDayIndex, reduceMotion]);

  const focusDay = useCallback(
    (index: number) => {
      onSelectDay(index);
      (scrollRef.current?.children[index] as HTMLElement | undefined)?.focus();
    },
    [onSelectDay],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      let next: number | null = null;
      if (e.key === "ArrowRight") next = (index + 1) % 7;
      else if (e.key === "ArrowLeft") next = (index + 6) % 7;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = 6;
      if (next === null) return;
      e.preventDefault();
      focusDay(next);
    },
    [focusDay],
  );

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto scrollbar-hide px-1 py-2"
      role="tablist"
      aria-label={t("planner.mobile.daySelection", { defaultValue: "Day selection" })}
    >
      {days.map((day, index) => {
        const isSelected = index === selectedDayIndex;
        const countLabel = t("planner.mobile.mealsPlanned", {
          defaultValue: "{{filled}} of {{total}} meals planned",
          filled: day.filledSlots,
          total: SLOTS_PER_DAY,
        });
        return (
          <button
            key={day.dateStr}
            id={`${tabIdPrefix}-${index}`}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            aria-label={`${day.longLabel}${
              day.isToday ? `, ${t("planner.mobile.today", { defaultValue: "Today" })}` : ""
            }, ${countLabel}`}
            onClick={() => onSelectDay(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "flex flex-col items-center min-w-[52px] py-2.5 px-3 rounded-2xl select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !reduceMotion && "transition-all active:scale-95",
              isSelected
                ? "bg-primary text-primary-foreground shadow-sm"
                : day.isToday
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="text-xs font-semibold">{day.dayLabel}</span>
            <span className="text-lg font-bold leading-tight">{day.dayNum}</span>
            <span
              aria-hidden="true"
              className={cn(
                "text-xs tabular-nums leading-tight",
                isSelected ? "text-primary-foreground" : day.filledSlots > 0 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {day.filledSlots}/{SLOTS_PER_DAY}
            </span>
          </button>
        );
      })}
    </div>
  );
});
