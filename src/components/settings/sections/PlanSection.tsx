import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanStatusCard } from '@/components/billing/PlanStatusCard';
import { ManagePlanCard } from '@/components/billing/ManagePlanCard';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useSubscription } from '@/hooks/useSubscription';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { openBillingPortal } from '@/lib/billingPortal';
import '@/i18n/appLocale';

/**
 * Settings hub, "Plan and billing". Shows the same plan card as
 * /dashboard/billing (the plan the server enforces, and who bills it) and the
 * same source-honest controls: Stripe plans change and cancel through the
 * portal, App Store plans in iPhone Settings, complimentary plans through
 * support. Usage and plan contents live on /dashboard/billing (US-769).
 */
export function PlanSection() {
  const { t } = useTranslation();
  const { status, stats, refreshing, refetch } = usePlanStatus();
  const { actionLoading, cancel, reactivate } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard/billing">
            <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>{t('settings.plan.billingLink', { defaultValue: 'Billing and invoices' })}</span>
          </Link>
        </Button>
      </div>

      <PlanStatusCard
        status={status}
        refreshing={refreshing}
        onRefresh={() => void refetch()}
        onOpenPortal={() => void openPortal()}
        portalLoading={portalLoading}
      />

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
  );
}
