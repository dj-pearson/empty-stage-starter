import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface SubscriptionPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
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
  sort_order: number;
}

export default function Pricing() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const navigate = useNavigate();

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      setPlans((data || []).map(plan => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features as string[] : []
      })));
    } catch (error: any) {
      console.error("Error loading plans:", error);
      toast.error("Failed to load pricing plans");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (plan.price_monthly === 0) {
      toast.info("You're already on the Free plan!");
      return;
    }

    // Navigate to subscription management or checkout
    navigate("/admin");
    toast.info("Please contact support to upgrade your plan");
  };

  const formatPrice = (plan: SubscriptionPlan) => {
    if (plan.price_monthly === 0) return "Free";
    const price = billingCycle === "monthly" ? plan.price_monthly : plan.price_yearly;
    return `$${price}`;
  };

  const getPlanBadge = (planName: string) => {
    switch (planName) {
      case "Pro":
        return <Badge variant="secondary">Popular</Badge>;
      case "Family Plus":
        return <Badge className="bg-gradient-to-r from-primary to-accent text-white">Best Value</Badge>;
      case "Professional":
        return <Badge variant="outline">Enterprise</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-4 animate-pulse text-primary" />
          <p className="text-muted-foreground">Loading plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Choose Your Plan
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Select the perfect plan to help your family's feeding journey
        </p>

        {/* Billing Toggle */}
        <div className="inline-flex items-center gap-3 p-1 bg-muted rounded-lg">
          <Button
            variant={billingCycle === "monthly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setBillingCycle("monthly")}
          >
            Monthly
          </Button>
          <Button
            variant={billingCycle === "yearly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setBillingCycle("yearly")}
          >
            Yearly
            <Badge variant="secondary" className="ml-2">
              Save 20%
            </Badge>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {plans.map((plan) => {
          const isPopular = plan.name === "Pro" || plan.name === "Family Plus";

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                isPopular ? "border-primary shadow-lg scale-105" : ""
              }`}
            >
              {getPlanBadge(plan.name) && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  {getPlanBadge(plan.name)}
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">
                      {formatPrice(plan)}
                    </span>
                    {plan.price_monthly > 0 && (
                      <span className="text-muted-foreground">
                        /{billingCycle === "monthly" ? "month" : "year"}
                      </span>
                    )}
                  </div>
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {/* Children */}
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">
                      {plan.max_children === null
                        ? "Unlimited children"
                        : `${plan.max_children} ${plan.max_children === 1 ? "child" : "children"}`}
                    </span>
                  </li>

                  {/* Pantry Foods */}
                  <li className="flex items-start gap-2">
                    {plan.max_pantry_foods === null ? (
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm">
                      {plan.max_pantry_foods === null
                        ? "Unlimited pantry foods"
                        : `${plan.max_pantry_foods} pantry foods`}
                    </span>
                  </li>

                  {/* AI Coach */}
                  <li className="flex items-start gap-2">
                    {plan.ai_coach_daily_limit === null || plan.ai_coach_daily_limit > 0 ? (
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm">
                      {plan.ai_coach_daily_limit === null
                        ? "Unlimited AI Coach"
                        : plan.ai_coach_daily_limit === 0
                        ? "No AI Coach"
                        : `${plan.ai_coach_daily_limit} AI requests/day`}
                    </span>
                  </li>

                  {/* Food Tracker */}
                  <li className="flex items-start gap-2">
                    {plan.food_tracker_monthly_limit === null || plan.food_tracker_monthly_limit > 0 ? (
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm">
                      {plan.food_tracker_monthly_limit === null
                        ? "Unlimited food tracking"
                        : `${plan.food_tracker_monthly_limit} entries/month`}
                    </span>
                  </li>

                  {/* Food Chaining */}
                  <li className="flex items-start gap-2">
                    {plan.has_food_chaining ? (
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm">Food chaining</span>
                  </li>

                  {/* Meal Builder */}
                  <li className="flex items-start gap-2">
                    {plan.has_meal_builder ? (
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm">Kid meal builder</span>
                  </li>

                  {/* Nutrition Tracking */}
                  <li className="flex items-start gap-2">
                    {plan.has_nutrition_tracking ? (
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm">Nutrition tracking</span>
                  </li>

                  {/* Multi-household */}
                  {plan.has_multi_household && (
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">Multi-household sharing</span>
                    </li>
                  )}

                  {/* Therapist Portal */}
                  {plan.max_therapists > 0 && (
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">
                        {plan.max_therapists === 1 ? "1 therapist" : "Full professional portal"}
                      </span>
                    </li>
                  )}

                  {/* White Label */}
                  {plan.has_white_label && (
                    <li className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">White label branding</span>
                    </li>
                  )}

                  {/* Support */}
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">
                      {plan.support_level === "phone"
                        ? "Phone + Email support"
                        : plan.support_level === "priority"
                        ? "Priority support"
                        : "Email support"}
                    </span>
                  </li>
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={isPopular ? "default" : "outline"}
                  onClick={() => handleSelectPlan(plan)}
                >
                  {plan.price_monthly === 0 ? "Current Plan" : "Upgrade Now"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div className="mt-16 max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-8">Detailed Feature Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4 font-semibold">Feature</th>
                {plans.map((plan) => (
                  <th key={plan.id} className="text-center p-4 font-semibold">
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
                    {plan.price_monthly === 0 ? "$0" : `$${plan.price_monthly}/mo`}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-4">Children</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4">
                    {plan.max_children === null ? "Unlimited" : plan.max_children}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-4">Pantry Foods</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4">
                    {plan.max_pantry_foods === null ? "Unlimited" : plan.max_pantry_foods}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-4">AI Coach</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4">
                    {plan.ai_coach_daily_limit === null
                      ? <Check className="w-5 h-5 mx-auto text-primary" />
                      : plan.ai_coach_daily_limit === 0
                      ? <X className="w-5 h-5 mx-auto text-muted-foreground" />
                      : `${plan.ai_coach_daily_limit}/day`}
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
                      <Check className="w-5 h-5 mx-auto text-primary" />
                    ) : (
                      <X className="w-5 h-5 mx-auto text-muted-foreground" />
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-4">Meal Builder</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4">
                    {plan.has_meal_builder ? (
                      <Check className="w-5 h-5 mx-auto text-primary" />
                    ) : (
                      <X className="w-5 h-5 mx-auto text-muted-foreground" />
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-4">Nutrition Tracking</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4">
                    {plan.has_nutrition_tracking ? (
                      <Check className="w-5 h-5 mx-auto text-primary" />
                    ) : (
                      <X className="w-5 h-5 mx-auto text-muted-foreground" />
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-4">Multi-Household</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4">
                    {plan.has_multi_household ? (
                      <Check className="w-5 h-5 mx-auto text-primary" />
                    ) : (
                      <X className="w-5 h-5 mx-auto text-muted-foreground" />
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-4">Professional Portal</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4">
                    {plan.max_therapists === null
                      ? "Full access"
                      : plan.max_therapists === 1
                      ? "1 therapist"
                      : plan.max_therapists === 0
                      ? <X className="w-5 h-5 mx-auto text-muted-foreground" />
                      : plan.max_therapists}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-4">White Label</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4">
                    {plan.has_white_label ? (
                      <Check className="w-5 h-5 mx-auto text-primary" />
                    ) : (
                      <X className="w-5 h-5 mx-auto text-muted-foreground" />
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4">Support</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-center p-4 capitalize">
                    {plan.support_level === "phone" ? "Phone+Email" : plan.support_level}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
