import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { FoodChainingRecommendations } from "@/components/FoodChainingRecommendations";
import { FoodLadderBoard } from "@/components/FoodLadderBoard";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { analytics } from "@/lib/analytics";

export default function FoodChaining() {
  // US-296: fire picky_win_tab_opened once per FoodChaining page visit
  // when the dedicated community-wins surface flag is on. Default OFF.
  const pickyWinEnabled = useFeatureFlag("picky_win_network", false);
  // US-601: the ladder board sits above chaining because it answers "where
  // are we now", and the chain suggestions below answer "what next". Default
  // OFF so the epic can land in pieces without changing the live page.
  const ladderEnabled = useFeatureFlag("exposure_ladder", false);

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
          {ladderEnabled ? <FoodLadderBoard /> : null}
          <FoodChainingRecommendations />
        </FeatureGate>
      </div>
    </>
  );
}
