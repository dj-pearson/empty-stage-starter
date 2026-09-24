import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { useFoods, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useVarietyNudgePref } from "@/hooks/useVarietyNudgePref";
import { SafeFoodInsuranceSection } from "@/components/SafeFoodInsuranceSection";
import { KidBirthdayCard, hasBirthdayToday } from "@/components/KidBirthdayCard";
import { VarietyFatigueBanner, readFatigueDismissal } from "@/components/VarietyFatigueBanner";
import { SeasonalRecallCard, useSeasonalRecall } from "@/components/SeasonalRecallCard";
import { hasFatigue, selectVarietyFatigue } from "@/lib/varietyFatigue";
import "@/i18n/appLocale";

type InsightKind = "safeFood" | "birthday" | "fatigue" | "seasonal";

/**
 * One insight on Home, never a stack of them.
 *
 * Home used to mount five insight cards in a row. On a phone that pushed
 * tonight's dinner off the first screen on exactly the days something was
 * worth saying. This picks the first candidate that has content, in order:
 *
 *   1. a safe food slipping (the one that can cost a family a meal they rely on)
 *   2. a kid's birthday today
 *   3. variety fatigue, with the top repeated meals folded in
 *   4. what worked this week last year
 *
 * Each candidate is decided by a cheap predicate its card module exports, so
 * the cards that lose are never mounted. The one exception is safe-food
 * insurance, whose alerts depend on a fetch: it stays mounted while its flag is
 * on and reports back whether it has anything, and it wins as soon as it does.
 * The seasonal window is only fetched when nothing above it applies.
 */
export function InsightSlot() {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { kids, activeKidId } = useKids();
  const { foods } = useFoods();
  const { planEntries } = usePlan();
  const { recipes } = useRecipes();
  const { enabled: nudgesEnabled } = useVarietyNudgePref();
  const ladderEnabled = useFeatureFlag("exposure_ladder", false);

  // Bumped by any card's dismiss so the predicates re-read storage.
  const [dismissVersion, setDismissVersion] = useState(0);
  const bump = useCallback(() => setDismissVersion((n) => n + 1), []);
  const [safeHasContent, setSafeHasContent] = useState(false);
  const now = useMemo(() => new Date(), []);

  const safeEligible = ladderEnabled && !!activeKidId && foods.some((f) => f.is_safe);
  const safeActive = safeEligible && safeHasContent;

  const birthdayDue = useMemo(() => {
    void dismissVersion;
    return hasBirthdayToday(kids, now, userId);
  }, [kids, now, userId, dismissVersion]);

  const fatigueResult = useMemo(
    () => selectVarietyFatigue(planEntries, recipes, foods),
    [planEntries, recipes, foods],
  );
  const fatigueDue = useMemo(() => {
    void dismissVersion;
    return nudgesEnabled && hasFatigue(fatigueResult, readFatigueDismissal(userId));
  }, [nudgesEnabled, fatigueResult, userId, dismissVersion]);

  const seasonal = useSeasonalRecall(!safeActive && !birthdayDue && !fatigueDue);
  const seasonalDue = seasonal.priorEntries !== null && seasonal.topCandidate !== null;
  const { refreshDismissals: refreshSeasonal } = seasonal;
  const onSeasonalDismiss = useCallback(() => {
    refreshSeasonal();
    bump();
  }, [refreshSeasonal, bump]);

  let active: InsightKind | null = null;
  if (safeActive) active = "safeFood";
  else if (birthdayDue) active = "birthday";
  else if (fatigueDue) active = "fatigue";
  else if (seasonalDue) active = "seasonal";

  if (!safeEligible && active === null) return null;

  return (
    <section
      aria-label={t("home.insights.label", { defaultValue: "Insight" })}
      className={active === null ? "hidden" : "space-y-1"}
      data-insight={active ?? "none"}
    >
      {/* Mounted whenever eligible so it can report; renders nothing until it has alerts. */}
      {safeEligible && (
        <SafeFoodInsuranceSection surface="home" onAvailabilityChange={setSafeHasContent} />
      )}
      {active === "birthday" && <KidBirthdayCard maxKids={1} onDismiss={bump} />}
      {active === "fatigue" && <VarietyFatigueBanner surface="home" showTopMeals onDismiss={bump} />}
      {active === "seasonal" && <SeasonalRecallCard onDismiss={onSeasonalDismiss} />}
      {active !== null && (
        <div className="flex justify-end">
          <Link
            to="/dashboard/insights"
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("home.insights.seeAll", { defaultValue: "See all insights" })}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}
