import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, Crown, ExternalLink, Gift, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { PlanStatus } from '@/lib/planSource';
import type { Subscription } from '@/hooks/useSubscription';
import { APPLE_SUBSCRIPTIONS_URL } from '@/lib/billingBannerState';
import { daysLeft, formatPlanDate, periodProgress } from '@/lib/subscription-helpers';
import { cn } from '@/lib/utils';
import '@/i18n/appLocale';

export type { PlanStatus };

export interface PlanStatusCardProps {
  status: PlanStatus;
  /** A refetch is in flight. The content stays; the card is marked busy. */
  refreshing?: boolean;
  onRefresh: () => void;
  /** Opens the Stripe portal. Offered only on banners that need it. */
  onOpenPortal?: () => void;
  portalLoading?: boolean;
  className?: string;
}

/**
 * Which plan EatPal enforces for this account, and who bills it. Renders the
 * PlanStatus union from usePlanStatus and nothing else: it never infers a plan
 * from the Stripe row on its own, so a load failure is an error, not "Free".
 */
export function PlanStatusCard({ status, refreshing = false, onRefresh, onOpenPortal, portalLoading = false, className }: PlanStatusCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const date = (iso: string | null | undefined): string | null => (iso ? formatPlanDate(iso, locale) || null : null);

  if (status.kind === 'loading') {
    return (
      <Card className={className} aria-busy="true">
        <CardHeader>
          <span className="sr-only">{t('billing.status.loading', { defaultValue: 'Loading your plan' })}</span>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (status.kind === 'error') {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div role="alert" className="flex items-start gap-3">
            {status.offline ? (
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <div className="space-y-3">
              <p className="font-medium">
                {status.offline
                  ? t('billing.status.error.offline', { defaultValue: "You're offline. Your plan will show when you're back online." })
                  : t('billing.status.error.body', { defaultValue: "Couldn't load your plan. Nothing about your billing has changed." })}
              </p>
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                {refreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                <span>{t('billing.status.error.retry', { defaultValue: 'Try again' })}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const refreshButton = (
    <Button
      variant="ghost"
      size="icon"
      className="min-h-11 min-w-11 shrink-0"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={t('billing.status.refresh', { defaultValue: 'Refresh plan details' })}
    >
      <RefreshCw className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
    </Button>
  );

  const portalButton = (label: string) =>
    onOpenPortal ? (
      <Button variant="outline" size="sm" className="mt-3" onClick={onOpenPortal} disabled={portalLoading}>
        {portalLoading ? (
          <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        <span>{label}</span>
      </Button>
    ) : null;

  return (
    <Card className={className} aria-busy={refreshing ? 'true' : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{t('billing.status.heading', { defaultValue: 'Your plan' })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              {status.kind === 'free' ? (
                t('billing.status.free.title', { defaultValue: 'Free plan' })
              ) : (
                <>
                  <Crown className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  {status.planName}
                </>
              )}
            </CardTitle>
            {status.kind === 'stripe' && <StripeStatusBadge status={status.sub.status} canceling={status.sub.cancel_at_period_end} />}
          </div>
        </div>
        {refreshButton}
      </CardHeader>

      <CardContent className="space-y-4">
        {status.kind === 'free' && (
          <div className="space-y-1">
            {status.endedPlan && (
              <p className="text-sm">
                {status.endedPlan.endedAt
                  ? t('billing.status.free.ended', {
                      defaultValue: 'Your {{plan}} plan ended on {{date}}.',
                      plan: status.endedPlan.name,
                      date: date(status.endedPlan.endedAt),
                    })
                  : t('billing.status.free.endedNoDate', {
                      defaultValue: 'Your {{plan}} plan has ended.',
                      plan: status.endedPlan.name,
                    })}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {t('billing.status.free.body', { defaultValue: "You're not being charged. Your kids, foods and plans are all here." })}
            </p>
          </div>
        )}

        {status.kind === 'stripe' && (
          <StripeDetails
            sub={status.sub}
            planName={status.planName}
            mismatch={status.mismatch}
            date={date}
            portalButton={portalButton}
          />
        )}

        {status.kind === 'appStore' && (
          <div className="space-y-3">
            <p className="text-sm">{t('billing.status.appStore.title', { defaultValue: 'Billed through the App Store' })}</p>
            <dl className="text-sm">
              <dt className="text-muted-foreground">{t('billing.status.appStore.renewsLabel', { defaultValue: 'Renews or expires' })}</dt>
              <dd className="font-medium">
                {date(status.expiresAt) ?? t('billing.status.appStore.noDate', { defaultValue: 'Shown in your iPhone Settings' })}
              </dd>
            </dl>
            <Button variant="outline" size="sm" asChild>
              <a href={APPLE_SUBSCRIPTIONS_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                <span>{t('billing.status.appStore.manage', { defaultValue: 'Manage in iPhone Settings' })}</span>
              </a>
            </Button>
            {status.strayStripe && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-4" role="status">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <span>{t('billing.status.dual.title', { defaultValue: 'You may be billed twice' })}</span>
                </p>
                <p className="mt-1 text-sm">
                  {t('billing.status.dual.body', {
                    defaultValue:
                      'Your {{plan}} plan comes from the App Store, and a card subscription for {{stripePlan}} is also on file with Stripe. Cancel the one you do not want so you are only charged once.',
                    plan: status.planName,
                    stripePlan: status.strayStripe.plan_name,
                  })}
                </p>
                {portalButton(t('billing.status.dual.action', { defaultValue: 'Open billing portal' }))}
              </div>
            )}
          </div>
        )}

        {status.kind === 'comp' && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm">
              <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{t('billing.status.comp.title', { defaultValue: 'Complimentary from EatPal' })}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {status.endDate
                ? t('billing.status.comp.until', { defaultValue: 'Until {{date}}', date: date(status.endDate) })
                : t('billing.status.comp.noEnd', { defaultValue: 'No end date' })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StripeStatusBadge({ status, canceling }: { status: string; canceling: boolean }) {
  const { t } = useTranslation();
  if (canceling) {
    return (
      <Badge variant="outline" className="border-warning/40 bg-warning/10 text-foreground">
        <Clock className="mr-1 h-3 w-3 text-warning" aria-hidden="true" />
        {t('billing.status.badge.ending', { defaultValue: 'Ending' })}
      </Badge>
    );
  }
  if (status === 'active') {
    return (
      <Badge variant="outline" className="border-success/40 bg-success/10 text-foreground">
        <CheckCircle className="mr-1 h-3 w-3 text-success" aria-hidden="true" />
        {t('billing.status.badge.active', { defaultValue: 'Active' })}
      </Badge>
    );
  }
  if (status === 'trialing') {
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-foreground">
        <Clock className="mr-1 h-3 w-3 text-primary" aria-hidden="true" />
        {t('billing.status.badge.trialing', { defaultValue: 'Free trial' })}
      </Badge>
    );
  }
  if (status === 'past_due') {
    return (
      <Badge variant="destructive">
        <AlertCircle className="mr-1 h-3 w-3" aria-hidden="true" />
        {t('billing.status.badge.pastDue', { defaultValue: 'Payment failed' })}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">{t('billing.status.badge.other', { defaultValue: 'Needs attention' })}</Badge>
  );
}

function StripeDetails({
  sub,
  planName,
  mismatch,
  date,
  portalButton,
}: {
  sub: Subscription;
  planName: string;
  mismatch?: { enforcedPlan: string };
  date: (iso: string | null | undefined) => string | null;
  portalButton: (label: string) => JSX.Element | null;
}) {
  const { t } = useTranslation();
  const progress = periodProgress(sub.current_period_start, sub.current_period_end);
  const remaining = daysLeft(sub.current_period_end);
  const endDate = date(sub.current_period_end);
  const trialing = sub.status === 'trialing';
  const trialEnd = date(sub.trial_end ?? sub.current_period_end);
  const canceling = sub.cancel_at_period_end;
  const cycle =
    sub.billing_cycle === 'yearly'
      ? t('billing.status.cycle.yearly', { defaultValue: 'Yearly' })
      : sub.billing_cycle === 'monthly'
        ? t('billing.status.cycle.monthly', { defaultValue: 'Monthly' })
        : null;
  const daysText =
    remaining === null ? null : t('billing.status.period.daysLeft', { defaultValue: '{{count}} days left', count: remaining });

  return (
    <div className="space-y-4">
      {sub.status === 'past_due' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4" role="alert">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('billing.status.pastDue.title', { defaultValue: 'Payment failed' })}</span>
          </p>
          <p className="mt-1 text-sm">
            {t('billing.status.pastDue.body', {
              defaultValue:
                'Payment failed. Premium features are paused until your card is updated; your kids, foods and plans are kept.',
            })}
          </p>
          {portalButton(t('billing.status.pastDue.action', { defaultValue: 'Update card' }))}
        </div>
      )}

      {mismatch && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4" role="status">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{t('billing.status.mismatch.title', { defaultValue: "Your billing and your plan don't match" })}</span>
          </p>
          <p className="mt-1 text-sm">
            {t('billing.status.mismatch.body', {
              defaultValue:
                'Stripe is billing you for {{billed}}, but your account currently has {{enforced}}. Check the billing portal, or contact support and we will sort it out.',
              billed: sub.plan_name,
              enforced: mismatch.enforcedPlan,
            })}
          </p>
          {portalButton(t('billing.status.mismatch.action', { defaultValue: 'Open billing portal' }))}
        </div>
      )}

      {canceling && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4" role="status">
          <p className="font-medium">
            {endDate
              ? t('billing.status.canceling.title', { defaultValue: '{{plan}} ends on {{date}}', plan: planName, date: endDate })
              : t('billing.status.canceling.titleNoDate', { defaultValue: '{{plan}} is set to end', plan: planName })}
          </p>
          <p className="text-sm">
            {t('billing.status.canceling.body', { defaultValue: "You keep every feature until then, and you won't be charged again." })}
          </p>
        </div>
      )}

      {trialing && trialEnd && !canceling && (
        <div className="rounded-lg bg-primary/5 p-4" role="status">
          <p className="flex items-center gap-2 font-medium">
            <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{t('billing.status.trial.ends', { defaultValue: 'Trial ends {{date}}', date: trialEnd })}</span>
          </p>
        </div>
      )}

      {progress !== null && (
        <div className="space-y-2">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t('billing.status.period.label', { defaultValue: 'This billing period' })}</span>
            {daysText && <span className="font-medium tabular-nums">{daysText}</span>}
          </div>
          <Progress
            value={Math.min(100, Math.max(0, progress))}
            className="h-2 motion-reduce:[&>div]:transition-none"
            aria-label={t('billing.status.period.label', { defaultValue: 'This billing period' })}
            aria-valuetext={daysText ?? undefined}
          />
        </div>
      )}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-muted/50 p-3">
          <dt className="text-muted-foreground">
            {canceling
              ? t('billing.status.endsOn', { defaultValue: 'Ends on' })
              : trialing
                ? t('billing.status.firstCharge', { defaultValue: 'First charge' })
                : t('billing.status.renewsOn', { defaultValue: 'Renews on' })}
          </dt>
          <dd className="font-medium">{endDate ?? t('billing.status.noDate', { defaultValue: 'Not set yet' })}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <dt className="text-muted-foreground">{t('billing.status.cycle.label', { defaultValue: 'Billing cycle' })}</dt>
          <dd className="font-medium">{cycle ?? t('billing.status.cycle.unknown', { defaultValue: 'Shown in the billing portal' })}</dd>
        </div>
      </dl>
    </div>
  );
}
