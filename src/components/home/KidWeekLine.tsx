import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFoods, useKids, usePlan } from "@/contexts/AppContext";
import { useKidsProgressSummary } from "@/hooks/useKidsProgressSummary";
import { selectTargetKids, useTodayKey } from "@/hooks/useTonightPlan";
import { buildProgressByKid } from "@/lib/kidProgress";
import { currentStreak } from "@/lib/streakRules";
import "@/i18n/appLocale";

/**
 * One plain line per kid about the last seven days, plus the food they are
 * furthest along with on the exposure ladder, and the logging streak when
 * there is one (the shared rule in streakRules.ts, same as ProgressDashboard). No tiles, charts or animation:
 * this sits at the bottom of the home screen and should read in a glance.
 */
export const KidWeekLine = memo(function KidWeekLine() {
  const { t } = useTranslation();
  const { kids, activeKidId, setActiveKid } = useKids();
  const { planEntries } = usePlan();
  const { foods } = useFoods();
  const todayKey = useTodayKey();

  const targetKids = useMemo(() => selectTargetKids(kids, activeKidId), [kids, activeKidId]);
  const kidIds = useMemo(() => targetKids.map((k) => k.id), [targetKids]);
  const { ladderRows, attempts } = useKidsProgressSummary(kidIds);
  const foodNames = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);

  const progress = useMemo(
    () => buildProgressByKid(targetKids, planEntries, todayKey, ladderRows, attempts, foodNames),
    [targetKids, planEntries, todayKey, ladderRows, attempts, foodNames],
  );

  if (targetKids.length === 0) return null;

  return (
    <section aria-labelledby="home-week-heading" className="px-1">
      <h2 id="home-week-heading" className="text-base font-semibold">
        {t("home.week.title", { defaultValue: "This week" })}
      </h2>
      <ul className="mt-1 space-y-1.5">
        {targetKids.map((kid) => {
          const p = progress.get(kid.id);
          const parts: string[] = [];
          const streak = currentStreak(planEntries, kid.id, { todayKey });
          if (streak > 0) parts.push(t("home.week.streak", { defaultValue: "{{count}} days logged in a row", count: streak }));
          if (p?.newFoodsTried) parts.push(t("home.week.tried", { defaultValue: "Tried {{count}} new foods", count: p.newFoodsTried }));
          if (p?.ate) parts.push(t("home.week.ate", { defaultValue: "{{count}} ate", count: p.ate }));
          if (p?.tasted) parts.push(t("home.week.tasted", { defaultValue: "{{count}} tasted", count: p.tasted }));
          if (p?.refused) parts.push(t("home.week.refused", { defaultValue: "{{count}} refused", count: p.refused }));
          const ladder = p?.activeLadder[0];
          return (
            <li key={kid.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium">{kid.name}</span>
              <span className="text-muted-foreground">
                {parts.length > 0
                  ? parts.join(" · ")
                  : t("home.week.nothing", { defaultValue: "Nothing logged in the last 7 days" })}
              </span>
              {ladder && (
                <Link
                  to={`/dashboard/food-tracker?food=${encodeURIComponent(ladder.foodId)}`}
                  onClick={() => setActiveKid(kid.id)}
                  className="inline-flex min-h-8 items-center rounded-full border border-try-bite/30 bg-try-bite/10 px-2.5 text-xs text-foreground"
                >
                  {t("home.week.ladder", {
                    defaultValue: "Working on {{food}}",
                    food: ladder.foodName ?? t("home.week.aFood", { defaultValue: "a food" }),
                  })}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
});
