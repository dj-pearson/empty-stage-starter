import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  status: string;
  billing_cycle: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const navigate = useNavigate();

  const fetchSubscription = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user_subscriptions")
        .select(
          `
          *,
          plan:subscription_plans!inner(name)
        `
        )
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setSubscription({
          ...(data as any),
          plan_name: (data as any).plan.name,
          billing_cycle: (data as any).billing_cycle || 'monthly',
        } as any);
      } else {
        setSubscription(null);
      }
    } catch (err: unknown) {
      console.error("Error fetching subscription:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("subscription-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_subscriptions",
        },
        () => {
          fetchSubscription();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const upgrade = async (planId: string, billingCycle: string) => {
    try {
      setActionLoading(true);

      const { data, error } = await supabase.functions.invoke(
        "manage-subscription",
        {
          body: {
            action: "upgrade",
            planId,
            billingCycle,
          },
        }
      );

      if (error) throw error;

      if (data.checkout_url) {
        // Redirect to checkout
        window.location.href = data.checkout_url;
      } else {
        toast.success(data.message || "Subscription updated successfully!");
        await fetchSubscription();
      }

      return { success: true };
    } catch (err: unknown) {
      console.error("Error upgrading subscription:", err);
      toast.error(err.message || "Failed to upgrade subscription");
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  const cancel = async () => {
    try {
      setActionLoading(true);

      const { data, error } = await supabase.functions.invoke(
        "manage-subscription",
        {
          body: {
            action: "cancel",
          },
        }
      );

      if (error) throw error;

      toast.success(data.message || "Subscription canceled");
      await fetchSubscription();

      return { success: true };
    } catch (err: unknown) {
      console.error("Error canceling subscription:", err);
      toast.error(err.message || "Failed to cancel subscription");
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  const reactivate = async () => {
    try {
      setActionLoading(true);

      const { data, error } = await supabase.functions.invoke(
        "manage-subscription",
        {
          body: {
            action: "reactivate",
          },
        }
      );

      if (error) throw error;

      toast.success(data.message || "Subscription reactivated");
      await fetchSubscription();

      return { success: true };
    } catch (err: unknown) {
      console.error("Error reactivating subscription:", err);
      toast.error(err.message || "Failed to reactivate subscription");
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  const changeBillingCycle = async (newCycle: string) => {
    try {
      setActionLoading(true);

      const { data, error } = await supabase.functions.invoke(
        "manage-subscription",
        {
          body: {
            action: "change_billing_cycle",
            billingCycle: newCycle,
          },
        }
      );

      if (error) throw error;

      toast.success(data.message || "Billing cycle updated");
      await fetchSubscription();

      return { success: true };
    } catch (err: unknown) {
      console.error("Error changing billing cycle:", err);
      toast.error(err.message || "Failed to change billing cycle");
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  const isActive = subscription?.status === "active";
  const isTrialing = subscription?.status === "trialing";
  const isPastDue = subscription?.status === "past_due";
  const isCanceled = subscription?.status === "canceled";
  const willCancelAtPeriodEnd = subscription?.cancel_at_period_end || false;

  return {
    subscription,
    loading,
    actionLoading,
    refetch: fetchSubscription,
    upgrade,
    cancel,
    reactivate,
    changeBillingCycle,
    // Status helpers
    isActive,
    isTrialing,
    isPastDue,
    isCanceled,
    willCancelAtPeriodEnd,
  };
}

