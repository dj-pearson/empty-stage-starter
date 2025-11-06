import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  CreditCard,
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
  Plus,
  Edit,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { logger } from "@/lib/logger";

interface SubscriptionPlan {
  id: string;
  name: string;
  stripe_price_id: string | null;
  price_monthly: number;
  price_yearly: number | null;
  features: string[];
  max_children: number | null;
  max_recipes: number | null;
  max_meal_plans: number | null;
  is_active: boolean;
  sort_order: number;
}

interface UserSubscription {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  plan_name: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface SubscriptionStats {
  total_subscriptions: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  canceled_subscriptions: number;
  mrr: number; // Monthly Recurring Revenue
  arr: number; // Annual Recurring Revenue
}

export function SubscriptionManagement() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats>({
    total_subscriptions: 0,
    active_subscriptions: 0,
    trialing_subscriptions: 0,
    canceled_subscriptions: 0,
    mrr: 0,
    arr: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [planForm, setPlanForm] = useState({
    name: "",
    stripe_price_id: "",
    price_monthly: "",
    price_yearly: "",
    features: "",
    max_children: "",
    max_recipes: "",
    max_meal_plans: "",
    is_active: true,
  });

  useEffect(() => {
    loadPlans();
    loadSubscriptions();
    loadStats();
  }, []);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setPlans((data || []).map(plan => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features as string[] : []
      })));
    } catch (error) {
      logger.error("Error loading plans:", error);
      toast.error("Failed to load subscription plans");
    }
  };

  const loadSubscriptions = async () => {
    try {
      setLoading(true);

      // Get subscriptions with user info
      const { data: subs, error: subsError } = await supabase
        .from("user_subscriptions")
        .select(`
          id,
          user_id,
          status,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          stripe_customer_id,
          stripe_subscription_id,
          plan:subscription_plans(name)
        `)
        .order("created_at", { ascending: false });

      if (subsError) throw subsError;

      // Get user details
      const userIds = subs?.map((s) => s.user_id) || [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      // Get auth users for emails
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();

      // Combine data
      const combined: UserSubscription[] = subs?.map((sub) => {
        const profile = profiles?.find((p) => p.id === sub.user_id);
        const authUser = authUsers?.find((u) => u.id === sub.user_id);

        return {
          id: sub.id,
          user_id: sub.user_id,
          user_email: authUser?.email || "N/A",
          user_name: profile?.full_name || "Unknown",
          plan_name: sub.plan?.name || "N/A",
          status: sub.status,
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
          cancel_at_period_end: sub.cancel_at_period_end,
          stripe_customer_id: sub.stripe_customer_id,
          stripe_subscription_id: sub.stripe_subscription_id,
        };
      }) || [];

      setSubscriptions(combined);
    } catch (error) {
      logger.error("Error loading subscriptions:", error);
      toast.error("Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Get subscription counts by status
      const { data: subs, error } = await supabase
        .from("user_subscriptions")
        .select("status, plan:subscription_plans(price_monthly)");

      if (error) throw error;

      const active = subs?.filter((s) => s.status === "active").length || 0;
      const trialing = subs?.filter((s) => s.status === "trialing").length || 0;
      const canceled = subs?.filter((s) => s.status === "canceled").length || 0;

      // Calculate MRR (Monthly Recurring Revenue)
      const mrr = subs
        ?.filter((s) => s.status === "active")
        .reduce((sum, s) => sum + ((s.plan as any)?.price_monthly || 0), 0) || 0;

      setStats({
        total_subscriptions: subs?.length || 0,
        active_subscriptions: active,
        trialing_subscriptions: trialing,
        canceled_subscriptions: canceled,
        mrr,
        arr: mrr * 12,
      });
    } catch (error) {
      logger.error("Error loading stats:", error);
    }
  };

  const handleSavePlan = async () => {
    try {
      const planData = {
        name: planForm.name,
        stripe_price_id: planForm.stripe_price_id || null,
        price_monthly: parseFloat(planForm.price_monthly),
        price_yearly: planForm.price_yearly ? parseFloat(planForm.price_yearly) : null,
        features: planForm.features.split("\n").filter((f) => f.trim()),
        max_children: planForm.max_children ? parseInt(planForm.max_children) : null,
        max_recipes: planForm.max_recipes ? parseInt(planForm.max_recipes) : null,
        max_meal_plans: planForm.max_meal_plans ? parseInt(planForm.max_meal_plans) : null,
        is_active: planForm.is_active,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from("subscription_plans")
          .update(planData)
          .eq("id", editingPlan.id);

        if (error) throw error;
        toast.success("Plan updated successfully");
      } else {
        const { error } = await supabase
          .from("subscription_plans")
          .insert([{ ...planData, sort_order: plans.length + 1 }]);

        if (error) throw error;
        toast.success("Plan created successfully");
      }

      setShowPlanDialog(false);
      setEditingPlan(null);
      resetPlanForm();
      loadPlans();
    } catch (error) {
      logger.error("Error saving plan:", error);
      toast.error("Failed to save plan");
    }
  };

  const handleEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      stripe_price_id: plan.stripe_price_id || "",
      price_monthly: plan.price_monthly.toString(),
      price_yearly: plan.price_yearly?.toString() || "",
      features: plan.features.join("\n"),
      max_children: plan.max_children?.toString() || "",
      max_recipes: plan.max_recipes?.toString() || "",
      max_meal_plans: plan.max_meal_plans?.toString() || "",
      is_active: plan.is_active,
    });
    setShowPlanDialog(true);
  };

  const resetPlanForm = () => {
    setPlanForm({
      name: "",
      stripe_price_id: "",
      price_monthly: "",
      price_yearly: "",
      features: "",
      max_children: "",
      max_recipes: "",
      max_meal_plans: "",
      is_active: true,
    });
  };

  const handleExportSubscriptions = () => {
    const csv = [
      "Email,Name,Plan,Status,Period Start,Period End,Stripe Customer ID",
      ...filteredSubscriptions.map((s) =>
        [
          s.user_email,
          s.user_name,
          s.plan_name,
          s.status,
          s.current_period_start ? format(new Date(s.current_period_start), "yyyy-MM-dd") : "",
          s.current_period_end ? format(new Date(s.current_period_end), "yyyy-MM-dd") : "",
          s.stripe_customer_id || "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscriptions-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Subscriptions exported");
  };

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchesSearch =
      sub.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.plan_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      active: { variant: "default" as const, icon: CheckCircle, className: "bg-safe-food" },
      trialing: { variant: "secondary" as const, icon: Clock, className: "" },
      canceled: { variant: "destructive" as const, icon: XCircle, className: "" },
      past_due: { variant: "destructive" as const, icon: AlertCircle, className: "" },
      incomplete: { variant: "secondary" as const, icon: AlertCircle, className: "" },
    };

    const style = styles[status as keyof typeof styles] || styles.active;
    const Icon = style.icon;

    return (
      <Badge variant={style.variant} className={`gap-1 ${style.className}`}>
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total_subscriptions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-safe-food">{stats.active_subscriptions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              MRR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">${stats.mrr.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              ARR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-accent">${stats.arr.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="subscriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subscriptions">Active Subscriptions</TabsTrigger>
          <TabsTrigger value="plans">Manage Plans</TabsTrigger>
          <TabsTrigger value="settings">Stripe Settings</TabsTrigger>
        </TabsList>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Subscriptions</CardTitle>
                  <CardDescription>View and manage all customer subscriptions</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button onClick={loadSubscriptions} variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button onClick={handleExportSubscriptions} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <Input
                  placeholder="Search by email, name, or plan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Stripe ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubscriptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No subscriptions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSubscriptions.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{sub.user_name}</p>
                              <p className="text-sm text-muted-foreground">{sub.user_email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{sub.plan_name}</Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(sub.status)}</TableCell>
                          <TableCell>
                            {sub.current_period_end ? (
                              <div className="text-sm">
                                <p>Ends: {format(new Date(sub.current_period_end), "MMM d, yyyy")}</p>
                                {sub.cancel_at_period_end && (
                                  <p className="text-destructive text-xs">Canceling</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="text-xs font-mono">{sub.stripe_customer_id || "—"}</p>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Subscription Plans</CardTitle>
                  <CardDescription>Create and manage subscription tiers</CardDescription>
                </div>
                <Button onClick={() => { resetPlanForm(); setShowPlanDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                {plans.map((plan) => (
                  <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle>{plan.name}</CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => handleEditPlan(plan)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                      <CardDescription>
                        <span className="text-3xl font-bold">${plan.price_monthly}</span>
                        <span className="text-muted-foreground">/month</span>
                        {plan.price_yearly && (
                          <div className="text-sm mt-1">or ${plan.price_yearly}/year</div>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-2 text-sm">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-safe-food flex-shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        <p>Max Children: {plan.max_children || "Unlimited"}</p>
                        {plan.stripe_price_id && (
                          <p className="font-mono truncate">Stripe: {plan.stripe_price_id}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Stripe Configuration</CardTitle>
              <CardDescription>Configure Stripe integration for payments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted/50">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div className="space-y-2">
                    <h4 className="font-semibold">Setup Instructions</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Create a Stripe account at stripe.com</li>
                      <li>Get your Stripe Secret Key from the dashboard</li>
                      <li>Add the key to your Supabase environment variables: STRIPE_SECRET_KEY</li>
                      <li>Create products and prices in Stripe dashboard</li>
                      <li>Copy the price IDs and add them to your subscription plans above</li>
                      <li>Set up webhook endpoint: [your-domain]/api/webhooks/stripe</li>
                      <li>Add webhook secret to environment: STRIPE_WEBHOOK_SECRET</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Webhook Events to Listen For:</Label>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• customer.subscription.created</li>
                  <li>• customer.subscription.updated</li>
                  <li>• customer.subscription.deleted</li>
                  <li>• invoice.payment_succeeded</li>
                  <li>• invoice.payment_failed</li>
                </ul>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Next Steps</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  To enable payments, you'll need to create a Supabase Edge Function to handle Stripe webhooks.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://stripe.com/docs/webhooks" target="_blank" rel="noopener noreferrer">
                    View Stripe Webhook Docs
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Plan Dialog */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit Plan" : "Create New Plan"}</DialogTitle>
            <DialogDescription>
              Configure subscription plan details and pricing
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-name">Plan Name *</Label>
                <Input
                  id="plan-name"
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  placeholder="Pro"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stripe-price-id">Stripe Price ID</Label>
                <Input
                  id="stripe-price-id"
                  value={planForm.stripe_price_id}
                  onChange={(e) => setPlanForm({ ...planForm, stripe_price_id: e.target.value })}
                  placeholder="price_xxxxx"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price-monthly">Monthly Price ($) *</Label>
                <Input
                  id="price-monthly"
                  type="number"
                  step="0.01"
                  value={planForm.price_monthly}
                  onChange={(e) => setPlanForm({ ...planForm, price_monthly: e.target.value })}
                  placeholder="9.99"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price-yearly">Yearly Price ($)</Label>
                <Input
                  id="price-yearly"
                  type="number"
                  step="0.01"
                  value={planForm.price_yearly}
                  onChange={(e) => setPlanForm({ ...planForm, price_yearly: e.target.value })}
                  placeholder="99.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-children">Max Children</Label>
                <Input
                  id="max-children"
                  type="number"
                  value={planForm.max_children}
                  onChange={(e) => setPlanForm({ ...planForm, max_children: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-recipes">Max Recipes</Label>
                <Input
                  id="max-recipes"
                  type="number"
                  value={planForm.max_recipes}
                  onChange={(e) => setPlanForm({ ...planForm, max_recipes: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-meal-plans">Max Meal Plans</Label>
                <Input
                  id="max-meal-plans"
                  type="number"
                  value={planForm.max_meal_plans}
                  onChange={(e) => setPlanForm({ ...planForm, max_meal_plans: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="features">Features (one per line)</Label>
              <Textarea
                id="features"
                value={planForm.features}
                onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                placeholder="Unlimited foods&#10;AI meal suggestions&#10;Priority support"
                rows={6}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is-active"
                checked={planForm.is_active}
                onCheckedChange={(checked) => setPlanForm({ ...planForm, is_active: checked })}
              />
              <Label htmlFor="is-active">Plan is active and visible to users</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePlan}>
              {editingPlan ? "Update Plan" : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
