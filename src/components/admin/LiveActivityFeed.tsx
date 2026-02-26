import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  UtensilsCrossed,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityLog {
  id: string;
  user_id: string | null;
  activity_type: string;
  activity_data: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  severity: "info" | "warning" | "error" | "critical";
  created_at: string;
}

type Severity = ActivityLog["severity"];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EVENTS = 100;
const POLL_INTERVAL_MS = 30_000;

const activityIcons: Record<string, typeof Activity> = {
  signup: UserPlus,
  login: LogIn,
  logout: LogOut,
  food_added: UtensilsCrossed,
  meal_plan_created: Calendar,
  meal_plan_updated: Calendar,
  meal_planned: Calendar,
  grocery_list_created: ShoppingCart,
  recipe_created: BookOpen,
  pantry_item_added: Package,
  kid_added: Users,
  subscription_created: CreditCard,
  subscription_updated: CreditCard,
  subscription_changed: CreditCard,
  subscription_cancelled: CreditCard,
  payment_success: CreditCard,
  payment_failed: AlertCircle,
  ai_query: Zap,
  error: AlertCircle,
  api_call: Activity,
  feature_used: Activity,
};

const severityColors: Record<Severity, string> = {
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  error: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
};

const activityLabels: Record<string, string> = {
  signup: "User Signup",
  login: "User Login",
  logout: "User Logout",
  food_added: "Food Added",
  meal_plan_created: "Meal Plan Created",
  meal_plan_updated: "Meal Plan Updated",
  meal_planned: "Meal Planned",
  grocery_list_created: "Grocery List Created",
  recipe_created: "Recipe Created",
  pantry_item_added: "Pantry Item Added",
  kid_added: "Child Added",
  subscription_created: "Subscription Created",
  subscription_updated: "Subscription Updated",
  subscription_changed: "Subscription Changed",
  subscription_cancelled: "Subscription Cancelled",
  payment_success: "Payment Successful",
  payment_failed: "Payment Failed",
  ai_query: "AI Query",
  error: "Error",
  api_call: "API Call",
  feature_used: "Feature Used",
};

/** All action types available in the filter dropdown. */
const filterOptions: { value: string; label: string }[] = [
  { value: "all", label: "All Activities" },
  { value: "login", label: "Logins" },
  { value: "signup", label: "Signups" },
  { value: "food_added", label: "Food Added" },
  { value: "recipe_created", label: "Recipes Created" },
  { value: "meal_plan_created", label: "Meal Plans" },
  { value: "meal_planned", label: "Meals Planned" },
  { value: "subscription_created", label: "Subscription Created" },
  { value: "subscription_changed", label: "Subscription Changed" },
  { value: "subscription_cancelled", label: "Subscription Cancelled" },
  { value: "grocery_list_created", label: "Grocery Lists" },
  { value: "payment_failed", label: "Payment Issues" },
  { value: "error", label: "Errors" },
  { value: "ai_query", label: "AI Queries" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Anonymize a user identifier for display in the admin feed.
 * - UUIDs are truncated to the first 8 characters with an ellipsis.
 * - Emails are masked: "j***@example.com"
 * - Null/undefined returns "System".
 */
function anonymizeUser(userId: string | null): string {
  if (!userId) return "System";

  // If it looks like an email, mask the local part
  if (userId.includes("@")) {
    const [local, domain] = userId.split("@");
    if (local.length <= 1) return `${local}***@${domain}`;
    return `${local[0]}***@${domain}`;
  }

  // For UUIDs or other IDs, show first 8 chars
  if (userId.length > 8) {
    return `${userId.substring(0, 8)}...`;
  }

  return userId;
}

/**
 * Safely extract an error message from an unknown thrown value.
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "An unknown error occurred";
}

/**
 * Normalise a raw database row into an ActivityLog.
 * The admin_live_activity table does not have email/full_name columns;
 * instead we derive the display identifier from user_id.
 */
function toActivityLog(row: Record<string, unknown>): ActivityLog {
  const activityData = row.activity_data;
  const metadata = row.metadata;
  const rawSeverity = (row.severity as string) || "info";
  const severity: Severity =
    rawSeverity === "warning" || rawSeverity === "error" || rawSeverity === "critical"
      ? rawSeverity
      : "info";

  return {
    id: String(row.id ?? crypto.randomUUID()),
    user_id: row.user_id ? String(row.user_id) : null,
    activity_type: String(row.activity_type ?? "unknown"),
    activity_data:
      typeof activityData === "object" && activityData !== null
        ? (activityData as Record<string, unknown>)
        : {},
    metadata:
      typeof metadata === "object" && metadata !== null
        ? (metadata as Record<string, unknown>)
        : null,
    severity,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveActivityFeed() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableAvailable, setTableAvailable] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Ref for auto-scrolling the activity list to the top on new events
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to top of the feed when a new event arrives (newest first)
  const scrollToTop = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  // --------------------------------------------------
  // Fetch activities from admin_live_activity
  // --------------------------------------------------
  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("admin_live_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS);

      if (error) {
        // If the table doesn't exist, degrade gracefully
        if (
          error.message?.includes("does not exist") ||
          error.message?.includes("relation") ||
          error.code === "42P01"
        ) {
          setTableAvailable(false);
          setActivities([]);
          return;
        }
        throw error;
      }

      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      setActivities(rows.map(toActivityLog));
      setTableAvailable(true);
    } catch (err: unknown) {
      console.error("Error loading activity feed:", err);
      toast({
        title: "Error loading activity feed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // --------------------------------------------------
  // Real-time subscription + polling
  // --------------------------------------------------
  useEffect(() => {
    fetchActivities();

    // Subscribe to real-time inserts on admin_live_activity.
    // If the table does not exist, the subscription silently does nothing.
    let channel: ReturnType<typeof supabase.channel> | null = null;

    logger.debug('Subscribing to admin_activity_changes');
    try {
      channel = supabase
        .channel("admin_activity_changes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "admin_live_activity",
          },
          (payload) => {
            const newEntry = toActivityLog(
              payload.new as Record<string, unknown>,
            );
            setActivities((prev) => [newEntry, ...prev.slice(0, MAX_EVENTS - 1)]);
            scrollToTop();
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            // Real-time not available for this table -- fall back to polling only
            console.warn(
              "Real-time subscription failed for admin_live_activity; using polling only.",
            );
          }
        });
    } catch {
      // If channel creation throws, continue without real-time
      console.warn("Could not create real-time channel; using polling only.");
    }

    // Polling fallback: auto-refresh every 30 seconds
    const interval = autoRefresh
      ? setInterval(() => {
          fetchActivities();
        }, POLL_INTERVAL_MS)
      : null;

    return () => {
      if (channel) {
        logger.debug('Unsubscribing from admin_activity_changes');
        supabase.removeChannel(channel);
      }
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, fetchActivities, scrollToTop]);

  // --------------------------------------------------
  // Filtering
  // --------------------------------------------------
  const getFilteredActivities = useCallback(() => {
    return activities.filter((activity) => {
      const matchesType =
        filterType === "all" || activity.activity_type === filterType;
      const lowerSearch = searchQuery.toLowerCase();
      const matchesSearch =
        searchQuery === "" ||
        anonymizeUser(activity.user_id).toLowerCase().includes(lowerSearch) ||
        (activityLabels[activity.activity_type] ?? activity.activity_type)
          .toLowerCase()
          .includes(lowerSearch);
      return matchesType && matchesSearch;
    });
  }, [activities, filterType, searchQuery]);

  const filteredActivities = getFilteredActivities();

  // --------------------------------------------------
  // CSV Export
  // --------------------------------------------------
  const exportToCSV = () => {
    const filtered = getFilteredActivities();
    const csv = [
      ["Time", "User", "Activity", "Severity", "Details"],
      ...filtered.map((a) => [
        a.created_at ? new Date(a.created_at).toISOString() : "",
        anonymizeUser(a.user_id),
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

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
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
            <RefreshCw
              className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={exportToCSV}
            title="Export to CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table-not-found warning */}
      {!tableAvailable && (
        <Card className="p-4 border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm">
              The admin_live_activity table is not available. Activity data will
              appear once the table is created and populated.
            </p>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search by user or activity..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="sm:w-[220px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Activity List with auto-scroll */}
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
          <ScrollArea className="h-[500px]">
            <div ref={scrollRef} className="space-y-2 pr-4">
              {filteredActivities.map((activity) => {
                const Icon =
                  activityIcons[activity.activity_type] || Activity;
                const severityClass =
                  severityColors[activity.severity] || severityColors.info;
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className={`p-2 rounded-lg ${severityClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {activityLabels[activity.activity_type] ||
                            activity.activity_type}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {activity.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {anonymizeUser(activity.user_id)}
                      </p>
                      {activity.created_at && (
                        <p
                          className="text-xs text-muted-foreground mt-0.5"
                          title={format(
                            new Date(activity.created_at),
                            "yyyy-MM-dd HH:mm:ss",
                          )}
                        >
                          {format(
                            new Date(activity.created_at),
                            "MMM d, yyyy HH:mm:ss",
                          )}
                        </p>
                      )}
                      {activity.activity_data &&
                        Object.keys(activity.activity_data).length > 0 && (
                          <details className="text-xs text-muted-foreground mt-1">
                            <summary className="cursor-pointer hover:underline">
                              Details
                            </summary>
                            <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                              {JSON.stringify(activity.activity_data, null, 2)}
                            </pre>
                          </details>
                        )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {activity.created_at
                        ? formatDistanceToNow(new Date(activity.created_at), {
                            addSuffix: true,
                          })
                        : "just now"}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
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
            {
              filteredActivities.filter(
                (a) => a.severity === "error" || a.severity === "critical",
              ).length
            }
          </div>
          <div className="text-sm text-muted-foreground">Errors</div>
        </Card>
      </div>
    </div>
  );
}
