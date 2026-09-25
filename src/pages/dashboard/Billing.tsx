import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { usePlanStatus } from "@/hooks/usePlanStatus";
import { useSubscription } from "@/hooks/useSubscription";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { openBillingPortal } from "@/lib/billingPortal";
import { PlanStatusCard } from "@/components/billing/PlanStatusCard";
import { PlanUsageSection } from "@/components/billing/PlanUsageSection";
import { ManagePlanCard } from "@/components/billing/ManagePlanCard";
import "@/i18n/appLocale";

/**
 * /dashboard/billing. Answers, in order: which plan EatPal enforces and who
 * bills it (PlanStatusCard), how close the household is to each limit
 * (PlanUsageSection), and what can be done from here for that billing source
 * (ManagePlanCard). The plan of record is usePlanStatus, which reads
 * get_usage_stats; the Stripe row only drives Stripe controls.
 */
export default function Billing() {
  const { t } = useTranslation();
  const { status, stats, usageError, refreshing, refetch } = usePlanStatus();
  const { actionLoading, cancel, reactivate } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

  // Coming back from the Stripe portal or iPhone Settings: show what changed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);

  const openPortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      await openBillingPortal({ invoke: invokeEdgeFunction, t });
    } finally {
      setPortalLoading(false);
    }
  }, [t]);

  const handleCancel = useCallback(async () => {
    const result = await cancel();
    if (result.success) await refetch();
    return result;
  }, [cancel, refetch]);

  const handleReactivate = useCallback(async () => {
    const result = await reactivate();
    if (result.success) await refetch();
    return result;
  }, [reactivate, refetch]);

  const sourceKind = status.kind === "loading" || status.kind === "error" ? null : status.kind;

  return (
    <>
      <Helmet>
        <title>{t("billing.page.metaTitle", { defaultValue: "Plan and billing - EatPal" })}</title>
        <meta name="description" content={t("billing.page.metaDescription", { defaultValue: "Your EatPal plan, usage and billing" })} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="container mx-auto max-w-3xl px-4 py-6 md:p-6">
        <div className="mb-6">
          <h1 className="mb-2 text-3xl font-bold">{t("billing.page.title", { defaultValue: "Plan and billing" })}</h1>
          <p className="max-w-prose text-muted-foreground">
            {t("billing.page.subtitle", { defaultValue: "The plan your account has, what it includes, and how it's billed." })}
          </p>
        </div>

        <div className="space-y-6">
          <PlanStatusCard
            status={status}
            refreshing={refreshing}
            onRefresh={() => void refetch()}
            onOpenPortal={() => void openPortal()}
            portalLoading={portalLoading}
          />

          {status.kind !== "error" && (
            <PlanUsageSection
              stats={stats}
              error={usageError}
              loading={status.kind === "loading" || refreshing}
              sourceKind={sourceKind ?? undefined}
              onRetry={() => void refetch()}
              onOpenPortal={() => void openPortal()}
            />
          )}

          <ManagePlanCard
            status={status}
            stats={stats}
            onOpenPortal={() => void openPortal()}
            portalLoading={portalLoading}
            actionLoading={actionLoading}
            onCancel={handleCancel}
            onReactivate={handleReactivate}
          />
        </div>
      </div>
    </>
  );
}
