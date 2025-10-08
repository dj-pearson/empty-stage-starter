import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Sparkles, Utensils, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

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
  const [user, setUser] = useState<User | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    loadPlans();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    
    if (user) {
      // Get user's current subscription
      const { data: subscription } = await supabase
        .from("user_subscriptions")
        .select("plan_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();
      
      if (subscription) {
        setCurrentPlanId(subscription.plan_id);
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
    if (!user) {
      // Not logged in, redirect to auth
      navigate("/auth");
      return;
    }

    if (currentPlanId === plan.id) {
      toast.info("This is your current plan!");
      return;
    }

    if (plan.price_monthly === 0) {
      toast.info("Cannot downgrade to Free plan from here");
      return;
    }

    // Navigate to subscription management or checkout
    navigate("/admin");
    toast.info("Please contact support to upgrade your plan");
  };

  const getButtonText = (plan: SubscriptionPlan) => {
    if (!user) {
      return "Get Started Now";
    }
    
    if (currentPlanId === plan.id) {
      return "Current Plan";
    }
    
    return "Upgrade Now";
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <Utensils className="h-7 w-7 text-primary" />
            <span className="text-2xl font-heading font-bold text-primary">EatPal</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex gap-6 items-center">
            <Link to="/#features" className="hover:text-primary transition-colors font-medium">Features</Link>
            <Link to="/#how-it-works" className="hover:text-primary transition-colors font-medium">How It Works</Link>
            <Link to="/pricing" className="text-primary font-medium">Pricing</Link>
            {user ? (
              <Link to="/dashboard">
                <Button className="font-semibold shadow-md">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/auth">
                  <Button variant="ghost" className="font-medium">Sign In</Button>
                </Link>
                <Link to="/auth">
                  <Button className="font-semibold shadow-md">Get Started Free</Button>
                </Link>
              </>
            )}
          </nav>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Utensils className="h-6 w-6 text-primary" />
                  <span className="font-heading font-bold text-primary">EatPal</span>
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
                <div className="border-t pt-4 mt-4 space-y-3">
                  {user ? (
                    <Link to="/dashboard" onClick={closeMobileMenu}>
                      <Button className="w-full text-lg py-6 shadow-md">
                        Dashboard
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Link to="/auth" onClick={closeMobileMenu}>
                        <Button variant="outline" className="w-full text-lg py-6">
                          Sign In
                        </Button>
                      </Link>
                      <Link to="/auth" onClick={closeMobileMenu}>
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
                  disabled={user && currentPlanId === plan.id}
                >
                  {getButtonText(plan)}
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

      {/* Footer */}
      <footer className="border-t py-12 px-4 bg-secondary/5">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                <Utensils className="h-7 w-7 text-primary" />
                <span className="text-2xl font-heading font-bold text-primary">EatPal</span>
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Making meal planning simple and stress-free for families with picky eaters.
              </p>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Product</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/#features" className="hover:text-primary transition-colors">Features</Link></li>
                <li><Link to="/#how-it-works" className="hover:text-primary transition-colors">How It Works</Link></li>
                <li><Link to="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                <li><Link to="/auth" className="hover:text-primary transition-colors">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Company</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Support</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">FAQ</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>© 2025 EatPal. All rights reserved. Built with ❤️ for parents of picky eaters.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
