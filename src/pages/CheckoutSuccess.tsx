import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Sparkles,
  Calendar,
  CreditCard,
  Loader2,
  ArrowRight,
} from "lucide-react";

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!sessionId) {
      navigate("/dashboard");
      return;
    }

    // Poll for subscription (webhook might be delayed)
    const checkSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Try up to 15 times (15 seconds total)
      for (let i = 0; i < 15; i++) {
        const { data } = await supabase
          .from("user_subscriptions")
          .select(`
            *,
            plan:subscription_plans(name, price_monthly, features)
          `)
          .eq("user_id", user.id)
          .in("status", ["active", "trialing"])
          .maybeSingle();

        if (data) {
          setSubscription(data);
          setLoading(false);
          return;
        }

        // Wait 1 second before trying again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // If still no subscription after 15 seconds, redirect anyway
      setLoading(false);
      navigate("/dashboard");
    };

    checkSubscription();
  }, [sessionId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <div>
                <h3 className="text-xl font-semibold mb-2">Processing Your Payment...</h3>
                <p className="text-muted-foreground">
                  Please wait while we confirm your subscription
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const planName = subscription?.plan?.name || "Premium";
  const features = subscription?.plan?.features || [];
  const nextBilling = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  return (
    <div id="main-content" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-2xl">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Welcome to {planName}!</h1>
          <p className="text-muted-foreground">
            Your subscription is now active. Let's get started!
          </p>
        </div>

        {/* Subscription Details Card */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{planName} Plan</h3>
                    <p className="text-sm text-muted-foreground">
                      Subscription Active
                    </p>
                  </div>
                </div>
                <Badge className="bg-green-500">Active</Badge>
              </div>

              {nextBilling && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Next billing date: <strong>{nextBilling}</strong>
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 text-sm">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Payment method on file
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What's New Card */}
        {features.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4">What you can do now:</h3>
              <div className="space-y-3">
                {features.slice(0, 5).map((feature: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm">{feature}</p>
                  </div>
                ))}
                {features.length > 5 && (
                  <p className="text-sm text-muted-foreground pl-8">
                    + {features.length - 5} more features
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Start Guide */}
        <Card className="mb-6 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Quick Start Guide
            </h3>
            <ol className="space-y-2 text-sm">
              <li className="flex gap-2">
                <span className="font-semibold shrink-0">1.</span>
                <span>Add your child's safe foods to the pantry</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold shrink-0">2.</span>
                <span>Generate your first AI-powered weekly meal plan</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold shrink-0">3.</span>
                <span>Create a grocery list and start shopping smarter</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Continue Button */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            onClick={() => navigate("/dashboard")}
            className="flex-1"
            size="lg"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button
            onClick={() => navigate("/dashboard/planner")}
            variant="outline"
            className="flex-1"
            size="lg"
          >
            Start Planning Meals
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Need help? Visit our{" "}
          <a href="/faq" className="text-primary hover:underline">
            FAQ
          </a>{" "}
          or{" "}
          <a href="/contact" className="text-primary hover:underline">
            contact support
          </a>
        </p>
      </div>
    </div>
  );
}
