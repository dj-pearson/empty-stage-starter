import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  UserPlus,
  LogIn,
  LogOut,
  Calendar,
  ShoppingCart,
  BookOpen,
  Package,
  Users,
  CreditCard,
  AlertCircle,
  Zap,
  Filter,
  Download,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface ActivityLog {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  activity_type: string;
  activity_data: Record<string, any>;
  metadata: Record<string, any>;
  severity: "info" | "warning" | "error" | "critical";
  created_at: string;
}

const activityIcons: Record<string, typeof Activity> = {
  signup: UserPlus,
  login: LogIn,
  logout: LogOut,
  meal_plan_created: Calendar,
  meal_plan_updated: Calendar,
  grocery_list_created: ShoppingCart,
  recipe_created: BookOpen,
  pantry_item_added: Package,
  kid_added: Users,
  subscription_created: CreditCard,
  subscription_updated: CreditCard,
  subscription_cancelled: CreditCard,
  payment_success: CreditCard,
  payment_failed: AlertCircle,
  ai_query: Zap,
  error: AlertCircle,
  api_call: Activity,
  feature_used: Activity,
};

const severityColors = {
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  error: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
};

const activityLabels: Record<string, string> = {
  signup: "User Signup",
  login: "User Login",
  logout: "User Logout",
  meal_plan_created: "Meal Plan Created",
  meal_plan_updated: "Meal Plan Updated",
  grocery_list_created: "Grocery List Created",
  recipe_created: "Recipe Created",
  pantry_item_added: "Pantry Item Added",
  kid_added: "Child Added",
  subscription_created: "Subscription Created",
  subscription_updated: "Subscription Updated",
  subscription_cancelled: "Subscription Cancelled",
  payment_success: "Payment Successful",
  payment_failed: "Payment Failed",
  ai_query: "AI Query",
  error: "Error",
  api_call: "API Call",
  feature_used: "Feature Used",
};

export function LiveActivityFeed() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchActivities();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("admin_activity_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_live_activity",
        },
        (payload) => {
          // Add new activity to top of list
          setActivities((prev) => [payload.new as ActivityLog, ...prev.slice(0, 99)]);
        }
      )
      .subscribe();

    // Auto-refresh every 30 seconds
    const interval = autoRefresh
      ? setInterval(() => {
          fetchActivities();
        }, 30000)
      : null;

    return () => {
      supabase.removeChannel(channel);
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin_activity_feed")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setActivities(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading activity feed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const filtered = getFilteredActivities();
    const csv = [
      ["Time", "User", "Activity", "Severity", "Details"],
      ...filtered.map((a) => [
        new Date(a.created_at).toISOString(),
        a.email || a.full_name || "System",
        activityLabels[a.activity_type] || a.activity_type,
        a.severity,
        JSON.stringify(a.activity_data),
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-feed-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: `Exported ${filtered.length} activities to CSV`,
    });
  };

  const getFilteredActivities = () => {
    return activities.filter((activity) => {
      const matchesType = filterType === "all" || activity.activity_type === filterType;
      const matchesSearch =
        searchQuery === "" ||
        activity.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activity.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activityLabels[activity.activity_type]?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  };

  const filteredActivities = getFilteredActivities();

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h2 className="text-2xl font-bold">Live Activity Feed</h2>
          {autoRefresh && (
            <Badge variant="outline" className="animate-pulse">
              Live
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={exportToCSV} title="Export to CSV">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search by user or activity..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Activities</SelectItem>
            <SelectItem value="signup">Signups</SelectItem>
            <SelectItem value="login">Logins</SelectItem>
            <SelectItem value="meal_plan_created">Meal Plans</SelectItem>
            <SelectItem value="grocery_list_created">Grocery Lists</SelectItem>
            <SelectItem value="subscription_created">Subscriptions</SelectItem>
            <SelectItem value="payment_failed">Payment Issues</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="ai_query">AI Queries</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Activity List */}
      <Card className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No activities found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredActivities.map((activity) => {
              const Icon = activityIcons[activity.activity_type] || Activity;
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className={`p-2 rounded-lg ${severityColors[activity.severity]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {activityLabels[activity.activity_type] || activity.activity_type}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {activity.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {activity.email || activity.full_name || "System"}
                    </p>
                    {Object.keys(activity.activity_data).length > 0 && (
                      <details className="text-xs text-muted-foreground mt-1">
                        <summary className="cursor-pointer hover:underline">Details</summary>
                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                          {JSON.stringify(activity.activity_data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Stats Footer */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{filteredActivities.length}</div>
          <div className="text-sm text-muted-foreground">Total Activities</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-500">
            {filteredActivities.filter((a) => a.severity === "info").length}
          </div>
          <div className="text-sm text-muted-foreground">Info</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-500">
            {filteredActivities.filter((a) => a.severity === "warning").length}
          </div>
          <div className="text-sm text-muted-foreground">Warnings</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-500">
            {filteredActivities.filter((a) => a.severity === "error" || a.severity === "critical").length}
          </div>
          <div className="text-sm text-muted-foreground">Errors</div>
        </Card>
      </div>
    </div>
  );
}

