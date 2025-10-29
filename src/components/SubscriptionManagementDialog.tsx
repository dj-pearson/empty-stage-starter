import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowUp, ArrowDown, Check } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  sort_order: number;
  features: string[];
}

interface SubscriptionManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlanId: string;
  currentPlanName: string;
  onSuccess: () => void;
}

export function SubscriptionManagementDialog({
  open,
  onOpenChange,
  currentPlanId,
  currentPlanName,
  onSuccess,
}: SubscriptionManagementDialogProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      loadPlans();
    }
  }, [open]);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, price_monthly, sort_order, features")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      
      setPlans((data || []).map(plan => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features as string[] : []
      })));
    } catch (error) {
      console.error("Error loading plans:", error);
      toast.error("Failed to load plans");
    }
  };

  const currentPlan = plans.find(p => p.id === currentPlanId);
  const currentSortOrder = currentPlan?.sort_order || 0;

  const isUpgrade = (plan: Plan) => plan.sort_order > currentSortOrder;
  const isDowngrade = (plan: Plan) => plan.sort_order < currentSortOrder;
  const isCurrent = (plan: Plan) => plan.id === currentPlanId;

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
  };

  const handleConfirm = async () => {
    if (!selectedPlanId) return;

    const selectedPlan = plans.find(p => p.id === selectedPlanId);
    if (!selectedPlan) return;

    setLoading(true);

    try {
      // For free plan downgrades
      if (selectedPlan.price_monthly === 0) {
        toast.info("Downgrade will take effect at the end of your current billing period");
        onOpenChange(false);
        return;
      }

      // For paid plan upgrades/changes - redirect to pricing
      toast.info("Redirecting to checkout...");
      onOpenChange(false);
      navigate("/pricing");
    } catch (error) {
      console.error("Error managing subscription:", error);
      toast.error("Failed to update subscription. Please contact support.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Your Subscription</DialogTitle>
          <DialogDescription>
            Change your plan to better suit your needs. Upgrades take effect immediately.
            Downgrades apply at the end of your current billing period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              const showUpgradeBadge = isUpgrade(plan);
              const showDowngradeBadge = isDowngrade(plan);
              const showCurrentBadge = isCurrent(plan);

              return (
                <Card
                  key={plan.id}
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary shadow-lg ring-2 ring-primary/20"
                      : showCurrentBadge
                      ? "border-primary/50"
                      : "hover:border-muted-foreground/50"
                  } ${showCurrentBadge ? "bg-primary/5" : ""}`}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <div className="flex flex-col gap-1">
                        {showCurrentBadge && (
                          <Badge variant="secondary">Current Plan</Badge>
                        )}
                        {showUpgradeBadge && (
                          <Badge className="bg-gradient-to-r from-primary to-accent">
                            <ArrowUp className="w-3 h-3 mr-1" />
                            Upgrade
                          </Badge>
                        )}
                        {showDowngradeBadge && (
                          <Badge variant="outline">
                            <ArrowDown className="w-3 h-3 mr-1" />
                            Downgrade
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription className="text-2xl font-bold mt-2">
                      {plan.price_monthly === 0 ? (
                        "Free"
                      ) : (
                        <>
                          ${plan.price_monthly}
                          <span className="text-sm font-normal text-muted-foreground">
                            /month
                          </span>
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {plan.features.slice(0, 5).map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                      {plan.features.length > 5 && (
                        <li className="text-sm text-muted-foreground">
                          + {plan.features.length - 5} more features
                        </li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {selectedPlanId && selectedPlanId !== currentPlanId && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {isUpgrade(plans.find(p => p.id === selectedPlanId)!)
                  ? "✨ Upgrade takes effect immediately and you'll be prorated for the remaining time in your billing period."
                  : "⏰ Downgrade will take effect at the end of your current billing period. You'll retain access to current features until then."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedPlanId || selectedPlanId === currentPlanId || loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {selectedPlanId && selectedPlanId !== currentPlanId
              ? isUpgrade(plans.find(p => p.id === selectedPlanId)!)
                ? "Upgrade Plan"
                : "Schedule Downgrade"
              : "Select a Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
