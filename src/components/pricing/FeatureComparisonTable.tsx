import { Check, X } from "lucide-react";

interface SubscriptionPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_children: number | null;
  max_pantry_foods: number | null;
  ai_coach_daily_limit: number | null;
  food_tracker_monthly_limit: number | null;
  has_food_chaining: boolean;
  has_meal_builder: boolean;
  has_nutrition_tracking: boolean;
  has_multi_household: boolean;
  max_therapists: number;
  has_white_label: boolean;
  support_level: string;
}

interface FeatureComparisonTableProps {
  plans: SubscriptionPlan[];
}

export function FeatureComparisonTable({ plans }: FeatureComparisonTableProps) {
  return (
    <div className="mt-16 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-4">
        Detailed Feature Comparison
      </h2>
      <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
        Compare all features across EatPal plans to find the best fit for managing picky eating, ARFID, and family meal planning needs.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" role="table" aria-label="Feature comparison across subscription plans">
          <thead>
            <tr className="border-b">
              <th className="text-left p-4 font-semibold" scope="col">Feature</th>
              {plans.map((plan) => (
                <th key={plan.id} className="text-center p-4 font-semibold" scope="col">
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="p-4">Price</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.price_monthly === 0
                    ? "$0"
                    : `$${plan.price_monthly}/mo`}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">Children</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.max_children === null
                    ? "Unlimited"
                    : plan.max_children}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">Pantry Foods</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.max_pantry_foods === null
                    ? "Unlimited"
                    : plan.max_pantry_foods}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">AI Coach</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.ai_coach_daily_limit === null ? (
                    <Check className="w-5 h-5 mx-auto text-primary" aria-label="Included" />
                  ) : plan.ai_coach_daily_limit === 0 ? (
                    <X className="w-5 h-5 mx-auto text-muted-foreground" aria-label="Not included" />
                  ) : (
                    `${plan.ai_coach_daily_limit}/day`
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">Food Tracker</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.food_tracker_monthly_limit === null
                    ? "Unlimited"
                    : `${plan.food_tracker_monthly_limit}/mo`}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">Food Chaining</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.has_food_chaining ? (
                    <Check className="w-5 h-5 mx-auto text-primary" aria-label="Included" />
                  ) : (
                    <X className="w-5 h-5 mx-auto text-muted-foreground" aria-label="Not included" />
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">Meal Builder</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.has_meal_builder ? (
                    <Check className="w-5 h-5 mx-auto text-primary" aria-label="Included" />
                  ) : (
                    <X className="w-5 h-5 mx-auto text-muted-foreground" aria-label="Not included" />
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">Nutrition Tracking</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.has_nutrition_tracking ? (
                    <Check className="w-5 h-5 mx-auto text-primary" aria-label="Included" />
                  ) : (
                    <X className="w-5 h-5 mx-auto text-muted-foreground" aria-label="Not included" />
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">Multi-Household</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.has_multi_household ? (
                    <Check className="w-5 h-5 mx-auto text-primary" aria-label="Included" />
                  ) : (
                    <X className="w-5 h-5 mx-auto text-muted-foreground" aria-label="Not included" />
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">Professional Portal</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.max_therapists === null ? (
                    "Full access"
                  ) : plan.max_therapists === 1 ? (
                    "1 therapist"
                  ) : plan.max_therapists === 0 ? (
                    <X className="w-5 h-5 mx-auto text-muted-foreground" aria-label="Not included" />
                  ) : (
                    plan.max_therapists
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4">White Label</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4">
                  {plan.has_white_label ? (
                    <Check className="w-5 h-5 mx-auto text-primary" aria-label="Included" />
                  ) : (
                    <X className="w-5 h-5 mx-auto text-muted-foreground" aria-label="Not included" />
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-4">Support</td>
              {plans.map((plan) => (
                <td key={plan.id} className="text-center p-4 capitalize">
                  {plan.support_level === "phone"
                    ? "Phone+Email"
                    : plan.support_level}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
