import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  TrendingUp,
  TrendingDown,
  X,
  RefreshCw,
  Calendar,
  CreditCard,
  Loader2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  sort_order: number;
}

interface EnhancedSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EnhancedSubscriptionDialog({
  open,
  onOpenChange,
  onSuccess,
}: EnhancedSubscriptionDialogProps) {
  const { subscription, upgrade, cancel, reactivate, changeBillingCycle, actionLoading } = useSubscription();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"upgrade" | "downgrade" | "cancel" | null>(null);

  useEffect(() => {
    if (open) {
      loadPlans();
    }
  }, [open]);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      setPlans(data || []);
    } catch (error: any) {
      console.error("Error loading plans:", error);
      toast.error("Failed to load plans");
    } finally {
      setLoading(false);
    }
  };

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id);
  const selectedPlanData = plans.find((p) => p.id === selectedPlan);

  const isUpgrade = selectedPlanData && currentPlan 
    ? selectedPlanData.sort_order > currentPlan.sort_order 
    : false;
  const isDowngrade = selectedPlanData && currentPlan 
    ? selectedPlanData.sort_order < currentPlan.sort_order 
    : false;

  const handlePlanChange = () => {
    if (!selectedPlan) return;
    
    if (isUpgrade) {
      setConfirmAction("upgrade");
    } else if (isDowngrade) {
      setConfirmAction("downgrade");
    }
    
    setShowConfirmation(true);
  };

  const handleConfirmChange = async () => {
    if (!selectedPlan) return;

    const result = await upgrade(selectedPlan, billingCycle);
    if (result.success) {
      setShowConfirmation(false);
      onSuccess?.();
      if (!result.success) {
        onOpenChange(false);
      }
    }
  };

  const handleCancelSubscription = async () => {
    const result = await cancel();
    if (result.success) {
      setShowConfirmation(false);
      onSuccess?.();
      onOpenChange(false);
    }
  };

  const handleReactivate = async () => {
    const result = await reactivate();
    if (result.success) {
      onSuccess?.();
    }
  };

  const formatPrice = (plan: Plan, cycle: "monthly" | "yearly") => {
    const price = cycle === "monthly" ? plan.price_monthly : plan.price_yearly;
    return price === 0 ? "Free" : `$${price}`;
  };

  const getSavings = (plan: Plan) => {
    if (plan.price_monthly === 0 || plan.price_yearly === 0) return null;
    const yearlyMonthly = plan.price_yearly / 12;
    const savings = ((plan.price_monthly - yearlyMonthly) / plan.price_monthly) * 100;
    return Math.round(savings);
  };

  if (!subscription) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Your Subscription</DialogTitle>
          <DialogDescription>
            Upgrade, downgrade, or cancel your subscription
          </DialogDescription>
        </DialogHeader>

        {/* Current Subscription Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Current Plan: {currentPlan?.name || "Loading..."}</CardTitle>
                <CardDescription>
                  {subscription.billing_cycle && (
                    <>Billed {subscription.billing_cycle}</>
                  )}
                </CardDescription>
              </div>
              <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                {subscription.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {subscription.current_period_end && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  {subscription.cancel_at_period_end 
                    ? `Ends on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                    : `Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                  }
                </span>
              </div>
            )}
            {subscription.cancel_at_period_end && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Your subscription will be canceled at the end of the billing period</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReactivate}
                    disabled={actionLoading}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Reactivate
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {!showConfirmation ? (
          <>
            {/* Billing Cycle Toggle */}
            <div className="space-y-3">
              <Label>Billing Cycle</Label>
              <RadioGroup 
                value={billingCycle} 
                onValueChange={(v) => setBillingCycle(v as "monthly" | "yearly")}
                className="grid grid-cols-2 gap-4"
              >
                <Label
                  htmlFor="monthly"
                  className="flex items-center justify-between rounded-lg border-2 border-muted p-4 hover:bg-accent hover:border-accent-foreground cursor-pointer [&:has([data-state=checked])]:border-primary"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="monthly" id="monthly" />
                    <span className="font-medium">Monthly</span>
                  </div>
                </Label>
                <Label
                  htmlFor="yearly"
                  className="flex items-center justify-between rounded-lg border-2 border-muted p-4 hover:bg-accent hover:border-accent-foreground cursor-pointer [&:has([data-state=checked])]:border-primary"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="yearly" id="yearly" />
                    <span className="font-medium">Yearly</span>
                    {plans.length > 0 && getSavings(plans[1]) && (
                      <Badge variant="secondary" className="ml-2">
                        Save {getSavings(plans[1])}%
                      </Badge>
                    )}
                  </div>
                </Label>
              </RadioGroup>
            </div>

            {/* Available Plans */}
            <div className="space-y-3">
              <Label>Select Plan</Label>
              {loading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {plans.map((plan) => (
                    <Card
                      key={plan.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedPlan === plan.id
                          ? "border-primary border-2"
                          : plan.id === subscription.plan_id
                          ? "border-green-500 border-2"
                          : ""
                      }`}
                      onClick={() => setSelectedPlan(plan.id)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{plan.name}</CardTitle>
                            <CardDescription className="text-2xl font-bold mt-2">
                              {formatPrice(plan, billingCycle)}
                              {plan.price_monthly > 0 && (
                                <span className="text-sm font-normal text-muted-foreground">
                                  /{billingCycle === "monthly" ? "mo" : "yr"}
                                </span>
                              )}
                            </CardDescription>
                          </div>
                          {plan.id === subscription.plan_id && (
                            <Badge variant="outline" className="bg-green-50 border-green-200">
                              Current
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 text-sm">
                          {plan.features.slice(0, 4).map((feature, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <Separator />
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmAction("cancel");
                  setShowConfirmation(true);
                }}
                disabled={actionLoading || subscription.cancel_at_period_end}
                className="text-destructive hover:bg-destructive/10"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel Subscription
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  onClick={handlePlanChange}
                  disabled={
                    !selectedPlan ||
                    selectedPlan === subscription.plan_id ||
                    actionLoading
                  }
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : isUpgrade ? (
                    <TrendingUp className="w-4 h-4 mr-2" />
                  ) : isDowngrade ? (
                    <TrendingDown className="w-4 h-4 mr-2" />
                  ) : null}
                  {isUpgrade ? "Upgrade Plan" : isDowngrade ? "Downgrade Plan" : "Change Plan"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Confirmation Screen */
          <div className="space-y-4 py-6">
            {confirmAction === "cancel" ? (
              <>
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Are you sure you want to cancel your subscription? You'll lose access to all premium features at the end of your billing period.
                  </AlertDescription>
                </Alert>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                    Keep Subscription
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleCancelSubscription}
                    disabled={actionLoading}
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Confirm Cancellation
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {isUpgrade ? (
                      <>You'll be charged a prorated amount for the upgrade and your next billing date will be adjusted.</>
                    ) : (
                      <>Your plan will be downgraded at the end of your current billing period.</>
                    )}
                  </AlertDescription>
                </Alert>
                <div className="space-y-2 p-4 bg-muted rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span>Current Plan:</span>
                    <span className="font-medium">{currentPlan?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>New Plan:</span>
                    <span className="font-medium">{selectedPlanData?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Billing:</span>
                    <span className="font-medium">{billingCycle === "monthly" ? "Monthly" : "Yearly"}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>New Price:</span>
                    <span>{selectedPlanData && formatPrice(selectedPlanData, billingCycle)}</span>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmChange}
                    disabled={actionLoading}
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Confirm {isUpgrade ? "Upgrade" : "Downgrade"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

