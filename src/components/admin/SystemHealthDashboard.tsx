// @ts-nocheck - Admin tables not yet in generated types
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface HealthMetric {
  metric_type: string;
  metric_value: number;
  metric_unit: string | null;
  recorded_at: string;
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

export function SystemHealthDashboard() {
  const [metrics, setMetrics] = useState<Record<string, HealthMetric>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    fetchMetrics();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchMetrics();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin_system_health")
        .select("*")
        .order("recorded_at", { ascending: false });

      if (error) throw error;

      // Get the most recent value for each metric type
      const metricsMap: Record<string, HealthMetric> = {};
      data?.forEach((metric) => {
        if (!metricsMap[metric.metric_type]) {
          metricsMap[metric.metric_type] = metric;
        }
      });

      setMetrics(metricsMap);
      setLastUpdate(new Date());
    } catch (error: unknown) {
      toast({
        title: "Error loading system health",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getMetricStatus = (type: string, value: number): "good" | "warning" | "critical" => {
    switch (type) {
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
        return value.toFixed(2);
      case "ai_cost_daily":
        return value.toFixed(2);
      default:
        return value.toString();
    }
  };

  const metricCards: MetricCard[] = [
    {
      title: "API Response (p95)",
      value: formatMetricValue(
        "api_response_time_p95",
        metrics.api_response_time_p95?.metric_value || 0
      ),
      unit: "ms",
      icon: Activity,
      status: getMetricStatus(
        "api_response_time_p95",
        metrics.api_response_time_p95?.metric_value || 0
      ),
    },
    {
      title: "API Response (p99)",
      value: formatMetricValue(
        "api_response_time_p99",
        metrics.api_response_time_p99?.metric_value || 0
      ),
      unit: "ms",
      icon: Activity,
      status: getMetricStatus(
        "api_response_time_p99",
        metrics.api_response_time_p99?.metric_value || 0
      ),
    },
    {
      title: "Error Rate",
      value: formatMetricValue("error_rate", metrics.error_rate?.metric_value || 0),
      unit: "%",
      icon: AlertTriangle,
      status: getMetricStatus("error_rate", metrics.error_rate?.metric_value || 0),
    },
    {
      title: "Active Users",
      value: (metrics.active_users?.metric_value || 0).toString(),
      unit: "users",
      icon: Database,
      status: "good",
    },
    {
      title: "AI API Calls",
      value: (metrics.ai_api_calls?.metric_value || 0).toString(),
      unit: "calls",
      icon: Zap,
      status: "good",
    },
    {
      title: "AI Cost (Daily)",
      value: formatMetricValue("ai_cost_daily", metrics.ai_cost_daily?.metric_value || 0),
      unit: "$",
      icon: DollarSign,
      status: getMetricStatus("ai_cost_daily", metrics.ai_cost_daily?.metric_value || 0),
    },
    {
      title: "Rate Limit Hits",
      value: (metrics.rate_limit_hits?.metric_value || 0).toString(),
      unit: "hits",
      icon: AlertTriangle,
      status: getMetricStatus("rate_limit_hits", metrics.rate_limit_hits?.metric_value || 0),
    },
    {
      title: "Database Connections",
      value: (metrics.database_connections?.metric_value || 0).toString(),
      unit: "conns",
      icon: Database,
      status: "good",
    },
  ];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h2 className="text-2xl font-bold">System Health</h2>
          <Badge variant="outline" className="animate-pulse">
            Live
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchMetrics}
            disabled={loading}
            title="Refresh metrics"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      <Card className="p-6">
        <div className="flex items-center gap-3">
          {metricCards.some((m) => m.status === "critical") ? (
            <>
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-lg font-semibold">System Issues Detected</span>
            </>
          ) : metricCards.some((m) => m.status === "warning") ? (
            <>
              <div className="h-3 w-3 rounded-full bg-yellow-500 animate-pulse" />
              <span className="text-lg font-semibold">System Running (Warnings)</span>
            </>
          ) : (
            <>
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-lg font-semibold">All Systems Operational</span>
            </>
          )}
        </div>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          const TrendIcon = getTrendIcon(metric.trend);

          return (
            <Card key={metric.title} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg border ${getStatusColor(metric.status)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {metric.trend && (
                  <TrendIcon
                    className={`h-4 w-4 ${
                      metric.trend === "up"
                        ? "text-green-500"
                        : metric.trend === "down"
                        ? "text-red-500"
                        : "text-muted-foreground"
                    }`}
                  />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{metric.title}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">{metric.value}</span>
                  <span className="text-sm text-muted-foreground">{metric.unit}</span>
                </div>
                {metric.trendValue && (
                  <p className="text-xs text-muted-foreground">{metric.trendValue}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Performance</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">P50 Response</span>
              <span className="font-medium">
                {formatMetricValue(
                  "api_response_time_p50",
                  metrics.api_response_time_p50?.metric_value || 0
                )}
                ms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P95 Response</span>
              <span className="font-medium">
                {formatMetricValue(
                  "api_response_time_p95",
                  metrics.api_response_time_p95?.metric_value || 0
                )}
                ms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P99 Response</span>
              <span className="font-medium">
                {formatMetricValue(
                  "api_response_time_p99",
                  metrics.api_response_time_p99?.metric_value || 0
                )}
                ms
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">AI Usage</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">API Calls</span>
              <span className="font-medium">{metrics.ai_api_calls?.metric_value || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily Cost</span>
              <span className="font-medium">
                ${formatMetricValue("ai_cost_daily", metrics.ai_cost_daily?.metric_value || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Cost/Call</span>
              <span className="font-medium">
                $
                {(
                  (metrics.ai_cost_daily?.metric_value || 0) /
                  Math.max(metrics.ai_api_calls?.metric_value || 1, 1)
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
              <span className={`font-medium ${metrics.error_rate?.metric_value > 1 ? "text-red-500" : ""}`}>
                {formatMetricValue("error_rate", metrics.error_rate?.metric_value || 0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rate Limit Hits</span>
              <span className="font-medium">{metrics.rate_limit_hits?.metric_value || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Users</span>
              <span className="font-medium">{metrics.active_users?.metric_value || 0}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

