import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatSubscriptionStatus } from "@/lib/subscription-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/ui/alert-dialog";
import {
  User,
  CreditCard,
  Shield,
  Crown,
  Calendar,
  ArrowUpRight,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Mail,
  Key,
  Trash2,
  Download,
  LogOut,
  Settings,
  ExternalLink,
  Accessibility,
  Bell,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { EmailPreferences } from "@/components/EmailPreferences";

export default function AccountSettings() {
  const [activeTab, setActiveTab] = useState("profile");
  const [portalLoading, setPortalLoading] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Subscription
  const {
    subscription,
    loading: subLoading,
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
  const navigate = useNavigate();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoadingProfile(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setDisplayName(
          user.user_metadata?.display_name ||
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            ""
        );
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      setSavingProfile(true);
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim(),
          full_name: displayName.trim(),
        },
      });
      if (error) throw error;
      toast.success("Profile updated successfully");
      await loadProfile();
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      setChangingPassword(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCancelSubscription = async () => {
    await cancel();
  };

  const handleReactivate = async () => {
    await reactivate();
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
        toast.error("Unable to open billing portal.");
      }
    } catch (err) {
      console.error("Error opening Stripe portal:", err);
      if (err instanceof Error && err.message.includes("No subscription")) {
        toast.info("Subscribe to a plan first to access the billing portal.");
        navigate("/pricing");
      } else {
        toast.error("Failed to open billing portal.");
      }
    } finally {
      setPortalLoading(false);
    }
  };

  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");

  const handleExportData = async () => {
    try {
      if (!user) return;
      setExportLoading(true);
      toast.info("Preparing your data export...");

      // Fetch all user data in parallel for comprehensive GDPR export
      const [
        kidsResult,
        foodsResult,
        recipesResult,
        planEntriesResult,
        groceryItemsResult,
        groceryResult,
        mealPlanResult,
        subscriptionResult,
      ] = await Promise.all([
        supabase.from("kids").select("*").eq("user_id", user.id),
        supabase.from("foods").select("*").eq("user_id", user.id),
        supabase.from("recipes").select("*").eq("user_id", user.id),
        supabase.from("plan_entries").select("*").eq("user_id", user.id),
        supabase.from("grocery_items").select("*").eq("user_id", user.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("grocery_lists") as any).select("*").eq("user_id", user.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("meal_plan_generations") as any).select("*").eq("user_id", user.id),
        supabase
          .from("user_subscriptions")
          .select("*, plan:subscription_plans(name)")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const exportData = {
        schema_version: "1.0.0",
        exported_at: new Date().toISOString(),
        user: {
          email: user.email,
          display_name: displayName,
          created_at: user.created_at,
        },
        kids: kidsResult.data || [],
        foods: foodsResult.data || [],
        recipes: recipesResult.data || [],
        plan_entries: planEntriesResult.data || [],
        grocery_items: groceryItemsResult.data || [],
        grocery_lists: groceryResult.data || [],
        meal_plans: mealPlanResult.data || [],
        subscription: subscriptionResult.data || null,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eatpal-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Data exported successfully");
    } catch (_err) {
      toast.error("Failed to export data");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteConfirmEmail !== user.email) {
      toast.error("Email does not match. Please type your email to confirm.");
      return;
    }

    setDeleteLoading(true);
    try {
      // Cascade delete all user data
      await Promise.all([
        supabase.from("plan_entries").delete().eq("user_id", user.id),
        supabase.from("grocery_items").delete().eq("user_id", user.id),
        supabase.from("foods").delete().eq("user_id", user.id),
        supabase.from("recipes").delete().eq("user_id", user.id),
        supabase.from("kids").delete().eq("user_id", user.id),
      ]);

      // Sign out and redirect
      await supabase.auth.signOut();
      toast.success("Your data has been deleted. Redirecting...");
      window.location.href = "/";
    } catch (_err) {
      toast.error("Failed to delete account data. Please contact support@tryeatpal.com.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const getInitials = () => {
    if (displayName) {
      return displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return user?.email?.charAt(0).toUpperCase() || "U";
  };

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
    if (
      !subscription?.current_period_start ||
      !subscription?.current_period_end
    )
      return 0;
    const start = new Date(subscription.current_period_start).getTime();
    const end = new Date(subscription.current_period_end).getTime();
    const now = Date.now();
    const total = end - start;
    const elapsed = now - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const getStatusBadge = () => {
    if (!subscription || !subscription.status || subscription.status === "canceled") {
      return (
        <Badge variant="secondary">Free</Badge>
      );
    }
    if (isActive)
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
          <CheckCircle className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    if (isTrialing)
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
          <Clock className="h-3 w-3 mr-1" />
          Trial
        </Badge>
      );
    if (isPastDue)
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Past Due
        </Badge>
      );
    if (isPaused)
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Paused
        </Badge>
      );
    return <Badge variant="secondary">{formatSubscriptionStatus(subscription)}</Badge>;
  };

  return (
    <>
      <Helmet>
        <title>Account Settings - EatPal</title>
        <meta
          name="description"
          content="Manage your account, subscription, and security settings"
        />
      </Helmet>

      <div className="container mx-auto p-4 sm:p-6 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your profile, subscription, and account security.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="flex items-center gap-2">
              <Crown className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Subscription</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="accessibility" className="flex items-center gap-2">
              <Accessibility className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Accessibility</span>
            </TabsTrigger>
          </TabsList>

          {/* ==================== PROFILE TAB ==================== */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>
                  Update your display name and profile details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loadingProfile ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16">
                        <AvatarImage
                          src={user?.user_metadata?.avatar_url}
                          alt={displayName || "User"}
                        />
                        <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                          {getInitials()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-lg">
                          {displayName || "No name set"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Head of Household
                        </p>
                      </div>
                    </div>

                    <Separator />

                    {/* Display Name */}
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display Name</Label>
                      <Input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Enter your name"
                      />
                      <p className="text-xs text-muted-foreground">
                        This is the name displayed throughout the app.
                      </p>
                    </div>

                    {/* Email (read-only) */}
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="email"
                          value={user?.email || ""}
                          disabled
                          className="bg-muted"
                        />
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Contact support to change your email address.
                      </p>
                    </div>

                    {/* Account Created */}
                    <div className="space-y-2">
                      <Label>Member Since</Label>
                      <p className="text-sm text-muted-foreground">
                        {user?.created_at
                          ? formatDate(user.created_at)
                          : "Unknown"}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter className="border-t pt-6">
                <Button
                  onClick={handleSaveProfile}
                  disabled={savingProfile || loadingProfile}
                >
                  {savingProfile && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </CardFooter>
            </Card>

            {/* Data Export */}
            <Card>
              <CardHeader>
                <CardTitle>Your Data</CardTitle>
                <CardDescription>
                  Download a copy of all your EatPal data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={handleExportData}>
                  <Download className="h-4 w-4 mr-2" />
                  Export My Data
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== SUBSCRIPTION TAB ==================== */}
          <TabsContent value="subscription" className="space-y-6">
            {subLoading ? (
              <Card>
                <CardHeader>
                  <CardTitle>Subscription</CardTitle>
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
            ) : !subscription || isCanceled ? (
              /* No Active Subscription */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-muted-foreground" />
                    Free Plan
                  </CardTitle>
                  <CardDescription>
                    You&apos;re currently on the free plan.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center py-6">
                    <Crown className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">
                      Unlock Premium Features
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Upgrade to get AI-powered meal suggestions, unlimited
                      pantry items, advanced analytics, and more.
                    </p>
                    <Button size="lg" onClick={() => navigate("/pricing")}>
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      View Plans & Pricing
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Active Subscription */
              <>
                {/* Current Plan Card */}
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Crown className="h-5 w-5 text-primary" />
                        {subscription.plan_name} Plan
                        {subscription.is_complementary && (
                          <Badge variant="secondary" className="ml-2">
                            Complementary
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {subscription.billing_cycle === "yearly"
                          ? "Annual"
                          : "Monthly"}{" "}
                        billing
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={refetch}
                        title="Refresh subscription status"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      {getStatusBadge()}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Billing Period Progress */}
                    {subscription.current_period_start &&
                      subscription.current_period_end && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Billing Period
                            </span>
                            <span className="font-medium">
                              {getDaysRemaining()} days remaining
                            </span>
                          </div>
                          <Progress
                            value={getProgressPercentage()}
                            className="h-2"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              {formatDate(subscription.current_period_start)}
                            </span>
                            <span>
                              {formatDate(subscription.current_period_end)}
                            </span>
                          </div>
                        </div>
                      )}

                    {/* Warning: Canceling */}
                    {willCancelAtPeriodEnd && (
                      <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-yellow-800 dark:text-yellow-200">
                            Subscription Canceling
                          </p>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            Your subscription will end on{" "}
                            {formatDate(subscription.current_period_end)}.
                            You&apos;ll retain access until then.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={handleReactivate}
                            disabled={actionLoading}
                          >
                            {actionLoading && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Reactivate Subscription
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Warning: Past Due */}
                    {isPastDue && (
                      <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-800 dark:text-red-200">
                            Payment Failed
                          </p>
                          <p className="text-sm text-red-700 dark:text-red-300">
                            Your last payment failed. Please update your payment
                            method to avoid service interruption.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={handleOpenStripePortal}
                            disabled={portalLoading}
                          >
                            {portalLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <ExternalLink className="h-4 w-4 mr-2" />
                            )}
                            Update Payment Method
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Warning: Paused */}
                    {isPaused && (
                      <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
                        <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-orange-800 dark:text-orange-200">
                            Subscription Paused
                          </p>
                          <p className="text-sm text-orange-700 dark:text-orange-300">
                            Your subscription is currently paused. Contact
                            support to resume.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Info Grid */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Next Billing Date
                          </p>
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
                          <p className="text-sm text-muted-foreground">
                            Billing Cycle
                          </p>
                          <p className="font-medium capitalize">
                            {subscription.billing_cycle || "Monthly"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Subscription Actions Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Manage Subscription</CardTitle>
                    <CardDescription>
                      Upgrade, downgrade, or manage your plan.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Upgrade / Change Plan */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Change Plan</p>
                        <p className="text-sm text-muted-foreground">
                          Upgrade or switch to a different plan.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => navigate("/pricing")}
                      >
                        <ArrowUpRight className="h-4 w-4 mr-2" />
                        View Plans
                      </Button>
                    </div>

                    {/* Payment Methods & Invoices - via Stripe Portal */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Billing Portal</p>
                        <p className="text-sm text-muted-foreground">
                          Manage payment methods, view invoices, and update billing info.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleOpenStripePortal}
                        disabled={portalLoading}
                      >
                        {portalLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4 mr-2" />
                        )}
                        Open Portal
                      </Button>
                    </div>

                    {/* Cancel Subscription */}
                    {isActive &&
                      !willCancelAtPeriodEnd &&
                      !subscription.is_complementary && (
                        <Separator />
                      )}
                    {isActive &&
                      !willCancelAtPeriodEnd &&
                      !subscription.is_complementary && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                          <div>
                            <p className="font-medium text-destructive">
                              Cancel Subscription
                            </p>
                            <p className="text-sm text-muted-foreground">
                              You&apos;ll keep access until the end of your
                              current billing period.
                            </p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={actionLoading}
                              >
                                {actionLoading && (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                Cancel Plan
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Cancel Subscription?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to cancel your{" "}
                                  {subscription.plan_name} plan? You&apos;ll
                                  retain access to premium features until{" "}
                                  {formatDate(subscription.current_period_end)}.
                                  After that, your account will revert to the
                                  Free plan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  Keep Subscription
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={handleCancelSubscription}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Yes, Cancel
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                  </CardContent>
                </Card>

                {/* Trial Info */}
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
                            Your trial ends on{" "}
                            {formatDate(subscription.trial_end)}. Add a payment
                            method to continue after the trial.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ==================== NOTIFICATIONS TAB ==================== */}
          <TabsContent value="notifications" className="space-y-6">
            <EmailPreferences />
          </TabsContent>

          {/* ==================== SECURITY TAB ==================== */}
          <TabsContent value="security" className="space-y-6">
            {/* Change Password */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your account password. You&apos;ll stay logged in.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    minLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    minLength={8}
                  />
                </div>
              </CardContent>
              <CardFooter className="border-t pt-6">
                <Button
                  onClick={handleChangePassword}
                  disabled={
                    changingPassword || !newPassword || !confirmPassword
                  }
                >
                  {changingPassword && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Update Password
                </Button>
              </CardFooter>
            </Card>

            {/* Active Sessions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogOut className="h-5 w-5" />
                  Sessions
                </CardTitle>
                <CardDescription>
                  Manage your active login sessions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <div>
                      <p className="text-sm font-medium">Current Session</p>
                      <p className="text-xs text-muted-foreground">
                        {navigator.userAgent.includes("Chrome")
                          ? "Chrome"
                          : navigator.userAgent.includes("Firefox")
                          ? "Firefox"
                          : navigator.userAgent.includes("Safari")
                          ? "Safari"
                          : "Browser"}{" "}
                        on{" "}
                        {navigator.platform || "Unknown"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-green-600">
                    Active
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible actions for your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border border-destructive/20 rounded-lg">
                  <div>
                    <p className="font-medium">Delete Account</p>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete your account and all associated data.
                      This action cannot be undone.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete your account?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                              This will permanently delete your account and all
                              associated data including:
                            </p>
                            <ul className="list-disc list-inside text-sm space-y-1">
                              <li>Children&apos;s profiles and preferences</li>
                              <li>Food database and recipes</li>
                              <li>Meal plans and history</li>
                              <li>Grocery lists</li>
                              <li>Subscription (will be canceled)</li>
                            </ul>
                            <p className="font-medium text-destructive">
                              This action cannot be undone.
                            </p>
                            <div className="pt-2">
                              <Label htmlFor="confirm-email" className="text-sm font-medium">
                                Type your email to confirm:
                              </Label>
                              <Input
                                id="confirm-email"
                                type="email"
                                placeholder={user?.email ?? "your@email.com"}
                                value={deleteConfirmEmail}
                                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                                className="mt-1"
                              />
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteConfirmEmail("")}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          disabled={deleteLoading || deleteConfirmEmail !== user?.email}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {deleteLoading ? "Deleting..." : "I Understand, Delete Everything"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== ACCESSIBILITY TAB ==================== */}
          <TabsContent value="accessibility" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Accessibility className="h-5 w-5" aria-hidden="true" />
                  Accessibility Preferences
                </CardTitle>
                <CardDescription>
                  Customize your experience to match your accessibility needs.
                  These settings are saved to your account and sync across devices.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Your full accessibility settings are available on the dedicated settings page
                  where you can configure visual, motion, keyboard, screen reader, and cognitive preferences.
                </p>
                <Button
                  onClick={() => navigate("/dashboard/accessibility-settings")}
                  className="gap-2"
                >
                  <Accessibility className="h-4 w-4" aria-hidden="true" />
                  Open Accessibility Settings
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Accessibility Resources</CardTitle>
                <CardDescription>
                  Learn about our commitment to accessibility.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Accessibility Statement</p>
                    <p className="text-sm text-muted-foreground">
                      Read about our WCAG 2.1 AA compliance efforts.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/accessibility")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                    View Statement
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">VPAT Document</p>
                    <p className="text-sm text-muted-foreground">
                      View our Voluntary Product Accessibility Template.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/accessibility/vpat")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                    View VPAT
                  </Button>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Having trouble using EatPal? Contact our accessibility support team
                    at{" "}
                    <a
                      href="mailto:accessibility@tryeatpal.com"
                      className="text-primary hover:underline font-medium"
                    >
                      accessibility@tryeatpal.com
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
