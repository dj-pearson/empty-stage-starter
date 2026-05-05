import { Helmet } from "react-helmet-async";
import { FoodChainingRecommendations } from "@/components/FoodChainingRecommendations";
import { FeatureGate } from "@/components/FeatureGate";

export default function FoodChaining() {
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
