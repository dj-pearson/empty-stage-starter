import { useState, useEffect, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Sparkles, Menu, Users, ShieldCheck, FileText, Lock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { SEOHead } from "@/components/SEOHead";
import { getPageSEO } from "@/lib/seo-config";
import { Footer } from "@/components/Footer";
import { BreadcrumbNavigation } from "@/components/BreadcrumbNavigation";

// Lazy load the feature comparison table (below the fold)
const FeatureComparisonTable = lazy(() =>
  import("@/components/pricing/FeatureComparisonTable").then(m => ({ default: m.FeatureComparisonTable }))
);

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

interface Campaign {
  discount_type: string;
  discount_value: number;
}

interface PlanWithDiscount extends SubscriptionPlan {
  activeCampaign?: Campaign;
  discountedPrice?: number;
}

export default function Pricing() {
  const [plans, setPlans] = useState<PlanWithDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly"
  );
  const [user, setUser] = useState<User | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [currentPlanSortOrder, setCurrentPlanSortOrder] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const seoConfig = getPageSEO("pricing");

  useEffect(() => {
    checkAuth();
    loadPlans();
  }, []);

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUser(user);

    if (user) {
      // Get user's current subscription with plan sort_order
      const { data: subscription } = await supabase
        .from("user_subscriptions")
        .select("plan_id, subscription_plans(sort_order)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (subscription) {
        setCurrentPlanId(subscription.plan_id);
        // Get sort_order from the joined subscription_plans
        const planData = subscription.subscription_plans as { sort_order: number } | null;
        if (planData?.sort_order) {
          setCurrentPlanSortOrder(planData.sort_order);
        }
      }
    }
  };

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;

      // Get active promotional campaigns
      const { data: campaigns } = await supabase
        .from("promotional_campaigns")
        .select("*")
        .eq("is_active", true)
        .lte("start_date", new Date().toISOString())
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`);

      const plansWithDiscounts = (data || []).map((plan) => {
        const planData: PlanWithDiscount = {
          ...plan,
          features: Array.isArray(plan.features)
            ? (plan.features as string[])
            : [],
        };

        // Check if there's an active campaign for this plan
        const activeCampaign = campaigns?.find(
          (c) =>
            c.affected_plan_ids &&
            (c.affected_plan_ids as string[]).includes(plan.id)
        );

        if (activeCampaign) {
          const basePrice =
            billingCycle === "monthly" ? plan.price_monthly : plan.price_yearly;
          let discountedPrice = basePrice;

          if (activeCampaign.discount_type === "percentage") {
            discountedPrice =
              basePrice * (1 - (activeCampaign.discount_value as number) / 100);
          } else {
            discountedPrice =
              basePrice - (activeCampaign.discount_value as number);
          }

          planData.activeCampaign = {
            discount_type: activeCampaign.discount_type as string,
            discount_value: activeCampaign.discount_value as number,
          };
          planData.discountedPrice = Math.max(0, discountedPrice);
        }

        return planData;
      });

      setPlans(plansWithDiscounts);
    } catch (error: unknown) {
      logger.error("Error loading plans:", error);
      toast.error("Failed to load pricing plans");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (!user) {
      // Not logged in, redirect to auth
      navigate("/auth");
      return;
    }

    if (currentPlanId === plan.id) {
      toast.info("This is your current plan!");
      return;
    }

    // Handle Free plan (downgrade = cancel subscription via Stripe Portal)
    if (plan.price_monthly === 0) {
      try {
        setLoading(true);
        const { data, error } = await invokeEdgeFunction("stripe-portal", {
          body: {
            returnUrl: `${window.location.origin}/pricing`,
          },
        });

        if (error) throw error;

        if (data?.url) {
          // Redirect to Stripe portal where user can cancel
          toast.info("Redirecting to manage your subscription...");
          window.location.href = data.url;
        } else {
          throw new Error("No portal URL returned");
        }
      } catch (error: unknown) {
        logger.error("Portal redirect error:", error);
        toast.error("Failed to open subscription management. Please try again.");
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      
      const { data, error } = await invokeEdgeFunction("create-checkout", {
        body: {
          planId: plan.id,
          billingCycle,
          successUrl: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error: unknown) {
      logger.error("Checkout error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("price") || message.includes("Price")) {
        toast.error("This plan is not yet configured for checkout. Please contact support.");
      } else if (message.includes("customer") || message.includes("Customer")) {
        toast.error("Account setup issue. Please try again or contact support.");
      } else {
        toast.error("Failed to start checkout. Please try again.");
      }
      setLoading(false);
    }
  };

  const getButtonText = (plan: SubscriptionPlan) => {
    if (!user) {
      return "Get Started Now";
    }

    if (currentPlanId === plan.id) {
      return "Current Plan";
    }

    // Compare plan levels using sort_order (lower = lower tier)
    if (currentPlanSortOrder !== null && plan.sort_order < currentPlanSortOrder) {
      return "Downgrade";
    }

    return "Upgrade Now";
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const formatPrice = (plan: PlanWithDiscount) => {
    if (plan.price_monthly === 0) return "Free";

    if (plan.discountedPrice !== undefined) {
      return `$${plan.discountedPrice.toFixed(2)}`;
    }

    const price =
      billingCycle === "monthly" ? plan.price_monthly : plan.price_yearly;
    return `$${price}`;
  };

  const formatOriginalPrice = (plan: PlanWithDiscount) => {
    const price =
      billingCycle === "monthly" ? plan.price_monthly : plan.price_yearly;
    return `$${price}`;
  };

  const getPlanBadge = (planName: string) => {
    switch (planName) {
      case "Pro":
        return <Badge variant="secondary">Popular</Badge>;
      case "Family Plus":
        return (
          <Badge className="bg-gradient-to-r from-primary to-accent text-white">
            Best Value
          </Badge>
        );
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
    <>
      <SEOHead {...seoConfig!} />
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/Logo-Green.png"
              alt="EatPal"
              className="h-8 block dark:hidden"
            />
            <img
              src="/Logo-White.png"
              alt="EatPal"
              className="h-8 hidden dark:block"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex gap-6 items-center">
            <Link
              to="/#features"
              className="hover:text-primary transition-colors font-medium"
            >
              Features
            </Link>
            <Link
              to="/#how-it-works"
              className="hover:text-primary transition-colors font-medium"
            >
              How It Works
            </Link>
            <Link to="/pricing" className="text-primary font-medium">
              Pricing
            </Link>
            <Link
              to="/#free-tools"
              className="hover:text-primary transition-colors font-medium"
            >
              Free Tools
            </Link>
            {user ? (
              <Link to="/dashboard">
                <Button className="font-semibold shadow-md">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/auth?tab=signin">
                  <Button variant="ghost" className="font-medium">
                    Sign In
                  </Button>
                </Link>
                <Link to="/auth?tab=signup">
                  <Button className="font-semibold shadow-md">
                    Get Started Free
                  </Button>
                </Link>
              </>
            )}
          </nav>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="touch-target">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <img
                    src="/Logo-Green.png"
                    alt="EatPal"
                    className="h-7 block dark:hidden"
                  />
                  <img
                    src="/Logo-White.png"
                    alt="EatPal"
                    className="h-7 hidden dark:block"
                  />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-4 mt-8">
                <Link
                  to="/#features"
                  className="text-lg font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors"
                  onClick={closeMobileMenu}
                >
                  Features
                </Link>
                <Link
                  to="/#how-it-works"
                  className="text-lg font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors"
                  onClick={closeMobileMenu}
                >
                  How It Works
                </Link>
                <Link
                  to="/pricing"
                  className="text-lg font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors"
                  onClick={closeMobileMenu}
                >
                  Pricing
                </Link>
                <Link
                  to="/#free-tools"
                  className="text-lg font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors"
                  onClick={closeMobileMenu}
                >
                  Free Tools
                </Link>
                <div className="border-t pt-4 mt-4 space-y-3">
                  {user ? (
                    <Link to="/dashboard" onClick={closeMobileMenu}>
                      <Button className="w-full text-lg py-6 shadow-md">
                        Dashboard
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Link to="/auth?tab=signin" onClick={closeMobileMenu}>
                        <Button
                          variant="outline"
                          className="w-full text-lg py-6"
                        >
                          Sign In
                        </Button>
                      </Link>
                      <Link to="/auth?tab=signup" onClick={closeMobileMenu}>
                        <Button className="w-full text-lg py-6 shadow-md">
                          Get Started Free
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main id="main-content" className="container mx-auto px-4 py-16">
        <BreadcrumbNavigation
          items={[
            { name: 'Home', url: 'https://tryeatpal.com/' },
            { name: 'Pricing', url: 'https://tryeatpal.com/pricing' }
          ]}
        />

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            EatPal Pricing - Meal Planning Plans for Picky Eaters
          </h1>

          {/* TL;DR for GEO */}
          <div className="max-w-3xl mx-auto bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg mb-6 text-left">
            <p className="text-sm font-semibold text-primary mb-2">TL;DR - Quick Pricing Summary</p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Free Plan:</strong> 1 child, limited features. <strong>Pro Plan ($9.99/mo):</strong> Unlimited children, AI meal planning, full features.
              <strong>Family Plus ($19.99/mo):</strong> Advanced nutrition tracking, multi-household. <strong>Professional Plan:</strong> For therapists and dietitians.
              All plans include safe food tracking, try bites, and grocery lists. Free trial available. Cancel anytime.
            </p>
          </div>

          <p className="text-xl text-muted-foreground mb-8">
            Select the perfect plan to help your family's feeding journey with picky eaters, ARFID, and selective eating
          </p>

          {/* Entity markers for AI understanding */}
          <div className="sr-only">
            Pricing for: EatPal meal planning app, picky eater subscription plans, ARFID meal planner cost,
            family meal planning pricing, kids nutrition app subscription, feeding therapy tools pricing
          </div>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-3 p-1 bg-muted rounded-lg" role="radiogroup" aria-label="Billing cycle">
            <Button
              variant={billingCycle === "monthly" ? "default" : "ghost"}
              size="sm"
              role="radio"
              onClick={() => setBillingCycle("monthly")}
              aria-checked={billingCycle === "monthly"}
              aria-label="Monthly billing"
            >
              Monthly
            </Button>
            <Button
              variant={billingCycle === "yearly" ? "default" : "ghost"}
              size="sm"
              role="radio"
              onClick={() => setBillingCycle("yearly")}
              aria-checked={billingCycle === "yearly"}
              aria-label="Yearly billing, save 20%"
            >
              Yearly
              <Badge variant="secondary" className="ml-2">
                Save 20%
              </Badge>
            </Button>
          </div>
        </div>

        {/* Pricing Cards - Horizontal scroll on mobile, grid on desktop */}
        <div className="lg:hidden flex overflow-x-auto snap-x snap-mandatory gap-6 pb-4 -mx-4 px-4 mb-8 scrollbar-hide">
          {plans.map((plan) => {
            const isPopular =
              plan.name === "Pro" || plan.name === "Family Plus";

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col min-w-[300px] max-w-[340px] snap-center ${
                  isPopular ? "border-primary shadow-lg" : ""
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
                      {plan.activeCampaign &&
                      plan.discountedPrice !== undefined ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-muted-foreground line-through">
                              {formatOriginalPrice(plan)}
                            </span>
                            <Badge className="bg-red-500">
                              {plan.activeCampaign.discount_type ===
                              "percentage"
                                ? `${plan.activeCampaign.discount_value}% OFF`
                                : `$${plan.activeCampaign.discount_value} OFF`}
                            </Badge>
                          </div>
                          <span className="text-4xl font-bold text-foreground">
                            {formatPrice(plan)}
                          </span>
                          {plan.price_monthly > 0 && (
                            <span className="text-muted-foreground">
                              /{billingCycle === "monthly" ? "month" : "year"}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-4xl font-bold text-foreground">
                            {formatPrice(plan)}
                          </span>
                          {plan.price_monthly > 0 && (
                            <span className="text-muted-foreground">
                              /{billingCycle === "monthly" ? "month" : "year"}
                            </span>
                          )}
                        </>
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
                          : `${plan.max_children} ${
                              plan.max_children === 1 ? "child" : "children"
                            }`}
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
                      {plan.ai_coach_daily_limit === null ||
                      plan.ai_coach_daily_limit > 0 ? (
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
                      {plan.food_tracker_monthly_limit === null ||
                      plan.food_tracker_monthly_limit > 0 ? (
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
                          {plan.max_therapists === 1
                            ? "1 therapist"
                            : "Full professional portal"}
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
                    className="w-full active:scale-95 transition-transform"
                    variant={isPopular ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan)}
                    disabled={user && currentPlanId === plan.id}
                    aria-label={`${getButtonText(plan)} - ${plan.name} plan at ${formatPrice(plan)}${plan.price_monthly > 0 ? ' per ' + billingCycle.slice(0, -2) : ''}`}
                  >
                    {getButtonText(plan)}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Desktop Grid Layout */}
        <div className="hidden lg:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {plans.map((plan) => {
            const isPopular =
              plan.name === "Pro" || plan.name === "Family Plus";

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
                      {plan.activeCampaign &&
                      plan.discountedPrice !== undefined ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-muted-foreground line-through">
                              {formatOriginalPrice(plan)}
                            </span>
                            <Badge className="bg-red-500">
                              {plan.activeCampaign.discount_type ===
                              "percentage"
                                ? `${plan.activeCampaign.discount_value}% OFF`
                                : `$${plan.activeCampaign.discount_value} OFF`}
                            </Badge>
                          </div>
                          <span className="text-4xl font-bold text-foreground">
                            {formatPrice(plan)}
                          </span>
                          {plan.price_monthly > 0 && (
                            <span className="text-muted-foreground">
                              /{billingCycle === "monthly" ? "month" : "year"}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-4xl font-bold text-foreground">
                            {formatPrice(plan)}
                          </span>
                          {plan.price_monthly > 0 && (
                            <span className="text-muted-foreground">
                              /{billingCycle === "monthly" ? "month" : "year"}
                            </span>
                          )}
                        </>
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
                          : `${plan.max_children} ${
                              plan.max_children === 1 ? "child" : "children"
                            }`}
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
                      {plan.ai_coach_daily_limit === null ||
                      plan.ai_coach_daily_limit > 0 ? (
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
                      {plan.food_tracker_monthly_limit === null ||
                      plan.food_tracker_monthly_limit > 0 ? (
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
                          {plan.max_therapists === 1
                            ? "1 therapist"
                            : "Full professional portal"}
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
                    disabled={user && currentPlanId === plan.id}
                    aria-label={`${getButtonText(plan)} - ${plan.name} plan at ${formatPrice(plan)}${plan.price_monthly > 0 ? ' per ' + billingCycle.slice(0, -2) : ''}`}
                  >
                    {getButtonText(plan)}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Feature Comparison Table - Lazy loaded */}
        <Suspense
          fallback={
            <div className="mt-16 max-w-7xl mx-auto" role="status" aria-busy="true">
              <div className="h-8 bg-muted rounded w-64 mx-auto mb-4 animate-pulse" />
              <div className="h-4 bg-muted rounded w-96 mx-auto mb-8 animate-pulse" />
              <div className="h-64 bg-muted rounded animate-pulse" />
              <span className="sr-only">Loading feature comparison table...</span>
            </div>
          }
        >
          <FeatureComparisonTable plans={plans} />
        </Suspense>

        {/* 30-Day Money-Back Guarantee Banner */}
        <div className="text-center py-6">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary/10 text-primary font-medium">
            <ShieldCheck className="h-5 w-5" />
            30-Day Money-Back Guarantee
          </div>
        </div>

        {/* Trust Signals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto py-8">
          {[
            { icon: <X className="h-5 w-5" />, text: "Cancel anytime" },
            { icon: <FileText className="h-5 w-5" />, text: "No long-term contracts" },
            { icon: <Lock className="h-5 w-5" />, text: "256-bit SSL encryption" },
            { icon: <Users className="h-5 w-5" />, text: "2,000+ families trust EatPal" },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              <div className="p-2 rounded-full bg-muted">{item.icon}</div>
              {item.text}
            </div>
          ))}
        </div>

        {/* Billing FAQ */}
        <div className="max-w-2xl mx-auto py-12">
          <h2 className="text-2xl font-bold text-center mb-6">Billing FAQ</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="q1">
              <AccordionTrigger>Can I cancel my subscription anytime?</AccordionTrigger>
              <AccordionContent>
                Yes! You can cancel at any time from your account settings. Your access continues until the end of your billing period.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger>How does the 30-day money-back guarantee work?</AccordionTrigger>
              <AccordionContent>
                If EatPal isn't the right fit for your family within the first 30 days, simply contact our support team and we'll issue a full refund. No questions asked, no hoops to jump through.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger>What payment methods do you accept?</AccordionTrigger>
              <AccordionContent>
                We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover) through our secure payment partner, Stripe. All transactions are encrypted and PCI-compliant.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4">
              <AccordionTrigger>Can I switch between monthly and yearly billing?</AccordionTrigger>
              <AccordionContent>
                Yes! You can switch between monthly and yearly billing at any time from your account settings. Yearly billing saves you 20% compared to monthly. Changes take effect at your next billing cycle.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q5">
              <AccordionTrigger>What happens to my data if I cancel?</AccordionTrigger>
              <AccordionContent>
                Your data is never deleted. When you cancel, your account reverts to the Free plan at the end of your billing period. You can upgrade again anytime to restore full access to all your saved meals, recipes, and tracking history.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
    </>
  );
}

