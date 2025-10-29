import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, TrendingUp, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { SubscriptionManagementDialog } from "./SubscriptionManagementDialog";

interface SubscriptionStatus {
  plan_name: string;
  status: "trialing" | "active" | "canceled" | "past_due" | null;
  trial_end_date: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_id: string;
}

export function SubscriptionStatusBanner() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
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
          plan:subscription_plans(id, name)
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      if (userSub && userSub.plan) {
        const subStatus: SubscriptionStatus = {
          plan_name: (userSub.plan as any).name,
          status: userSub.status as any,
          trial_end_date: userSub.status === "trialing" ? userSub.current_period_end : null,
          current_period_end: userSub.current_period_end,
          cancel_at_period_end: userSub.cancel_at_period_end,
          plan_id: (userSub.plan as any).id,
        };

        setSubscription(subStatus);

        // Calculate days remaining
        if (subStatus.trial_end_date) {
          const now = new Date();
          const trialEnd = new Date(subStatus.trial_end_date);
          const days = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          setDaysRemaining(days > 0 ? days : 0);
        }
      }
    } catch (error) {
      console.error("Error loading subscription:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !subscription) return null;

  // Show trial banner
  if (subscription.status === "trialing" && daysRemaining !== null) {
    return (
      <>
        <Card className="mb-6 border-primary bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-primary/20">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">
                    {daysRemaining} {daysRemaining === 1 ? "Day" : "Days"} Left in Your Free Trial
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    You're on the <strong>{subscription.plan_name}</strong> plan. 
                    Upgrade now to continue enjoying all features after your trial ends.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button 
                  onClick={() => navigate("/pricing")}
                  className="flex-1 md:flex-initial"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Upgrade Now
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

  // Show active subscription banner
  if (subscription.status === "active") {
    return (
      <>
        <Card className="mb-6 bg-gradient-to-r from-accent/5 to-primary/5">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">
                      {subscription.plan_name} Plan
                    </h3>
                    <Badge variant="secondary">Active</Badge>
                    {subscription.cancel_at_period_end && (
                      <Badge variant="destructive">Cancels at period end</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {subscription.cancel_at_period_end 
                      ? `Your subscription will end on ${new Date(subscription.current_period_end!).toLocaleDateString()}`
                      : "Enjoying all premium features"
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
                {subscription.plan_name !== "Professional" && (
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

  // Show canceled/past due status
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
                  {subscription.status === "canceled" 
                    ? "Reactivate your subscription to regain access to premium features"
                    : "Please update your payment method to continue using premium features"
                  }
                </p>
              </div>
            </div>
            <Button 
              onClick={() => navigate("/pricing")}
              className="w-full md:w-auto"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              View Plans
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
