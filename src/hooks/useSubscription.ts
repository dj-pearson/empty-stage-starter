import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * The caller's Stripe row in user_subscriptions, with its plan's name.
 *
 * This is the Stripe record only. It is not the plan EatPal enforces: an App
 * Store or complimentary plan never appears here, and the effective plan is
 * resolved server-side by effective_plan_id (read it through usePlanStatus,
 * which asks get_usage_stats). Use this row for Stripe-specific controls.
 */
export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  plan_name: string;
  status: string;
  /** Null when Stripe has not told us; never defaulted to 'monthly'. */
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

type SubscriptionRow = Database['public']['Tables']['user_subscriptions']['Row'] & {
  plan: { name: string };
};

type ActionResult = { success: true } | { success: false; error: string };

type ManageAction = "cancel" | "reactivate" | "change_billing_cycle";

const REALTIME_DEBOUNCE_MS = 300;

// supabase.channel() returns the existing channel for a topic it already has,
// and Billing and the Settings plan section each mount this hook twice (once
// directly, once through usePlanStatus). A second .on() on the shared channel
// after the first subscribe() leaves the client with one more postgres_changes
// binding than the server acknowledged, and realtime-js then drops the channel
// with "mismatch between server and client bindings". One topic per instance.
let channelInstanceSeq = 0;

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    user_id: row.user_id,
    plan_id: row.plan_id,
    plan_name: row.plan.name,
    status: row.status,
    billing_cycle: row.billing_cycle,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end ?? false,
    trial_end: row.trial_end,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    is_complementary: row.is_complementary ?? false,
    complementary_subscription_id: row.complementary_subscription_id,
  };
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return new Error(err.message);
  }
  return new Error("Failed to load subscription");
}

/** The signed-in user's id, from context when it has resolved, else the local session. */
async function resolveUserId(contextUserId: string | null): Promise<string | null> {
  if (contextUserId) return contextUserId;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export function useSubscription() {
  const { t } = useTranslation();
  const { userId: authUserId } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  // `loading` is the first load only. Later fetches set `refreshing`, so a
  // realtime nudge or a retry never blanks a page that already has a row.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Guard subscription-state writes: realtime can fire fetchSubscription many
  // times in quick succession, so ignore any response that isn't the latest
  // in-flight fetch (out-of-order stale overwrite) or that lands after unmount.
  const isMountedRef = useRef(true);
  const fetchSeqRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const channelSuffixRef = useRef<number | null>(null);
  if (channelSuffixRef.current === null) channelSuffixRef.current = ++channelInstanceSeq;
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Fetch the row. Resolves to the fetched subscription (null for none), or
   * undefined when the fetch failed; on failure the previous row stays in
   * state and `error` is set.
   */
  const loadSubscription = useCallback(async (): Promise<Subscription | null | undefined> => {
    const seq = ++fetchSeqRef.current;
    const isLatest = () => isMountedRef.current && seq === fetchSeqRef.current;
    const apply = (fn: () => void) => {
      if (isLatest()) fn();
    };
    apply(() => {
      setError(null);
      if (hasLoadedRef.current) setRefreshing(true);
    });
    try {
      const userId = await resolveUserId(authUserId);
      if (!userId) {
        apply(() => setSubscription(null));
        hasLoadedRef.current = true;
        return null;
      }

      const { data, error: queryError } = await supabase
        .from("user_subscriptions")
        .select(
          `
          *,
          plan:subscription_plans!inner(name)
        `
        )
        .eq("user_id", userId)
        .maybeSingle<SubscriptionRow>();

      if (queryError && queryError.code !== "PGRST116") {
        throw queryError;
      }

      const next = data ? toSubscription(data) : null;
      apply(() => setSubscription(next));
      hasLoadedRef.current = true;
      return next;
    } catch (err: unknown) {
      logger.error("Error fetching subscription:", err);
      // Keep the last good row: a dropped connection must not read as "no
      // subscription" and offer checkout to someone who is paying.
      apply(() => setError(toError(err)));
      return undefined;
    } finally {
      apply(() => {
        setLoading(false);
        setRefreshing(false);
      });
    }
  }, [authUserId]);

  const fetchSubscription = useCallback(async (): Promise<void> => {
    await loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    void loadSubscription();

    // Scope the realtime channel to THIS user's own subscription row. Without a
    // filter, every user's billing change woke every connected client with a
    // refetch (needless fan-out); data isolation still relies on RLS, but the
    // filter avoids the wasted work and is more robust if RLS is ever loosened.
    resolveUserId(authUserId)
      .then((userId) => {
        if (cancelled || !userId) return;
        logger.debug('Subscribing to subscription-updates');
        channel = supabase
          .channel(`subscription-updates:${userId}:${channelSuffixRef.current}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "user_subscriptions",
              filter: `user_id=eq.${userId}`,
            },
            () => {
              // A Stripe webhook often writes the row several times in a burst.
              if (debounce) clearTimeout(debounce);
              debounce = setTimeout(() => {
                void loadSubscription();
              }, REALTIME_DEBOUNCE_MS);
            }
          )
          .subscribe();
      })
      .catch((err: unknown) => logger.error("Error subscribing to subscription-updates:", err));

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      logger.debug('Unsubscribing from subscription-updates');
      if (channel) supabase.removeChannel(channel);
    };
  }, [authUserId, loadSubscription]);

  const upgrade = async (planId: string, billingCycle: string): Promise<ActionResult> => {
    try {
      setActionLoading(true);

      // Check if user has complementary subscription
      if (subscription?.is_complementary) {
        const message = t("billing.planData.toast.compNoChange", {
          defaultValue: "You have complimentary access to a plan. Please contact support to make changes.",
        });
        toast.error(message);
        return { success: false, error: message };
      }

      const { data, error } = await invokeEdgeFunction<{ checkout_url?: string; message?: string }>(
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

      if (data?.checkout_url) {
        // Redirect to checkout
        window.location.href = data.checkout_url;
      } else {
        toast.success(t("billing.planData.toast.updated", { defaultValue: "Subscription updated." }));
        await loadSubscription();
      }

      return { success: true };
    } catch (err) {
      logger.error("Error upgrading subscription:", err);
      // Translated copy, never err.message: that reads "Edge Function
      // 'manage-subscription' failed: ..." and is not for a parent's eyes.
      const errorMessage = t("billing.planData.toast.upgradeFailed", {
        defaultValue: "We couldn't change your plan. Please try again.",
      });
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Run a manage-subscription action and report what actually happened.
   *
   * DEFERRED EDGE FIX: supabase/functions/manage-subscription declares
   * corsHeaders inside its default export, but the module-level handlers
   * (cancel, reactivate, change plan, change billing cycle) reference it when
   * building their success response. So every one of them throws AFTER the
   * Stripe and database writes have landed, and the client receives an error
   * for a change that was applied. Until that function is fixed, a failure is
   * not taken at its word: refetch the row, and when it already shows the
   * intended state, report success. Remove this once the edge fix ships.
   */
  const runManageAction = async (
    body: { action: ManageAction; billingCycle?: string },
    reached: (sub: Subscription | null) => boolean,
    copy: { success: string; failure: string }
  ): Promise<ActionResult> => {
    try {
      setActionLoading(true);
      let failed = false;
      try {
        const { error } = await invokeEdgeFunction("manage-subscription", { body });
        if (error) {
          logger.error(`manage-subscription ${body.action} returned an error:`, error);
          failed = true;
        }
      } catch (err) {
        logger.error(`manage-subscription ${body.action} rejected:`, err);
        failed = true;
      }

      const refreshed = await loadSubscription();

      if (failed && !(refreshed !== undefined && reached(refreshed))) {
        toast.error(copy.failure);
        return { success: false, error: copy.failure };
      }

      toast.success(copy.success);
      return { success: true };
    } finally {
      setActionLoading(false);
    }
  };

  const cancel = () =>
    runManageAction(
      { action: "cancel" },
      (sub) => sub?.cancel_at_period_end === true,
      {
        success: t("billing.planData.toast.canceled", {
          defaultValue: "Your subscription will end at the close of this billing period.",
        }),
        failure: t("billing.planData.toast.cancelFailed", {
          defaultValue: "We couldn't cancel your subscription. Please try again.",
        }),
      }
    );

  const reactivate = () =>
    runManageAction(
      { action: "reactivate" },
      (sub) => sub !== null && sub.cancel_at_period_end === false,
      {
        success: t("billing.planData.toast.reactivated", {
          defaultValue: "Your subscription will keep renewing.",
        }),
        failure: t("billing.planData.toast.reactivateFailed", {
          defaultValue: "We couldn't reactivate your subscription. Please try again.",
        }),
      }
    );

  const changeBillingCycle = (newCycle: string) =>
    runManageAction(
      { action: "change_billing_cycle", billingCycle: newCycle },
      (sub) => sub?.billing_cycle === newCycle,
      {
        success: t("billing.planData.toast.cycleChanged", {
          defaultValue: "Billing cycle updated.",
        }),
        failure: t("billing.planData.toast.cycleFailed", {
          defaultValue: "We couldn't change your billing cycle. Please try again.",
        }),
      }
    );

  const isActive = subscription?.status === "active";
  const isTrialing = subscription?.status === "trialing";
  const isPastDue = subscription?.status === "past_due";
  const isCanceled = subscription?.status === "canceled";
  const isPaused = subscription?.status === "paused";
  const willCancelAtPeriodEnd = subscription?.cancel_at_period_end || false;

  return {
    subscription,
    loading,
    refreshing,
    error,
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
    isPaused,
    willCancelAtPeriodEnd,
  };
}
