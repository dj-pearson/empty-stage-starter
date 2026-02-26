import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Database,
  Zap,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Users,
  Clock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthMetric {
  metric_type: string;
  metric_value: number;
  metric_unit: string | null;
  recorded_at: string | null;
}

interface MetricCard {
  title: string;
  value: string;
  unit: string;
  icon: typeof Activity;
  status: "good" | "warning" | "critical";
  trend?: "up" | "down" | "stable";
  trendValue?: string;
}

interface ErrorRatePoint {
  hour: string;
  rate: number;
}

type DbConnectionStatus = "connected" | "disconnected" | "checking";

// ---------------------------------------------------------------------------
// Demo / fallback data used when the admin_system_health table is empty or
// the query fails (e.g. table does not exist yet).
// ---------------------------------------------------------------------------

const DEMO_METRICS: Record<string, HealthMetric> = {
  api_response_time_p50: {
    metric_type: "api_response_time_p50",
    metric_value: 82,
    metric_unit: "ms",
    recorded_at: new Date().toISOString(),
  },
  api_response_time_p95: {
    metric_type: "api_response_time_p95",
    metric_value: 178,
    metric_unit: "ms",
    recorded_at: new Date().toISOString(),
  },
  api_response_time_p99: {
    metric_type: "api_response_time_p99",
    metric_value: 342,
    metric_unit: "ms",
    recorded_at: new Date().toISOString(),
  },
  error_rate: {
    metric_type: "error_rate",
    metric_value: 0.42,
    metric_unit: "%",
    recorded_at: new Date().toISOString(),
  },
  active_users: {
    metric_type: "active_users",
    metric_value: 127,
    metric_unit: "users",
    recorded_at: new Date().toISOString(),
  },
  ai_api_calls: {
    metric_type: "ai_api_calls",
    metric_value: 1843,
    metric_unit: "calls",
    recorded_at: new Date().toISOString(),
  },
  ai_cost_daily: {
    metric_type: "ai_cost_daily",
    metric_value: 24.56,
    metric_unit: "$",
    recorded_at: new Date().toISOString(),
  },
  rate_limit_hits: {
    metric_type: "rate_limit_hits",
    metric_value: 3,
    metric_unit: "hits",
    recorded_at: new Date().toISOString(),
  },
  database_connections: {
    metric_type: "database_connections",
    metric_value: 14,
    metric_unit: "conns",
    recorded_at: new Date().toISOString(),
  },
};

function buildDemoErrorTrend(): ErrorRatePoint[] {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const hour = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
    return {
      hour: hour.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      rate: +(Math.random() * 1.2).toFixed(2),
    };
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SystemHealthDashboard() {
  const [metrics, setMetrics] = useState<Record<string, HealthMetric>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus>("checking");
  const [activeUserCount, setActiveUserCount] = useState<number>(0);
  const [errorTrend, setErrorTrend] = useState<ErrorRatePoint[]>([]);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS / 1000);

  // Track interval id so we can reset the countdown on manual refresh.
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ------- Database connection check -------
  const checkDbConnection = useCallback(async () => {
    setDbStatus("checking");
    if (!isSupabaseConfigured) {
      setDbStatus("disconnected");
      return false;
    }
    try {
      // A lightweight query to check connectivity
      const { error } = await supabase.from("profiles").select("id").limit(1);
      if (error) {
        setDbStatus("disconnected");
        return false;
      }
      setDbStatus("connected");
      return true;
    } catch {
      setDbStatus("disconnected");
      return false;
    }
  }, []);

  // ------- Fetch active user count -------
  const fetchActiveUserCount = useCallback(async () => {
    try {
      // Count profiles created/updated in the last 30 days as "active"
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("updated_at", thirtyDaysAgo.toISOString());

      if (!error && typeof count === "number") {
        setActiveUserCount(count);
        return count;
      }
    } catch {
      // Silently fall back
    }
    return null;
  }, []);

  // ------- Fetch error trend (last 24h) -------
  const fetchErrorTrend = useCallback(async (): Promise<ErrorRatePoint[]> => {
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const { data, error } = await supabase
        .from("admin_system_health")
        .select("metric_value, recorded_at")
        .eq("metric_type", "error_rate")
        .gte("recorded_at", twentyFourHoursAgo.toISOString())
        .order("recorded_at", { ascending: true }) as {
        data: Array<{ metric_value: number; recorded_at: string }> | null;
        error: { message: string } | null;
      };

      if (error || !data || data.length === 0) {
        return [];
      }

      return data.map((d) => ({
        hour: new Date(d.recorded_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        rate: d.metric_value,
      }));
    } catch {
      return [];
    }
  }, []);

  // ------- Main fetch -------
  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const isConnected = await checkDbConnection();

      // Fetch active users in parallel with health metrics
      const [activeCount, trend] = await Promise.all([
        isConnected ? fetchActiveUserCount() : Promise.resolve(null),
        isConnected ? fetchErrorTrend() : Promise.resolve([] as ErrorRatePoint[]),
      ]);

      let healthMetrics: Record<string, HealthMetric> = {};
      let isDemo = false;

      if (isConnected) {
        try {
          const { data, error } = (await supabase
            .from("admin_system_health")
            .select("*")
            .order("recorded_at", { ascending: false })) as {
            data: HealthMetric[] | null;
            error: { message: string } | null;
          };

          if (error) throw error;

          if (data && data.length > 0) {
            // Get the most recent value for each metric type
            data.forEach((metric) => {
              if (!healthMetrics[metric.metric_type]) {
                healthMetrics[metric.metric_type] = metric;
              }
            });
          } else {
            // Table exists but is empty - use demo data
            isDemo = true;
            healthMetrics = { ...DEMO_METRICS };
          }
        } catch {
          // Table likely does not exist - use demo data
          isDemo = true;
          healthMetrics = { ...DEMO_METRICS };
        }
      } else {
        isDemo = true;
        healthMetrics = { ...DEMO_METRICS };
      }

      // Overlay active user count from profiles if we got one
      if (activeCount !== null) {
        healthMetrics.active_users = {
          metric_type: "active_users",
          metric_value: activeCount,
          metric_unit: "users",
          recorded_at: new Date().toISOString(),
        };
      }

      setMetrics(healthMetrics);
      setUsingDemoData(isDemo);
      setErrorTrend(trend.length > 0 ? trend : buildDemoErrorTrend());
      setLastUpdate(new Date());
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error occurred";
      toast({
        title: "Error loading system health",
        description: message,
        variant: "destructive",
      });
      // Fall back to demo data on any error
      setMetrics({ ...DEMO_METRICS });
      setErrorTrend(buildDemoErrorTrend());
      setUsingDemoData(true);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }, [checkDbConnection, fetchActiveUserCount, fetchErrorTrend]);

  // ------- Countdown + refresh interval -------
  const resetCountdown = useCallback(() => {
    setCountdown(REFRESH_INTERVAL_MS / 1000);
  }, []);

  useEffect(() => {
    fetchMetrics();

    // Auto-refresh every 30 seconds
    refreshTimerRef.current = setInterval(() => {
      fetchMetrics();
      resetCountdown();
    }, REFRESH_INTERVAL_MS);

    // Countdown timer (ticks every second)
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : REFRESH_INTERVAL_MS / 1000));
    }, 1000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [fetchMetrics, resetCountdown]);

  // Manual refresh handler
  const handleManualRefresh = useCallback(() => {
    fetchMetrics();
    resetCountdown();
    // Reset the auto-refresh interval
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      fetchMetrics();
      resetCountdown();
    }, REFRESH_INTERVAL_MS);
  }, [fetchMetrics, resetCountdown]);

  // ------- Helpers -------

  const getMetricStatus = (
    type: string,
    value: number
  ): "good" | "warning" | "critical" => {
    switch (type) {
      case "api_response_time_p50":
        if (value < 100) return "good";
        if (value < 300) return "warning";
        return "critical";
      case "api_response_time_p95":
        if (value < 200) return "good";
        if (value < 500) return "warning";
        return "critical";
      case "api_response_time_p99":
        if (value < 500) return "good";
        if (value < 1000) return "warning";
        return "critical";
      case "error_rate":
        if (value < 1) return "good";
        if (value < 5) return "warning";
        return "critical";
      case "ai_cost_daily":
        if (value < 50) return "good";
        if (value < 100) return "warning";
        return "critical";
      case "rate_limit_hits":
        if (value < 10) return "good";
        if (value < 50) return "warning";
        return "critical";
      default:
        return "good";
    }
  };

  const formatMetricValue = (type: string, value: number): string => {
    switch (type) {
      case "api_response_time_p50":
      case "api_response_time_p95":
      case "api_response_time_p99":
        return value.toFixed(0);
      case "error_rate":
      case "ai_cost_daily":
        return value.toFixed(2);
      default:
        return value.toString();
    }
  };

  const getStatusColor = (status: "good" | "warning" | "critical") => {
    switch (status) {
      case "good":
        return "text-green-500 border-green-500/20 bg-green-500/10";
      case "warning":
        return "text-yellow-500 border-yellow-500/20 bg-yellow-500/10";
      case "critical":
        return "text-red-500 border-red-500/20 bg-red-500/10";
    }
  };

  const getTrendIcon = (trend?: "up" | "down" | "stable") => {
    switch (trend) {
      case "up":
        return TrendingUp;
      case "down":
        return TrendingDown;
      default:
        return Minus;
    }
  };

  // ------- Metric cards -------

  const metricCards: MetricCard[] = [
    {
      title: "API Response (p50)",
      value: formatMetricValue(
        "api_response_time_p50",
        metrics.api_response_time_p50?.metric_value ?? 0
      ),
      unit: "ms",
      icon: Clock,
      status: getMetricStatus(
        "api_response_time_p50",
        metrics.api_response_time_p50?.metric_value ?? 0
      ),
    },
    {
      title: "API Response (p95)",
      value: formatMetricValue(
        "api_response_time_p95",
        metrics.api_response_time_p95?.metric_value ?? 0
      ),
      unit: "ms",
      icon: Activity,
      status: getMetricStatus(
        "api_response_time_p95",
        metrics.api_response_time_p95?.metric_value ?? 0
      ),
    },
    {
      title: "API Response (p99)",
      value: formatMetricValue(
        "api_response_time_p99",
        metrics.api_response_time_p99?.metric_value ?? 0
      ),
      unit: "ms",
      icon: Activity,
      status: getMetricStatus(
        "api_response_time_p99",
        metrics.api_response_time_p99?.metric_value ?? 0
      ),
    },
    {
      title: "Error Rate",
      value: formatMetricValue(
        "error_rate",
        metrics.error_rate?.metric_value ?? 0
      ),
      unit: "%",
      icon: AlertTriangle,
      status: getMetricStatus(
        "error_rate",
        metrics.error_rate?.metric_value ?? 0
      ),
    },
    {
      title: "Active Users",
      value: (metrics.active_users?.metric_value ?? activeUserCount).toString(),
      unit: "users",
      icon: Users,
      status: "good",
    },
    {
      title: "AI API Calls",
      value: (metrics.ai_api_calls?.metric_value ?? 0).toString(),
      unit: "calls",
      icon: Zap,
      status: "good",
    },
    {
      title: "AI Cost (Daily)",
      value: formatMetricValue(
        "ai_cost_daily",
        metrics.ai_cost_daily?.metric_value ?? 0
      ),
      unit: "$",
      icon: DollarSign,
      status: getMetricStatus(
        "ai_cost_daily",
        metrics.ai_cost_daily?.metric_value ?? 0
      ),
    },
    {
      title: "Database Connections",
      value: (metrics.database_connections?.metric_value ?? 0).toString(),
      unit: "conns",
      icon: Database,
      status: "good",
    },
  ];

  // ------- Error trend helpers -------

  const maxErrorRate = Math.max(...errorTrend.map((p) => p.rate), 1);

  // ------- Render -------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h2 className="text-2xl font-bold">System Health</h2>
          <Badge variant="outline" className="animate-pulse">
            Live
          </Badge>
          {usingDemoData && (
            <Badge variant="secondary" className="text-xs">
              Demo Data
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Updated {lastUpdate.toLocaleTimeString()} &middot; next in{" "}
            {countdown}s
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleManualRefresh}
            disabled={loading}
            title="Refresh metrics"
            aria-label="Refresh system health metrics"
          >
            <RefreshCw
              className={cn("h-4 w-4", loading && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {/* Database Connection Status + Overall Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Database Connection */}
        <Card className="p-6">
          <div className="flex items-center gap-3">
            {dbStatus === "connected" ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <span className="text-lg font-semibold">
                    Database Connected
                  </span>
                  <p className="text-sm text-muted-foreground">
                    Supabase PostgreSQL responding normally
                  </p>
                </div>
              </>
            ) : dbStatus === "checking" ? (
              <>
                <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
                <div>
                  <span className="text-lg font-semibold">Checking...</span>
                  <p className="text-sm text-muted-foreground">
                    Verifying database connection
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <span className="text-lg font-semibold">
                    Database Disconnected
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {isSupabaseConfigured
                      ? "Unable to reach database"
                      : "Supabase not configured"}
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Overall Status */}
        <Card className="p-6">
          <div className="flex items-center gap-3">
            {dbStatus === "disconnected" ||
            metricCards.some((m) => m.status === "critical") ? (
              <>
                <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                <div>
                  <span className="text-lg font-semibold">
                    System Issues Detected
                  </span>
                  <p className="text-sm text-muted-foreground">
                    One or more services require attention
                  </p>
                </div>
              </>
            ) : metricCards.some((m) => m.status === "warning") ? (
              <>
                <div className="h-3 w-3 rounded-full bg-yellow-500 animate-pulse" />
                <div>
                  <span className="text-lg font-semibold">
                    System Running (Warnings)
                  </span>
                  <p className="text-sm text-muted-foreground">
                    Performance degradation detected
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <div>
                  <span className="text-lg font-semibold">
                    All Systems Operational
                  </span>
                  <p className="text-sm text-muted-foreground">
                    All metrics within normal thresholds
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          const TrendIcon = getTrendIcon(metric.trend);

          return (
            <Card key={metric.title} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div
                  className={cn(
                    "p-2 rounded-lg border",
                    getStatusColor(metric.status)
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {metric.trend && (
                  <TrendIcon
                    className={cn(
                      "h-4 w-4",
                      metric.trend === "up"
                        ? "text-green-500"
                        : metric.trend === "down"
                          ? "text-red-500"
                          : "text-muted-foreground"
                    )}
                  />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{metric.title}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">{metric.value}</span>
                  <span className="text-sm text-muted-foreground">
                    {metric.unit}
                  </span>
                </div>
                {metric.trendValue && (
                  <p className="text-xs text-muted-foreground">
                    {metric.trendValue}
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Error Rate Trend (Last 24 Hours) */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Error Rate Trend (Last 24 Hours)
        </h3>
        <div className="flex items-end gap-px h-32">
          {errorTrend.map((point, idx) => {
            const heightPct = maxErrorRate > 0 ? (point.rate / maxErrorRate) * 100 : 0;
            const status =
              point.rate < 1
                ? "bg-green-500"
                : point.rate < 5
                  ? "bg-yellow-500"
                  : "bg-red-500";
            return (
              <div
                key={idx}
                className="flex-1 flex flex-col items-center justify-end group relative"
              >
                {/* Tooltip on hover */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-md whitespace-nowrap z-10 border">
                  {point.hour}: {point.rate}%
                </div>
                <div
                  className={cn(
                    "w-full min-h-[2px] rounded-t-sm transition-all",
                    status
                  )}
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{errorTrend[0]?.hour ?? "-24h"}</span>
          <span>{errorTrend[Math.floor(errorTrend.length / 2)]?.hour ?? "-12h"}</span>
          <span>{errorTrend[errorTrend.length - 1]?.hour ?? "Now"}</span>
        </div>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Performance</h3>
          <div className="space-y-3 text-sm">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">P50 Response</span>
                <span className="font-medium">
                  {formatMetricValue(
                    "api_response_time_p50",
                    metrics.api_response_time_p50?.metric_value ?? 0
                  )}
                  ms
                </span>
              </div>
              <Progress
                value={Math.min(
                  ((metrics.api_response_time_p50?.metric_value ?? 0) / 300) *
                    100,
                  100
                )}
                className="h-1.5"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">P95 Response</span>
                <span className="font-medium">
                  {formatMetricValue(
                    "api_response_time_p95",
                    metrics.api_response_time_p95?.metric_value ?? 0
                  )}
                  ms
                </span>
              </div>
              <Progress
                value={Math.min(
                  ((metrics.api_response_time_p95?.metric_value ?? 0) / 500) *
                    100,
                  100
                )}
                className="h-1.5"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">P99 Response</span>
                <span className="font-medium">
                  {formatMetricValue(
                    "api_response_time_p99",
                    metrics.api_response_time_p99?.metric_value ?? 0
                  )}
                  ms
                </span>
              </div>
              <Progress
                value={Math.min(
                  ((metrics.api_response_time_p99?.metric_value ?? 0) / 1000) *
                    100,
                  100
                )}
                className="h-1.5"
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">AI Usage</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">API Calls</span>
              <span className="font-medium">
                {metrics.ai_api_calls?.metric_value ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily Cost</span>
              <span className="font-medium">
                $
                {formatMetricValue(
                  "ai_cost_daily",
                  metrics.ai_cost_daily?.metric_value ?? 0
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Cost/Call</span>
              <span className="font-medium">
                $
                {(
                  (metrics.ai_cost_daily?.metric_value ?? 0) /
                  Math.max(metrics.ai_api_calls?.metric_value ?? 1, 1)
                ).toFixed(3)}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">System Health</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Error Rate</span>
              <span
                className={cn(
                  "font-medium",
                  (metrics.error_rate?.metric_value ?? 0) > 1 && "text-red-500"
                )}
              >
                {formatMetricValue(
                  "error_rate",
                  metrics.error_rate?.metric_value ?? 0
                )}
                %
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rate Limit Hits</span>
              <span className="font-medium">
                {metrics.rate_limit_hits?.metric_value ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Users</span>
              <span className="font-medium">
                {metrics.active_users?.metric_value ?? activeUserCount}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
