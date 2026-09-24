/**
 * Day arithmetic for the phone planner's day view. Pure, so the "which day
 * is today in this week" rule is tested once instead of being re-derived in
 * the component (it used to loop seven format() calls on every mount).
 */

const MS_PER_DAY = 86_400_000;

function localMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Index 0..6 of `now` inside the week starting at `weekStart`, or -1. */
export function todayIndex(weekStart: Date, now: Date = new Date()): number {
  // Round, not floor: a DST switch makes one day 23 or 25 hours long.
  const diff = Math.round((localMidnight(now) - localMidnight(weekStart)) / MS_PER_DAY);
  return diff >= 0 && diff < 7 ? diff : -1;
}

/** Where `now` falls in any week that starts on the same weekday as `weekStart`. */
export function weekdayIndex(weekStart: Date, now: Date = new Date()): number {
  return (now.getDay() - weekStart.getDay() + 7) % 7;
}

/** Local yyyy-MM-dd, the format plan_entries.date uses. */
export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
