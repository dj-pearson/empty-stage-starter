import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useFoods, useGrocery, useKids, usePlan } from "@/contexts/AppContext";
import { SubscriptionManagementDialog } from "./SubscriptionManagementDialog";
import { getSetupSteps, isSetupComplete } from "@/lib/setupSteps";
import { getSyncStorage } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import {
  APPLE_SUBSCRIPTIONS_URL,
  resolveSubscription,
  type BannerSubscription,
  type StripeSubscriptionRow,
} from "@/lib/billingBannerState";
import "@/i18n/appLocale";

const TRIAL_WARNING_DAYS = 3;
const DAY_MS = 1000 * 60 * 60 * 24;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / DAY_MS));
}

const dismissKey = (userId: string) => `eatpal:billing-upsell-dismissed:${userId}`;

function readDismissed(userId: string | null): boolean {
  if (!userId) return false;
  try {
    return getSyncStorage().getItem(dismissKey(userId)) === "1";
  } catch {
    return false;
  }
}

type Tone = "warning" | "destructive" | "secondary";

const TONE: Record<Tone, { border: string; icon: string }> = {
  warning: { border: "border-warning/50", icon: "text-warning" },
  destructive: { border: "border-destructive/50", icon: "text-destructive" },
  secondary: { border: "border-border", icon: "text-secondary-foreground" },
};

interface RowProps {
  tone: Tone;
  icon: typeof Clock;
  title: string;
  body?: string;
  children?: ReactNode;
}

function BannerRow({ tone, icon: Icon, title, body, children }: RowProps) {
  return (
    <section
      aria-labelledby="billing-banner-title"
      className={cn("flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4", TONE[tone].border)}
    >
      <Icon className={cn("h-5 w-5 shrink-0", TONE[tone].icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {/* US-860: h2 under the page heading. */}
        <h2 id="billing-banner-title" className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </section>
  );
}

/**
 * The billing row on /dashboard. Quiet by default: an active plan that is not
 * ending shows nothing. It speaks up for a trial in its last three days, a
 * plan set to cancel, a failed or canceled payment, and (once setup is done
 * and until dismissed) a single upgrade line for the free plan.
 *
 * The plan comes from two reads in parallel: the Stripe row, and
 * current_user_plan_name(), which also knows about App Store and
 * complementary plans. Without the second, an Apple subscriber (no Stripe
 * row) was shown the free upsell.
 */
export function SubscriptionStatusBanner() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const { kids, kidsHydrated } = useKids();
  const { foods, foodsHydrated } = useFoods();
  const { planEntries } = usePlan();
  const { groceryItems, groceryHydrated } = useGrocery();

  const [subscription, setSubscription] = useState<BannerSubscription | null>(null);
  const [showManagement, setShowManagement] = useState(false);
  const [dismissed, setDismissed] = useState(() => readDismissed(userId));

  useEffect(() => {
    setDismissed(readDismissed(userId));
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      return;
    }
    try {
      const [subResult, planResult] = await Promise.all([
        supabase
          .from("user_subscriptions")
          .select(
            `
            status,
            current_period_end,
            cancel_at_period_end,
            trial_end,
            plan:subscription_plans(id, name)
          `,
          )
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.rpc("current_user_plan_name"),
      ]);
      if (subResult.error) logger.error("Error loading subscription:", subResult.error);
      if (planResult.error) logger.error("Error loading plan name:", planResult.error);
      const row = (subResult.data ?? null) as StripeSubscriptionRow | null;
      const planName = typeof planResult.data === "string" ? planResult.data : null;
      setSubscription(resolveSubscription(row, planName));
    } catch (error) {
      logger.error("Error loading subscription:", error);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setupDone = useMemo(
    () =>
      isSetupComplete(
        getSetupSteps({
          kids,
          foods,
          planEntries,
          groceryItems,
          hydrated: kidsHydrated && foodsHydrated && groceryHydrated,
        }),
      ),
    [kids, foods, planEntries, groceryItems, kidsHydrated, foodsHydrated, groceryHydrated],
  );

  if (!subscription) return null;
  const plan = subscription.planName;

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(i18n.language, { month: "long", day: "numeric" }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleDateString();
    }
  };

  const manageButton =
    subscription.source === "app_store" ? (
      <a
        href={APPLE_SUBSCRIPTIONS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
      >
        {t("billing.banner.manage", { defaultValue: "Manage" })}
      </a>
    ) : (
      <Button variant="outline" className="min-h-11" onClick={() => setShowManagement(true)}>
        {t("billing.banner.manage", { defaultValue: "Manage" })}
      </Button>
    );

  const upgradeLink = (label: string) => (
    <Link to="/pricing" className={cn(buttonVariants(), "min-h-11")}>
      {label}
    </Link>
  );

  // Trial: only in its last three days.
  if (subscription.status === "trialing") {
    const days = daysUntil(subscription.trialEnd);
    if (days === null || days > TRIAL_WARNING_DAYS) return null;
    const title =
      days === 0
        ? t("billing.banner.trialEndsToday", { defaultValue: "Your free trial ends today" })
        : t("billing.banner.trialDaysLeft", {
            count: days,
            defaultValue_one: "{{count}} day left in your free trial",
            defaultValue_other: "{{count}} days left in your free trial",
          });
    return (
      <BannerRow
        tone="warning"
        icon={Clock}
        title={title}
        body={t("billing.banner.trialBody", {
          plan,
          defaultValue: "Upgrade to keep {{plan}} features after the trial.",
        })}
      >
        {upgradeLink(t("billing.banner.upgrade", { defaultValue: "Upgrade" }))}
      </BannerRow>
    );
  }

  if (subscription.status === "past_due") {
    return (
      <BannerRow
        tone="destructive"
        icon={AlertTriangle}
        title={t("billing.banner.pastDue", { defaultValue: "Your last payment didn't go through" })}
        body={t("billing.banner.pastDueBody", {
          plan,
          defaultValue: "Update your payment method to keep {{plan}} features.",
        })}
      >
        {upgradeLink(t("billing.banner.updatePayment", { defaultValue: "Update payment" }))}
      </BannerRow>
    );
  }

  if (subscription.status === "canceled") {
    return (
      <BannerRow
        tone="warning"
        icon={AlertTriangle}
        title={t("billing.banner.canceled", { plan, defaultValue: "Your {{plan}} plan was canceled" })}
        body={t("billing.banner.canceledBody", { defaultValue: "Reactivate to get premium features back." })}
      >
        {upgradeLink(t("billing.banner.reactivate", { defaultValue: "Reactivate" }))}
      </BannerRow>
    );
  }

  if (subscription.status === "active") {
    if (!subscription.cancelAtPeriodEnd) return null;
    return (
      <>
        <BannerRow
          tone="warning"
          icon={Clock}
          title={t("billing.banner.cancelling", {
            plan,
            date: formatDate(subscription.currentPeriodEnd),
            defaultValue: "Your {{plan}} plan ends on {{date}}",
          })}
          body={t("billing.banner.cancellingBody", { defaultValue: "You keep every feature until then." })}
        >
          {manageButton}
        </BannerRow>
        {subscription.source === "stripe" && subscription.planId && (
          <SubscriptionManagementDialog
            open={showManagement}
            onOpenChange={setShowManagement}
            currentPlanId={subscription.planId}
            currentPlanName={plan}
            onSuccess={() => void load()}
          />
        )}
      </>
    );
  }

  // Free plan: one quiet line, only once the account is set up.
  if (subscription.source === "free" && setupDone && !dismissed) {
    const dismiss = () => {
      setDismissed(true);
      if (!userId) return;
      try {
        getSyncStorage().setItem(dismissKey(userId), "1");
      } catch {
        // Storage blocked: the dismissal lasts for this visit only.
      }
    };
    return (
      <BannerRow
        tone="secondary"
        icon={Sparkles}
        title={t("billing.banner.freeUpsell", {
          defaultValue: "Get AI meal plans and unlimited recipes with Pro",
        })}
      >
        {upgradeLink(t("billing.banner.upgrade", { defaultValue: "Upgrade" }))}
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={dismiss}
          aria-label={t("billing.banner.dismiss", { defaultValue: "Dismiss" })}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </BannerRow>
    );
  }

  return null;
}
