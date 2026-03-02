import { Helmet } from "react-helmet-async";
import { KidMealBuilder } from "@/components/KidMealBuilder";

export default function MealBuilder() {
  return (
    <>
      <Helmet>
        <title>Meal Builder - EatPal</title>
        <meta name="description" content="Build fun meals and earn stars with the interactive meal builder" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto py-6 px-4 max-w-7xl">
        <KidMealBuilder />
      </div>
    </>
  );
}
