import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import {
  Crown,
  Calendar,
  CreditCard,
  ArrowUpRight,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";

export function SubscriptionOverview() {
  const {
    subscription,
    loading,
    actionLoading,
    isActive,
    isTrialing,
    isPastDue,
    willCancelAtPeriodEnd,
    cancel,
    reactivate,
    refetch,
  } = useSubscription();
  const navigate = useNavigate();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getDaysRemaining = () => {
    if (!subscription?.current_period_end) return 0;
    const end = new Date(subscription.current_period_end);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const getProgressPercentage = () => {
    if (!subscription?.current_period_start || !subscription?.current_period_end) return 0;
    const start = new Date(subscription.current_period_start).getTime();
    const end = new Date(subscription.current_period_end).getTime();
    const now = Date.now();
    const total = end - start;
    const elapsed = now - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const confirmCancel = async () => {
    setShowCancelConfirm(false);
    await cancel();
  };

  const handleReactivate = async () => {
    await reactivate();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Your current plan and billing information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>You don't have an active subscription</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center py-8">
            <Crown className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Active Subscription</h3>
            <p className="text-muted-foreground mb-6">
              Upgrade to a paid plan to unlock premium features and get the most out of EatPal.
            </p>
            <Button onClick={() => navigate("/pricing")}>
              <ArrowUpRight className="h-4 w-4 mr-2" />
              View Plans
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Subscription Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              {subscription.plan_name}
              {subscription.is_complementary && (
                <Badge variant="secondary" className="ml-2">
                  Complementary
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {subscription.billing_cycle === "yearly" ? "Annual" : "Monthly"} billing
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={refetch}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Badge
              variant={
                isActive || isTrialing
                  ? "default"
                  : isPastDue
                  ? "secondary"
                  : "destructive"
              }
              className={
                isActive
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  : isTrialing
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                  : ""
              }
            >
              {isTrialing ? (
                <>
                  <Clock className="h-3 w-3 mr-1" />
                  Trial
                </>
              ) : isActive ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </>
              ) : isPastDue ? (
                <>
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Past Due
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {subscription.status}
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Billing Period Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Billing Period</span>
              <span className="font-medium">{getDaysRemaining()} days remaining</span>
            </div>
            <Progress value={getProgressPercentage()} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatDate(subscription.current_period_start)}</span>
              <span>{formatDate(subscription.current_period_end)}</span>
            </div>
          </div>

          {/* Warning Messages */}
          {willCancelAtPeriodEnd && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Subscription Canceling
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Your subscription will end on {formatDate(subscription.current_period_end)}.
                  You'll retain access until then.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleReactivate}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Reactivate Subscription
                </Button>
              </div>
            </div>
          )}

          {isPastDue && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  Payment Failed
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  Your last payment failed. Please update your payment method to avoid service interruption.
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate("/dashboard/billing?tab=payment-methods")}>
                  Update Payment Method
                </Button>
              </div>
            </div>
          )}

          {/* Info Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Next Billing Date</p>
                <p className="font-medium">
                  {willCancelAtPeriodEnd
                    ? "Subscription ending"
                    : formatDate(subscription.current_period_end)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Billing Cycle</p>
                <p className="font-medium capitalize">
                  {subscription.billing_cycle || "Monthly"}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate("/pricing")}>
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Change Plan
            </Button>
            {isActive && !willCancelAtPeriodEnd && !subscription.is_complementary && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleCancel}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Cancel Subscription
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trial Info Card */}
      {isTrialing && subscription.trial_end && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  Free Trial Active
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Your trial ends on {formatDate(subscription.trial_end)}. Add a payment method to continue after the trial.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your subscription? You will still
              have access until the end of your current billing period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
