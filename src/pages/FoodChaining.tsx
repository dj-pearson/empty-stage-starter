import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { FoodChainingRecommendations } from "@/components/FoodChainingRecommendations";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { analytics } from "@/lib/analytics";

export default function FoodChaining() {
  // US-296: fire picky_win_tab_opened once per FoodChaining page visit
  // when the dedicated community-wins surface flag is on. Default OFF.
  const pickyWinEnabled = useFeatureFlag("picky_win_network", false);
  useEffect(() => {
    if (pickyWinEnabled) {
      analytics.trackEvent("picky_win_tab_opened", { surface: "food_chaining" });
    }
  }, [pickyWinEnabled]);

  return (
    <>
      <Helmet>
        <title>Food Chaining - EatPal</title>
        <meta name="description" content="Food chaining therapy recommendations to expand your child's food preferences" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div id="main-content" className="container mx-auto py-6 px-4 max-w-7xl">
        <FeatureGate feature="food_chaining" label="Food Chaining">
          <FoodChainingRecommendations />
        </FeatureGate>
      </div>
    </>
  );
}
