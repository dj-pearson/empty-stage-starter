import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { FoodChainingRecommendations } from "@/components/FoodChainingRecommendations";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useExposureLadderFlag } from "@/hooks/useExposureLadderFlag";
import { useFoodLadder } from "@/hooks/useFoodLadder";
import { useKids } from "@/contexts/AppContext";
import { localIsoDate } from "@/components/foodTracker/ladderDates";
import { groupLadder, summaryCounts } from "@/lib/ladderOverview";
import { analytics } from "@/lib/analytics";
import "@/i18n/appLocale";

/**
 * The ladder lives on Food Tracker now. Chaining keeps one line pointing
 * there, so a parent who comes here for "what next" still sees what is due,
 * without a second copy of the quick-log controls or the mastery card.
 */
function LadderSummaryLink() {
  const { t } = useTranslation();
  const { activeKidId } = useKids();
  const { rows, loading } = useFoodLadder(activeKidId);
  const today = localIsoDate();
  const counts = useMemo(() => summaryCounts(groupLadder(rows, today)), [rows, today]);

  if (!activeKidId || loading) return null;

  const parts: string[] = [];
  if (counts.due > 0) {
    parts.push(t("foodTracker.ladderUi.chainingSummary.due", { count: counts.due }));
  }
  if (counts.close > 0) {
    parts.push(t("foodTracker.ladderUi.chainingSummary.close", { count: counts.close }));
  }
  const lead =
    parts.length > 0
      ? parts.join(", ")
      : t("foodTracker.ladderUi.chainingSummary.none", {
          defaultValue: "See where each food sits on the ladder",
        });

  return (
    <p className="text-sm">
      <Link
        to="/dashboard/food-tracker"
        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("foodTracker.ladderUi.chainingSummary.link", {
          defaultValue: "{{summary}}: open Food Tracker",
          summary: lead,
        })}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </p>
  );
}

export default function FoodChaining() {
  // US-296: fire picky_win_tab_opened once per FoodChaining page visit
  // when the dedicated community-wins surface flag is on. Default OFF.
  const pickyWinEnabled = useFeatureFlag("picky_win_network", false);
  // US-601: the ladder answers "where are we now" and lives on Food Tracker;
  // chaining answers "what next" and keeps a one-line link to it. On by
  // default; the flag is a kill switch now (useExposureLadderFlag).
  const ladderEnabled = useExposureLadderFlag();

  useEffect(() => {
    if (pickyWinEnabled) {
      analytics.trackEvent("picky_win_tab_opened", { surface: "food_chaining" });
    }
  }, [pickyWinEnabled]);

  useEffect(() => {
    if (ladderEnabled) {
      analytics.trackEvent("exposure_ladder_viewed", { surface: "food_chaining" });
    }
  }, [ladderEnabled]);

  return (
    <>
      <Helmet>
        <title>Food Chaining - EatPal</title>
        <meta name="description" content="Food chaining therapy recommendations to expand your child's food preferences" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div id="main-content" className="container mx-auto py-6 px-4 max-w-7xl space-y-8">
        <FeatureGate feature="food_chaining" label="Food Chaining">
          {ladderEnabled ? <LadderSummaryLink /> : null}
          <FoodChainingRecommendations />
        </FeatureGate>
      </div>
    </>
  );
}
