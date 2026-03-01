import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useSubscription } from "@/hooks/useSubscription";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
  ExternalLink,
  FileText,
  Settings,
  Shield,
} from "lucide-react";

export default function Billing() {
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
  const [portalLoading, setPortalLoading] = useState(false);
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

  const handleOpenStripePortal = async () => {
    try {
      setPortalLoading(true);
      const { data, error } = await invokeEdgeFunction("manage-payment-methods", {
        body: { action: "get-portal-url" },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        toast.error("Unable to open billing portal. Please try again.");
      }
    } catch (err) {
      console.error("Error opening Stripe portal:", err);
      if (err instanceof Error && err.message.includes("No subscription")) {
        toast.info("Subscribe to a plan first to access the billing portal.");
        navigate("/pricing");
      } else {
        toast.error("Failed to open billing portal. Please try again.");
      }
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const confirmCancel = async () => {
    setShowCancelConfirm(false);
    await cancel();
  };

  if (loading) {
    return (
      <>
        <Helmet>
          <title>Billing & Payments - EatPal</title>
        </Helmet>
        <div className="container mx-auto p-6 max-w-3xl">
          <div className="mb-8">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Billing & Payments - EatPal</title>
        <meta name="description" content="Manage your subscription and billing" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="container mx-auto p-6 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Billing & Payments</h1>
          <p className="text-muted-foreground">
            View your subscription status and manage billing through Stripe's secure portal.
          </p>
        </div>

        {/* No Subscription */}
        {!subscription ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-muted-foreground" />
                No Active Subscription
              </CardTitle>
              <CardDescription>
                Upgrade to a paid plan to unlock premium features.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-8">
              <Crown className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-6">
                Choose a plan to get the most out of EatPal for your family.
              </p>
              <Button size="lg" onClick={() => navigate("/pricing")}>
                <ArrowUpRight className="h-4 w-4 mr-2" />
                View Plans
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Subscription Status Card */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-primary" />
                    {subscription.plan_name}
                    {subscription.is_complementary && (
                      <Badge variant="secondary" className="ml-2">Complementary</Badge>
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
                      isActive || isTrialing ? "default" : isPastDue ? "secondary" : "destructive"
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
                      <><Clock className="h-3 w-3 mr-1" /> Trial</>
                    ) : isActive ? (
                      <><CheckCircle className="h-3 w-3 mr-1" /> Active</>
                    ) : isPastDue ? (
                      <><AlertCircle className="h-3 w-3 mr-1" /> Past Due</>
                    ) : (
                      <><AlertCircle className="h-3 w-3 mr-1" /> {subscription.status}</>
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

                {/* Warnings */}
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
                        onClick={() => reactivate()}
                        disabled={actionLoading}
                      >
                        {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Reactivate Subscription
                      </Button>
                    </div>
                  </div>
                )}

                {isPastDue && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800 dark:text-red-200">Payment Failed</p>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        Your last payment failed. Update your payment method to avoid service interruption.
                      </p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={handleOpenStripePortal} disabled={portalLoading}>
                        {portalLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                        Update Payment Method
                      </Button>
                    </div>
                  </div>
                )}

                {/* Trial Info */}
                {isTrialing && subscription.trial_end && (
                  <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-200">Free Trial Active</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Your trial ends on {formatDate(subscription.trial_end)}.
                      </p>
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
                        {willCancelAtPeriodEnd ? "Subscription ending" : formatDate(subscription.current_period_end)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Billing Cycle</p>
                      <p className="font-medium capitalize">{subscription.billing_cycle || "Monthly"}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manage Subscription Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Manage Subscription
                </CardTitle>
                <CardDescription>
                  Use Stripe's secure portal to manage all billing details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Stripe Customer Portal */}
                  <Button
                    variant="default"
                    size="lg"
                    className="w-full justify-start h-auto py-4"
                    onClick={handleOpenStripePortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? (
                      <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                    ) : (
                      <ExternalLink className="h-5 w-5 mr-3 shrink-0" />
                    )}
                    <div className="text-left">
                      <p className="font-semibold">Open Billing Portal</p>
                      <p className="text-xs opacity-80 font-normal">
                        Payment methods, invoices & billing
                      </p>
                    </div>
                  </Button>

                  {/* Change Plan */}
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full justify-start h-auto py-4"
                    onClick={() => navigate("/pricing")}
                  >
                    <ArrowUpRight className="h-5 w-5 mr-3 shrink-0" />
                    <div className="text-left">
                      <p className="font-semibold">Change Plan</p>
                      <p className="text-xs text-muted-foreground font-normal">
                        Upgrade or downgrade your plan
                      </p>
                    </div>
                  </Button>
                </div>

                <Separator />

                {/* What you can do in the portal */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    Through the Stripe billing portal you can:
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <span>Add or update payment methods</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span>View and download invoices</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>Change billing cycle</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Shield className="h-4 w-4 shrink-0" />
                      <span>Update billing information</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Cancel */}
                {isActive && !willCancelAtPeriodEnd && !subscription.is_complementary && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Cancel Subscription</p>
                      <p className="text-xs text-muted-foreground">
                        You'll retain access until the end of your billing period.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleCancel}
                      disabled={actionLoading}
                    >
                      {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

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
    </>
  );
}
