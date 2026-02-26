import { useRef, useEffect, memo, useMemo } from "react";
import { format, addDays, isToday, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { PlanEntry, Kid } from "@/types";

interface WeekStripProps {
  weekStart: Date;
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
  planEntries: PlanEntry[];
  kids: Kid[];
}

export const WeekStrip = memo(function WeekStrip({
  weekStart,
  selectedDayIndex,
  onSelectDay,
  planEntries,
  kids,
}: WeekStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateStr = format(date, "yyyy-MM-dd");
    const entriesForDay = planEntries.filter((e) => e.date === dateStr);
    const hasEntries = entriesForDay.length > 0;
    // Count unique meal slots that have entries
    const filledSlots = new Set(entriesForDay.map((e) => e.meal_slot)).size;

    return {
      date,
      dateStr,
      dayLabel: format(date, "EEE"),
      dayNum: format(date, "d"),
      isToday: isToday(date),
      isSelected: i === selectedDayIndex,
      hasEntries,
      filledSlots,
    };
  }), [weekStart, selectedDayIndex, planEntries]);

  // Scroll selected day into view
  useEffect(() => {
    if (scrollRef.current) {
      const selectedEl = scrollRef.current.children[selectedDayIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [selectedDayIndex]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto scrollbar-hide px-1 py-2"
      role="tablist"
      aria-label="Day selection"
    >
      {days.map((day, index) => (
        <button
          key={day.dateStr}
          role="tab"
          aria-selected={day.isSelected}
          aria-label={`${day.dayLabel} ${day.dayNum}${day.isToday ? ", today" : ""}`}
          onClick={() => onSelectDay(index)}
          className={cn(
            "flex flex-col items-center min-w-[52px] py-2.5 px-3 rounded-2xl transition-all",
            "active:scale-95 select-none",
            day.isSelected
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
              : day.isToday
                ? "bg-primary/10 text-primary"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider">
            {day.dayLabel}
          </span>
          <span className={cn(
            "text-lg font-bold leading-tight",
            day.isSelected ? "text-primary-foreground" : "",
          )}>
            {day.dayNum}
          </span>
          {/* Meal indicator dots */}
          <div className="flex gap-0.5 mt-1 h-1.5">
            {day.hasEntries ? (
              Array.from({ length: Math.min(day.filledSlots, 4) }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    day.isSelected
                      ? "bg-primary-foreground/80"
                      : "bg-primary/60",
                  )}
                />
              ))
            ) : (
              <div className="w-1.5 h-1.5" /> // Spacer to keep layout consistent
            )}
          </div>
        </button>
      ))}
    </div>
  );
});
