import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Gift,
  DollarSign,
  Users,
  TrendingDown,
  CreditCard,
  Filter,
  CalendarPlus,
  ExternalLink,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { logger } from "@/lib/logger";

interface SubscriptionMetrics {
  mrr: number;
  activeSubscribers: number;
  churnRate: number;
  complementaryCount: number;
}

interface Profile {
  id: string;
  full_name: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price_monthly: number;
}

interface ComplementarySubscription {
  id: string;
  user_id: string;
  plan_id: string;
  reason: string | null;
  start_date: string;
  end_date: string | null;
  is_permanent: boolean;
  status: string;
  created_at: string;
  profiles?: Profile;
  subscription_plans?: SubscriptionPlan;
}

interface UserSubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  is_complementary: boolean | null;
  created_at: string | null;
  profiles?: Profile;
  plan_name?: string;
  plan_price?: number;
}

const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com/subscriptions";

export function ComplementarySubscriptionManager() {
  const [compSubscriptions, setCompSubscriptions] = useState<ComplementarySubscription[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<UserSubscriptionRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const [compStatusFilter, setCompStatusFilter] = useState<string>("all");
  const [subStatusFilter, setSubStatusFilter] = useState<string>("all");
  const [metrics, setMetrics] = useState<SubscriptionMetrics>({
    mrr: 0,
    activeSubscribers: 0,
    churnRate: 0,
    complementaryCount: 0,
  });

  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  // Extend subscription dialog state
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendTarget, setExtendTarget] = useState<UserSubscriptionRow | null>(null);
  const [extendDate, setExtendDate] = useState("");

  const [formData, setFormData] = useState({
    user_id: "",
    plan_id: "",
    reason: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    is_permanent: false,
  });

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [subsRes, plansRes, userSubsRes] = await Promise.all([
        supabase
          .from("complementary_subscriptions")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("subscription_plans").select("id, name, price_monthly"),
        supabase
          .from("user_subscriptions")
          .select(
            "id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, is_complementary, created_at"
          )
          .order("created_at", { ascending: false }),
      ]);

      if (subsRes.error) throw subsRes.error;
      if (plansRes.error) throw plansRes.error;
      if (userSubsRes.error) throw userSubsRes.error;

      const plansList = (plansRes.data || []) as SubscriptionPlan[];
      setPlans(plansList);

      const planMap = new Map(plansList.map((p) => [p.id, p]));

      // Calculate subscription metrics using actual plan prices
      if (userSubsRes.data) {
        const activeSubs = userSubsRes.data.filter(
          (s) => s.status === "active" || s.status === "trialing"
        );
        const canceledSubs = userSubsRes.data.filter((s) => s.status === "canceled");
        const totalSubs = userSubsRes.data.length;

        const mrr = activeSubs.reduce((sum, s) => {
          const plan = s.plan_id ? planMap.get(s.plan_id) : null;
          return sum + (plan?.price_monthly || 0);
        }, 0);

        setMetrics({
          mrr,
          activeSubscribers: activeSubs.length,
          churnRate: totalSubs > 0 ? (canceledSubs.length / totalSubs) * 100 : 0,
          complementaryCount: subsRes.data?.filter((s) => s.status === "active").length || 0,
        });
      }

      // Enrich user_subscriptions with profile and plan info
      if (userSubsRes.data && userSubsRes.data.length > 0) {
        const userIds = [...new Set(userSubsRes.data.map((s) => s.user_id))];

        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        const profileMap = new Map(profilesData?.map((u) => [u.id, u]) || []);

        const enrichedSubs: UserSubscriptionRow[] = userSubsRes.data.map((sub) => ({
          ...sub,
          profiles: profileMap.get(sub.user_id),
          plan_name: sub.plan_id ? planMap.get(sub.plan_id)?.name : undefined,
          plan_price: sub.plan_id ? planMap.get(sub.plan_id)?.price_monthly : undefined,
        }));

        setAllSubscriptions(enrichedSubs);
      } else {
        setAllSubscriptions([]);
      }

      // Enrich complementary subscriptions with profile and plan info
      if (subsRes.data && subsRes.data.length > 0) {
        const compUserIds = [...new Set(subsRes.data.map((s) => s.user_id))];

        const { data: compProfilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", compUserIds);

        const compProfileMap = new Map(compProfilesData?.map((u) => [u.id, u]) || []);

        const enrichedCompSubs: ComplementarySubscription[] = subsRes.data.map((sub) => ({
          ...sub,
          is_permanent: sub.is_permanent ?? false,
          status: sub.status ?? "active",
          created_at: sub.created_at ?? new Date().toISOString(),
          profiles: compProfileMap.get(sub.user_id),
          subscription_plans: planMap.get(sub.plan_id),
        }));

        setCompSubscriptions(enrichedCompSubs);
      } else {
        setCompSubscriptions([]);
      }
    } catch (error) {
      toast.error("Failed to load data");
      logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const searchUserByEmail = async () => {
    if (!searchEmail) {
      toast.error("Please enter an email address");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .ilike("full_name", `%${searchEmail}%`)
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        setUsers(data);
        toast.success(`Found ${data.length} user(s)`);
      } else {
        toast.error("No users found with that search term");
      }
    } catch (error) {
      toast.error("Failed to search for user");
      logger.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.user_id || !formData.plan_id) {
      toast.error("Please select a user and plan");
      return;
    }

    if (!formData.is_permanent && !formData.end_date) {
      toast.error("Please set an end date or mark as permanent");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        toast.error("You must be logged in to grant subscriptions");
        return;
      }

      const insertData = {
        user_id: formData.user_id,
        plan_id: formData.plan_id,
        granted_by: user.id,
        reason: formData.reason || null,
        start_date: formData.start_date,
        end_date: formData.is_permanent ? null : formData.end_date,
        is_permanent: formData.is_permanent,
        status: "active",
      };

      const { error } = await supabase.from("complementary_subscriptions").insert([insertData]);

      if (error) throw error;

      toast.success("Complementary subscription granted successfully");
      resetForm();
      fetchData();
    } catch (error) {
      toast.error("Failed to grant subscription");
      logger.error(error instanceof Error ? error.message : String(error));
    }
  };

  const requestRevoke = (id: string) => {
    setPendingRevokeId(id);
    setShowRevokeConfirm(true);
  };

  const confirmRevoke = async () => {
    if (!pendingRevokeId) return;
    const id = pendingRevokeId;
    setShowRevokeConfirm(false);
    setPendingRevokeId(null);

    try {
      const { error } = await supabase
        .from("complementary_subscriptions")
        .update({ status: "revoked" })
        .eq("id", id);

      if (error) throw error;
      toast.success("Subscription revoked successfully");
      fetchData();
    } catch (error) {
      toast.error("Failed to revoke subscription");
      logger.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleExtendSubscription = async () => {
    if (!extendTarget || !extendDate) {
      toast.error("Please select a new end date");
      return;
    }

    try {
      const { error } = await supabase
        .from("user_subscriptions")
        .update({ current_period_end: extendDate })
        .eq("id", extendTarget.id);

      if (error) throw error;

      toast.success("Subscription period extended successfully");
      setExtendDialogOpen(false);
      setExtendTarget(null);
      setExtendDate("");
      fetchData();
    } catch (error) {
      toast.error("Failed to extend subscription");
      logger.error(error instanceof Error ? error.message : String(error));
    }
  };

  const openExtendDialog = (sub: UserSubscriptionRow) => {
    setExtendTarget(sub);
    // Pre-fill with current end date or 30 days from now
    const defaultDate = sub.current_period_end
      ? new Date(sub.current_period_end)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    setExtendDate(defaultDate.toISOString().split("T")[0]);
    setExtendDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      user_id: "",
      plan_id: "",
      reason: "",
      start_date: new Date().toISOString().split("T")[0],
      end_date: "",
      is_permanent: false,
    });
    setIsCreating(false);
    setUsers([]);
    setSearchEmail("");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-500 gap-1">
            <CheckCircle className="h-3 w-3" />
            Active
          </Badge>
        );
      case "trialing":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Trialing
          </Badge>
        );
      case "past_due":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Past Due
          </Badge>
        );
      case "canceled":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Canceled
          </Badge>
        );
      case "revoked":
        return (
          <Badge variant="outline" className="gap-1">
            <XCircle className="h-3 w-3" />
            Revoked
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Expired
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredAllSubscriptions = allSubscriptions.filter(
    (s) => subStatusFilter === "all" || s.status === subStatusFilter
  );

  const filteredCompSubscriptions = compSubscriptions.filter(
    (s) => compStatusFilter === "all" || s.status === compStatusFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Subscription Management</h2>
          <p className="text-muted-foreground">
            Overview of all subscriptions, grant complimentary access, and manage periods
          </p>
        </div>
        <Button onClick={() => fetchData()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Subscription Metrics Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">MRR</span>
            </div>
            <p className="text-2xl font-bold">${metrics.mrr.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Active Subscribers</span>
            </div>
            <p className="text-2xl font-bold">{metrics.activeSubscribers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Churn Rate</span>
            </div>
            <p className="text-2xl font-bold">{metrics.churnRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Complementary</span>
            </div>
            <p className="text-2xl font-bold">{metrics.complementaryCount}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all-subscriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all-subscriptions">All Subscriptions</TabsTrigger>
          <TabsTrigger value="complementary">Complementary</TabsTrigger>
        </TabsList>

        {/* All Subscriptions Tab */}
        <TabsContent value="all-subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Subscriptions</CardTitle>
                  <CardDescription>
                    View all subscriptions with status filtering and Stripe links
                  </CardDescription>
                </div>
                <Select value={subStatusFilter} onValueChange={setSubStatusFilter}>
                  <SelectTrigger className="w-44">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filteredAllSubscriptions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No subscriptions found</p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Period End</TableHead>
                        <TableHead>Stripe ID</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAllSubscriptions.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">
                            <div>
                              <p>{sub.profiles?.full_name || "Unknown User"}</p>
                              {sub.is_complementary && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  <Gift className="h-3 w-3 mr-1" />
                                  Comp
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{sub.plan_name || "N/A"}</Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(sub.status)}</TableCell>
                          <TableCell className="text-sm">
                            {sub.current_period_end ? (
                              <div>
                                <p>{format(new Date(sub.current_period_end), "MMM d, yyyy")}</p>
                                {sub.cancel_at_period_end && (
                                  <p className="text-destructive text-xs">Canceling at end</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {sub.stripe_subscription_id ? (
                              <a
                                href={`${STRIPE_DASHBOARD_URL}/${sub.stripe_subscription_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                              >
                                <CreditCard className="h-3 w-3" />
                                {sub.stripe_subscription_id.slice(0, 14)}...
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openExtendDialog(sub)}
                              title="Extend subscription period"
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Complementary Subscriptions Tab */}
        <TabsContent value="complementary" className="space-y-4">
          <div className="flex justify-end">
            {!isCreating && (
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Grant Subscription
              </Button>
            )}
          </div>

          {isCreating && (
            <Card>
              <CardHeader>
                <CardTitle>Grant Complementary Subscription</CardTitle>
                <CardDescription>
                  Provide free access to a user for a specific period or permanently
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Search User by Name</Label>
                    <div className="flex gap-2">
                      <Input
                        value={searchEmail}
                        onChange={(e) => setSearchEmail(e.target.value)}
                        placeholder="Search by name..."
                      />
                      <Button type="button" onClick={searchUserByEmail}>
                        Search
                      </Button>
                    </div>
                  </div>

                  {users.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="user_id">Select User *</Label>
                      <Select
                        value={formData.user_id}
                        onValueChange={(value) => setFormData({ ...formData, user_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.full_name || user.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="plan_id">Subscription Plan *</Label>
                    <Select
                      value={formData.plan_id}
                      onValueChange={(value) => setFormData({ ...formData, plan_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name} (${plan.price_monthly}/mo)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start_date">Start Date *</Label>
                      <Input
                        id="start_date"
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_date">End Date</Label>
                      <Input
                        id="end_date"
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        disabled={formData.is_permanent}
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_permanent"
                      checked={formData.is_permanent}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          is_permanent: checked as boolean,
                          end_date: "",
                        })
                      }
                    />
                    <label htmlFor="is_permanent" className="text-sm cursor-pointer">
                      Grant permanent access (no expiration)
                    </label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason / Notes</Label>
                    <Textarea
                      id="reason"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Why is this user receiving a complementary subscription?"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit">
                      <Gift className="h-4 w-4 mr-2" />
                      Grant Subscription
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Granted Subscriptions</CardTitle>
                <Select value={compStatusFilter} onValueChange={setCompStatusFilter}>
                  <SelectTrigger className="w-40">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="revoked">Revoked</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filteredCompSubscriptions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No complementary subscriptions found
                </p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCompSubscriptions.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">
                            {sub.profiles?.full_name || "Unknown User"}
                          </TableCell>
                          <TableCell>{sub.subscription_plans?.name || "Unknown Plan"}</TableCell>
                          <TableCell className="text-sm">
                            {sub.is_permanent ? (
                              <Badge variant="secondary">Permanent</Badge>
                            ) : (
                              <>
                                {format(new Date(sub.start_date), "MMM d, yyyy")}
                                {sub.end_date &&
                                  ` - ${format(new Date(sub.end_date), "MMM d, yyyy")}`}
                              </>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(sub.status)}</TableCell>
                          <TableCell className="max-w-xs truncate">{sub.reason || "--"}</TableCell>
                          <TableCell>
                            {sub.status === "active" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => requestRevoke(sub.id)}
                                title="Revoke subscription"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={showRevokeConfirm} onOpenChange={setShowRevokeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will revoke the complementary
              subscription and the user will lose their premium access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Extend Subscription Dialog */}
      <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Subscription Period</DialogTitle>
            <DialogDescription>
              Set a new end date for{" "}
              {extendTarget?.profiles?.full_name || "this user"}&apos;s subscription.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Period End</Label>
              <p className="text-sm text-muted-foreground">
                {extendTarget?.current_period_end
                  ? format(new Date(extendTarget.current_period_end), "MMMM d, yyyy")
                  : "Not set"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new_end_date">New End Date *</Label>
              <Input
                id="new_end_date"
                type="date"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExtendSubscription}>
              <CalendarPlus className="h-4 w-4 mr-2" />
              Extend Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
