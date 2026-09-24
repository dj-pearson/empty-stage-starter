import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useSubscription } from '@/hooks/useSubscription';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { formatSubscriptionStatus } from '@/lib/subscription-helpers';
import { logger } from '@/lib/logger';
import '@/i18n/appLocale';

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Settings hub, "Plan and billing". The only settings surface that calls
 * useSubscription, so the hub index and the other sections never pay for the
 * subscription query. Invoices, receipts and the card live on /dashboard/billing
 * (US-769); this section shows the plan and changes or cancels it.
 */
export function PlanSection() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [portalLoading, setPortalLoading] = useState(false);
  const {
    subscription,
    loading,
    actionLoading,
    isActive,
    isTrialing,
    isPastDue,
    isCanceled,
    isPaused,
    willCancelAtPeriodEnd,
    cancel,
    reactivate,
    refetch,
  } = useSubscription();

  const formatDate = (value: string | null | undefined) => {
    if (!value) return t('settings.plan.unknownDate', { defaultValue: 'Not set' });
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('settings.plan.unknownDate', { defaultValue: 'Not set' });
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(date);
  };

  const daysRemaining = () => {
    if (!subscription?.current_period_end) return 0;
    const diff = new Date(subscription.current_period_end).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / DAY_MS));
  };

  const periodProgress = () => {
    if (!subscription?.current_period_start || !subscription?.current_period_end) return 0;
    const start = new Date(subscription.current_period_start).getTime();
    const end = new Date(subscription.current_period_end).getTime();
    const total = end - start;
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, ((Date.now() - start) / total) * 100));
  };

  const openPortal = async () => {
    try {
      setPortalLoading(true);
      const { data, error } = await invokeEdgeFunction<{ url?: string }>('manage-payment-methods', {
        body: { action: 'get-portal-url' },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error(t('settings.plan.portal.unavailable', { defaultValue: "The billing portal isn't available right now." }));
      }
    } catch (err) {
      logger.error('Error opening Stripe portal:', err);
      if (err instanceof Error && err.message.includes('No subscription')) {
        toast.info(t('settings.plan.portal.subscribeFirst', { defaultValue: 'Subscribe to a plan first to use the billing portal.' }));
        navigate('/pricing');
      } else {
        toast.error(t('settings.plan.portal.failed', { defaultValue: "Couldn't open the billing portal." }));
      }
    } finally {
      setPortalLoading(false);
    }
  };

  const statusBadge = () => {
    if (!subscription || !subscription.status || subscription.status === 'canceled') {
      return <Badge variant="secondary">{t('settings.plan.status.free', { defaultValue: 'Free' })}</Badge>;
    }
    if (isActive)
      return (
        <Badge variant="outline" className="border-success/40 bg-success/10 text-foreground">
          <CheckCircle className="mr-1 h-3 w-3 text-success" aria-hidden="true" />
          {t('settings.plan.status.active', { defaultValue: 'Active' })}
        </Badge>
      );
    if (isTrialing)
      return (
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-foreground">
          <Clock className="mr-1 h-3 w-3 text-primary" aria-hidden="true" />
          {t('settings.plan.status.trial', { defaultValue: 'Trial' })}
        </Badge>
      );
    if (isPastDue)
      return (
        <Badge variant="destructive">
          <AlertCircle className="mr-1 h-3 w-3" aria-hidden="true" />
          {t('settings.plan.status.pastDue', { defaultValue: 'Past due' })}
        </Badge>
      );
    if (isPaused)
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
          {t('settings.plan.status.paused', { defaultValue: 'Paused' })}
        </Badge>
      );
    return <Badge variant="secondary">{formatSubscriptionStatus(subscription)}</Badge>;
  };

  const billingLink = (
    <div className="flex justify-end">
      <Button variant="outline" size="sm" asChild>
        <Link to="/dashboard/billing">
          <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('settings.plan.billingLink', { defaultValue: 'Billing and invoices' })}
        </Link>
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {billingLink}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.plan.loadingTitle', { defaultValue: 'Subscription' })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!subscription || isCanceled) {
    return (
      <div className="space-y-6">
        {billingLink}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {t('settings.plan.free.title', { defaultValue: 'Free plan' })}
            </CardTitle>
            <CardDescription>{t('settings.plan.free.description', { defaultValue: "You're on the free plan." })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-medium">{t('settings.plan.free.pitchTitle', { defaultValue: 'Unlock Premium' })}</p>
            <p className="max-w-prose text-sm text-muted-foreground">
              {t('settings.plan.free.pitch', {
                defaultValue: 'Upgrade for AI meal suggestions, unlimited pantry items, deeper insights and more.',
              })}
            </p>
            <Button asChild>
              <Link to="/pricing">
                <ArrowUpRight className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('settings.plan.free.cta', { defaultValue: 'View plans and pricing' })}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const yearly = subscription.billing_cycle === 'yearly';
  const canCancel = isActive && !willCancelAtPeriodEnd && !subscription.is_complementary;
  const endDate = formatDate(subscription.current_period_end);

  return (
    <div className="space-y-6">
      {billingLink}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Crown className="h-5 w-5 text-primary" aria-hidden="true" />
              {t('settings.plan.planName', { defaultValue: '{{name}} plan', name: subscription.plan_name })}
              {subscription.is_complementary && (
                <Badge variant="secondary">{t('settings.plan.complementary', { defaultValue: 'Complimentary' })}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {yearly
                ? t('settings.plan.cycle.yearly', { defaultValue: 'Billed yearly' })
                : t('settings.plan.cycle.monthly', { defaultValue: 'Billed monthly' })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={refetch}
              aria-label={t('settings.plan.refresh', { defaultValue: 'Refresh subscription status' })}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
            {statusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {subscription.current_period_start && subscription.current_period_end && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('settings.plan.period.label', { defaultValue: 'Billing period' })}</span>
                <span className="font-medium">
                  {t('settings.plan.period.remaining', { defaultValue: '{{count}} days left', count: daysRemaining() })}
                </span>
              </div>
              <Progress
                value={periodProgress()}
                className="h-2"
                aria-label={t('settings.plan.period.label', { defaultValue: 'Billing period' })}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatDate(subscription.current_period_start)}</span>
                <span>{endDate}</span>
              </div>
            </div>
          )}

          {willCancelAtPeriodEnd && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4" role="status">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium">{t('settings.plan.canceling.title', { defaultValue: 'Subscription ending' })}</p>
                <p className="text-sm">
                  {t('settings.plan.canceling.body', {
                    defaultValue: 'Your plan ends on {{date}}. You keep access until then.',
                    date: endDate,
                  })}
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void reactivate()} disabled={actionLoading}>
                  {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t('settings.plan.canceling.reactivate', { defaultValue: 'Keep my subscription' })}
                </Button>
              </div>
            </div>
          )}

          {isPastDue && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4" role="alert">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              <div>
                <p className="font-medium text-destructive">{t('settings.plan.pastDue.title', { defaultValue: 'Payment failed' })}</p>
                <p className="text-sm">
                  {t('settings.plan.pastDue.body', {
                    defaultValue: "Your last payment didn't go through. Update your card to keep premium features.",
                  })}
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={openPortal} disabled={portalLoading}>
                  {portalLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {t('settings.plan.pastDue.action', { defaultValue: 'Update payment method' })}
                </Button>
              </div>
            </div>
          )}

          {isPaused && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4" role="status">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium">{t('settings.plan.paused.title', { defaultValue: 'Subscription paused' })}</p>
                <p className="text-sm">
                  {t('settings.plan.paused.body', { defaultValue: 'Your subscription is paused. Contact support to resume it.' })}
                </p>
              </div>
            </div>
          )}

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <Calendar className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="text-sm text-muted-foreground">{t('settings.plan.nextBilling', { defaultValue: 'Next billing date' })}</dt>
                <dd className="font-medium">
                  {willCancelAtPeriodEnd ? t('settings.plan.ending', { defaultValue: 'Subscription ending' }) : endDate}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="text-sm text-muted-foreground">{t('settings.plan.billingCycle', { defaultValue: 'Billing cycle' })}</dt>
                <dd className="font-medium">
                  {yearly
                    ? t('settings.plan.cycleShort.yearly', { defaultValue: 'Yearly' })
                    : t('settings.plan.cycleShort.monthly', { defaultValue: 'Monthly' })}
                </dd>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.plan.manage.title', { defaultValue: 'Manage subscription' })}</CardTitle>
          <CardDescription>
            {t('settings.plan.manage.description', { defaultValue: 'Change plan, update your card or cancel.' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-start justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">{t('settings.plan.manage.changeTitle', { defaultValue: 'Change plan' })}</p>
              <p className="text-sm text-muted-foreground">
                {t('settings.plan.manage.changeBody', { defaultValue: 'Upgrade or switch to a different plan.' })}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/pricing">
                <ArrowUpRight className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('settings.plan.manage.changeCta', { defaultValue: 'View plans' })}
              </Link>
            </Button>
          </div>

          <div className="flex flex-col items-start justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">{t('settings.plan.manage.portalTitle', { defaultValue: 'Billing portal' })}</p>
              <p className="text-sm text-muted-foreground">
                {t('settings.plan.manage.portalBody', { defaultValue: 'Payment methods, invoices and billing details.' })}
              </p>
            </div>
            <Button variant="outline" onClick={openPortal} disabled={portalLoading}>
              {portalLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {t('settings.plan.manage.portalCta', { defaultValue: 'Open portal' })}
            </Button>
          </div>

          {canCancel && (
            <>
              <Separator />
              <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-medium text-destructive">
                    {t('settings.plan.manage.cancelTitle', { defaultValue: 'Cancel subscription' })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.plan.manage.cancelBody', { defaultValue: 'You keep access until the end of this billing period.' })}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={actionLoading}>
                      {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                      {t('settings.plan.manage.cancelCta', { defaultValue: 'Cancel plan' })}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('settings.plan.cancelDialog.title', { defaultValue: 'Cancel your subscription?' })}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('settings.plan.cancelDialog.body', {
                          defaultValue:
                            'Your {{plan}} plan stays active until {{date}}, then your account moves to the free plan. Your kids, foods and plans are kept.',
                          plan: subscription.plan_name,
                          date: endDate,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('settings.plan.cancelDialog.keep', { defaultValue: 'Keep subscription' })}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void cancel()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t('settings.plan.cancelDialog.confirm', { defaultValue: 'Yes, cancel' })}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isTrialing && subscription.trial_end && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium">{t('settings.plan.trial.title', { defaultValue: 'Free trial active' })}</p>
                <p className="text-sm">
                  {t('settings.plan.trial.body', {
                    defaultValue: 'Your trial ends on {{date}}. Add a payment method to keep premium after that.',
                    date: formatDate(subscription.trial_end),
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
