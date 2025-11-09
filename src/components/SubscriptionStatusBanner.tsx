// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, TrendingUp, ArrowRight, Gift, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { SubscriptionManagementDialog } from "./SubscriptionManagementDialog";
import { logger } from "@/lib/logger";
import {
  shouldShowUpgradePrompt,
  getSubscriptionCTA,
  getSubscriptionUrgency,
  getTrialDaysRemaining,
  formatSubscriptionStatus,
  getComplementarySubscriptionInfo,
  type SubscriptionData,
} from "@/lib/subscription-helpers";

interface SubscriptionStatus {
  plan_name: string;
  status: "trialing" | "active" | "canceled" | "past_due" | null;
  trial_end_date: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_id: string;
  is_complementary: boolean;
  complementary_subscription_id: string | null;
}

export function SubscriptionStatusBanner() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showManagement, setShowManagement] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userSub } = await supabase
        .from("user_subscriptions")
        .select(`
          status,
          current_period_end,
          cancel_at_period_end,
          trial_end,
          is_complementary,
          complementary_subscription_id,
          plan:subscription_plans(id, name)
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      if (userSub && userSub.plan) {
        const subStatus: SubscriptionStatus = {
          plan_name: (userSub.plan as any).name,
          status: userSub.status as any,
          trial_end_date: userSub.status === "trialing" ? userSub.current_period_end : userSub.trial_end,
          current_period_end: userSub.current_period_end,
          cancel_at_period_end: userSub.cancel_at_period_end,
          plan_id: (userSub.plan as any).id,
          is_complementary: userSub.is_complementary || false,
          complementary_subscription_id: userSub.complementary_subscription_id || null,
        };

        setSubscription(subStatus);
      } else {
        // Check for complementary subscription
        const { data: compSub } = await supabase
          .rpc('get_complementary_subscription', { p_user_id: user.id })
          .maybeSingle();

        if (compSub) {
          setSubscription({
            plan_name: compSub.plan_name,
            status: 'active',
            trial_end_date: null,
            current_period_end: compSub.end_date,
            cancel_at_period_end: false,
            plan_id: compSub.plan_id,
            is_complementary: true,
            complementary_subscription_id: compSub.id,
          });
        } else {
          // No subscription found - user is on free plan
          const { data: freePlan } = await supabase
            .from("subscription_plans")
            .select("id, name")
            .eq("price_monthly", 0)
            .maybeSingle();

          if (freePlan) {
            setSubscription({
              plan_name: freePlan.name,
              status: null,
              trial_end_date: null,
              current_period_end: null,
              cancel_at_period_end: false,
              plan_id: freePlan.id,
              is_complementary: false,
              complementary_subscription_id: null,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Error loading subscription:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  // Convert to SubscriptionData format for helper functions
  const subscriptionData: SubscriptionData | null = subscription
    ? {
        plan_name: subscription.plan_name,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end_date,
        is_complementary: subscription.is_complementary,
        complementary_subscription_id: subscription.complementary_subscription_id,
      }
    : null;

  const urgency = getSubscriptionUrgency(subscriptionData);
  const cta = getSubscriptionCTA(subscriptionData);
  const showUpgrade = shouldShowUpgradePrompt(subscriptionData);
  const complementaryInfo = getComplementarySubscriptionInfo(subscriptionData);
  const trialDays = getTrialDaysRemaining(subscriptionData);

  // Complementary subscription banner
  if (complementaryInfo.isComplementary) {
    return (
      <Card className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border-purple-200 dark:border-purple-800">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
                <Gift className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg">
                    {subscription?.plan_name} Plan
                  </h3>
                  <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                    Complementary Access
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {complementaryInfo.message}
                  {subscription?.current_period_end && !subscription.cancel_at_period_end && (
                    <> · Valid until {new Date(subscription.current_period_end).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowManagement(true)}
              className="w-full md:w-auto"
            >
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Free plan with upgrade prompt
  if (!subscription || subscription.status === null) {
    return (
      <Card className="mb-6 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg">
                    {subscription?.plan_name || "Free"} Plan
                  </h3>
                  <Badge variant="secondary">Current</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Upgrade to unlock advanced features like AI meal planning, unlimited recipes, and more!
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/pricing")}
              className="w-full md:w-auto"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Trial banner with urgency
  if (subscription.status === "trialing" && trialDays !== null) {
    const isUrgent = trialDays <= 3;
    const borderColor = isUrgent ? "border-orange-500" : "border-primary";
    const bgGradient = isUrgent
      ? "from-orange-50 via-red-50/30 to-orange-50 dark:from-orange-950/20 dark:via-red-950/10 dark:to-orange-950/20"
      : "from-primary/10 via-accent/5 to-primary/10";

    return (
      <>
        <Card className={`mb-6 ${borderColor} bg-gradient-to-r ${bgGradient}`}>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${isUrgent ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-primary/20'}`}>
                  <Clock className={`h-5 w-5 ${isUrgent ? 'text-orange-600 dark:text-orange-400' : 'text-primary'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">
                    {trialDays === 0 ? "Trial Ends Today!" :
                     trialDays === 1 ? "Trial Ends Tomorrow!" :
                     `${trialDays} ${trialDays === 1 ? "Day" : "Days"} Left in Your Free Trial`}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    You're on the <strong>{subscription.plan_name}</strong> plan.
                    {isUrgent ? " Don't lose access - upgrade now!" : " Upgrade now to continue enjoying all features after your trial ends."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button
                  onClick={() => navigate("/pricing")}
                  className={`flex-1 md:flex-initial ${isUrgent ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isUrgent ? "Upgrade Now" : "Upgrade Today"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <SubscriptionManagementDialog
          open={showManagement}
          onOpenChange={setShowManagement}
          currentPlanId={subscription.plan_id}
          currentPlanName={subscription.plan_name}
          onSuccess={loadSubscriptionStatus}
        />
      </>
    );
  }

  // Active subscription banner
  if (subscription.status === "active") {
    const isTopTier = subscription.plan_name === "Professional";

    return (
      <>
        <Card className="mb-6 bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/10 dark:to-emerald-950/10 border-green-200 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                  {isTopTier ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">
                      {subscription.plan_name} Plan
                    </h3>
                    <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      Active
                    </Badge>
                    {subscription.cancel_at_period_end && (
                      <Badge variant="destructive">Cancels at period end</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {subscription.cancel_at_period_end
                      ? `Your subscription will end on ${new Date(subscription.current_period_end!).toLocaleDateString()}`
                      : isTopTier
                        ? "You have access to all premium features"
                        : "Enjoying premium features"
                    }
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button
                  variant="outline"
                  onClick={() => setShowManagement(true)}
                  className="flex-1 md:flex-initial"
                >
                  Manage Plan
                </Button>
                {showUpgrade && !isTopTier && (
                  <Button
                    onClick={() => navigate("/pricing")}
                    className="flex-1 md:flex-initial"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Upgrade
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <SubscriptionManagementDialog
          open={showManagement}
          onOpenChange={setShowManagement}
          currentPlanId={subscription.plan_id}
          currentPlanName={subscription.plan_name}
          onSuccess={loadSubscriptionStatus}
        />
      </>
    );
  }

  // Canceled/past due status
  if (subscription.status === "canceled" || subscription.status === "past_due") {
    return (
      <Card className="mb-6 border-destructive bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-destructive/20">
                <Clock className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">
                  {subscription.status === "canceled" ? "Subscription Canceled" : "Payment Issue"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {urgency.message || (subscription.status === "canceled"
                    ? "Reactivate your subscription to regain access to premium features"
                    : "Please update your payment method to continue using premium features"
                  )}
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/pricing")}
              className="w-full md:w-auto"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              {cta.text}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
