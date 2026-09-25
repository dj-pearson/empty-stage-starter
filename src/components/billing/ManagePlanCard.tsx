import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ExternalLink, Loader2, Mail, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { UsageStats } from '@/hooks/useUsageStats';
import { CancelSubscriptionDialog, type CancelResult } from '@/components/billing/CancelSubscriptionDialog';
import type { PlanStatus } from '@/components/billing/PlanStatusCard';
import '@/i18n/appLocale';

export const SUPPORT_EMAIL = 'support@tryeatpal.com';

const CANCELABLE = new Set(['active', 'trialing', 'past_due']);

export interface ManagePlanCardProps {
  status: PlanStatus;
  stats: UsageStats | null;
  onOpenPortal: () => void;
  portalLoading?: boolean;
  /** A cancel or reactivate request is in flight. */
  actionLoading?: boolean;
  onCancel: () => Promise<CancelResult | void>;
  onReactivate: () => Promise<unknown>;
  className?: string;
}

/**
 * The controls that are honest for whoever bills the plan. Stripe plans get
 * the portal, plan changes and cancel; an App Store plan can only be changed
 * in iPhone Settings, so it gets Apple's steps and no Stripe button; a
 * complimentary plan is ours to change, so it gets support; Free gets plans.
 */
export function ManagePlanCard({
  status,
  stats,
  onOpenPortal,
  portalLoading = false,
  actionLoading = false,
  onCancel,
  onReactivate,
  className,
}: ManagePlanCardProps) {
  const { t } = useTranslation();
  const [cancelOpen, setCancelOpen] = useState(false);

  if (status.kind === 'loading' || status.kind === 'error') return null;

  const title = t('billing.manage.title', { defaultValue: 'Manage your plan' });
  const portalIcon = portalLoading ? (
    <Loader2 className="mr-2 h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
  ) : (
    <ExternalLink className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
  );

  let content: JSX.Element;
  if (status.kind === 'stripe') {
    const sub = status.sub;
    const canCancel = CANCELABLE.has(sub.status) && !sub.cancel_at_period_end && Boolean(sub.stripe_subscription_id);
    content = (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button className="h-auto min-h-12 w-full justify-start py-3 text-left" onClick={onOpenPortal} disabled={portalLoading}>
            {portalIcon}
            <span className="flex flex-col">
              <span className="font-semibold">{t('billing.manage.portal', { defaultValue: 'Open billing portal' })}</span>
              <span className="text-xs font-normal opacity-90">
                {t('billing.manage.portalHint', { defaultValue: 'Card, invoices and receipts, on Stripe' })}
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-12 w-full justify-start py-3 text-left"
            onClick={onOpenPortal}
            disabled={portalLoading}
          >
            <ArrowUpRight className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="font-semibold">{t('billing.manage.changePlan', { defaultValue: 'Change plan' })}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {t('billing.manage.changePlanHint', { defaultValue: 'Upgrade, downgrade or switch to yearly' })}
              </span>
            </span>
          </Button>
        </div>

        {sub.cancel_at_period_end && (
          <div className="flex flex-col items-start justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
            <p className="text-sm">
              {t('billing.manage.reactivateBody', { defaultValue: 'Changed your mind? Keep {{plan}} and nothing else changes.', plan: status.planName })}
            </p>
            <Button variant="outline" onClick={() => void onReactivate()} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              <span>{t('billing.manage.reactivate', { defaultValue: 'Reactivate' })}</span>
            </Button>
          </div>
        )}

        {canCancel && (
          <div className="flex flex-col items-start justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              {sub.status === 'trialing'
                ? t('billing.manage.cancelTrialHint', { defaultValue: "Cancel before the trial ends and you won't be charged." })
                : t('billing.manage.cancelHint', { defaultValue: 'You keep everything until the end of the period you paid for.' })}
            </p>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelOpen(true)}
              disabled={actionLoading}
            >
              <span>{t('billing.manage.cancel', { defaultValue: 'Cancel plan' })}</span>
            </Button>
          </div>
        )}

        <CancelSubscriptionDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          planName={status.planName}
          periodEnd={sub.current_period_end}
          trialing={sub.status === 'trialing'}
          trialEnd={sub.trial_end}
          stats={stats}
          onConfirm={onCancel}
        />
      </div>
    );
  } else if (status.kind === 'appStore') {
    content = (
      <div className="space-y-2 text-sm">
        <p>{t('billing.manage.apple.body', { defaultValue: 'Apple bills this plan, so changes and cancellation happen on your iPhone.' })}</p>
        <p className="text-muted-foreground">
          {t('billing.manage.apple.steps', { defaultValue: 'Open Settings, tap your name, then Subscriptions, then EatPal.' })}
        </p>
      </div>
    );
  } else if (status.kind === 'comp') {
    content = (
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm">
          {t('billing.manage.comp.body', { defaultValue: "There's nothing to pay. Questions about your complimentary plan go to our team." })}
        </p>
        <Button variant="outline" asChild>
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>{t('billing.manage.comp.contact', { defaultValue: 'Contact support' })}</span>
          </a>
        </Button>
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm">
          {t('billing.manage.free.body', { defaultValue: 'More children, unlimited pantry and the AI coach come with a paid plan.' })}
        </p>
        <Button asChild>
          <Link to="/pricing">
            <ArrowUpRight className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>{t('billing.manage.free.viewPlans', { defaultValue: 'View plans' })}</span>
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
