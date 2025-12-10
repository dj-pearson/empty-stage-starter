import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
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
  is_complementary: boolean;
  complementary_subscription_id: string | null;
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
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setSubscription({
          ...(data as any),
          plan_name: (data as any).plan.name,
          billing_cycle: (data as any).billing_cycle || 'monthly',
          is_complementary: (data as any).is_complementary || false,
          complementary_subscription_id: (data as any).complementary_subscription_id || null,
        } as any);
      } else {
        // Check for active complementary subscription
        // @ts-ignore - RPC function exists but not in generated types
        const { data: compData } = await supabase
          // @ts-ignore - RPC function exists but not in generated types
          .rpc('get_complementary_subscription', { p_user_id: user.id })
          .maybeSingle();

        if (compData) {
          // User has complementary subscription but no user_subscriptions record
          // Fetch the plan details
          const { data: planData } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', (compData as any).plan_id)
            .single();

          if (planData) {
            setSubscription({
              id: (compData as any).id,
              user_id: user.id,
              plan_id: (compData as any).plan_id,
              plan_name: (compData as any).plan_name,
              status: 'active',
              billing_cycle: null,
              current_period_start: null,
              current_period_end: (compData as any).end_date,
              cancel_at_period_end: false,
              trial_end: null,
              stripe_customer_id: null,
              stripe_subscription_id: null,
              is_complementary: true,
              complementary_subscription_id: (compData as any).id,
            } as any);
          } else {
            setSubscription(null);
          }
        } else {
          setSubscription(null);
        }
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

      // Check if user has complementary subscription
      if (subscription?.is_complementary) {
        toast.error("You have complementary access to a plan. Please contact support to make changes.");
        return { success: false, error: "Complementary subscription cannot be upgraded directly" };
      }

      const { data, error } = await invokeEdgeFunction(
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
    } catch (err) {
      console.error("Error upgrading subscription:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to upgrade subscription";
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setActionLoading(false);
    }
  };

  const cancel = async () => {
    try {
      setActionLoading(true);

      const { data, error } = await invokeEdgeFunction(
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
    } catch (err) {
      console.error("Error canceling subscription:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to cancel subscription";
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setActionLoading(false);
    }
  };

  const reactivate = async () => {
    try {
      setActionLoading(true);

      const { data, error } = await invokeEdgeFunction(
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
    } catch (err) {
      console.error("Error reactivating subscription:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to reactivate subscription";
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setActionLoading(false);
    }
  };

  const changeBillingCycle = async (newCycle: string) => {
    try {
      setActionLoading(true);

      const { data, error } = await invokeEdgeFunction(
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
    } catch (err) {
      console.error("Error changing billing cycle:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to change billing cycle";
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
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

