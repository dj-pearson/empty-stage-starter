// @ts-nocheck
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Users, Eye, MousePointerClick, Activity } from "lucide-react";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

interface MetricCard {
  title: string;
  value: string;
  change: number;
  icon: any;
  color: string;
}

export function TrafficOverview({ dateRange, connections }: Props) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (connections.length > 0) {
      fetchData();
    }
  }, [dateRange, connections]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const connectionIds = connections.map(c => c.id);
      const startDate = format(dateRange.from, "yyyy-MM-dd");
      const endDate = format(dateRange.to, "yyyy-MM-dd");

      // Fetch aggregated traffic metrics
      const { data, error } = await supabase
        .from("unified_traffic_metrics")
        .select("*")
        .in("connection_id", connectionIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (error) throw error;

      // Aggregate data by date
      const aggregatedByDate = new Map();
      data?.forEach((row: any) => {
        const date = row.date;
        if (!aggregatedByDate.has(date)) {
          aggregatedByDate.set(date, {
            date,
            sessions: 0,
            users: 0,
            pageviews: 0,
            impressions: 0,
            clicks: 0,
            bounce_rate: [],
            avg_session_duration: [],
          });
        }
        const agg = aggregatedByDate.get(date);
        agg.sessions += row.sessions || 0;
        agg.users += row.users || 0;
        agg.pageviews += row.pageviews || 0;
        agg.impressions += row.impressions || 0;
        agg.clicks += row.clicks || 0;
        if (row.bounce_rate) agg.bounce_rate.push(row.bounce_rate);
        if (row.avg_session_duration) agg.avg_session_duration.push(row.avg_session_duration);
      });

      // Calculate chart data
      const chartDataArray = Array.from(aggregatedByDate.values()).map((day: any) => ({
        date: format(new Date(day.date), "MMM d"),
        sessions: day.sessions,
        users: day.users,
        pageviews: day.pageviews,
        impressions: day.impressions,
        clicks: day.clicks,
        bounceRate: day.bounce_rate.length > 0
          ? day.bounce_rate.reduce((a: number, b: number) => a + b, 0) / day.bounce_rate.length
          : 0,
      }));

      setChartData(chartDataArray);

      // Calculate summary metrics
      const totalSessions = chartDataArray.reduce((sum, day) => sum + day.sessions, 0);
      const totalUsers = chartDataArray.reduce((sum, day) => sum + day.users, 0);
      const totalPageviews = chartDataArray.reduce((sum, day) => sum + day.pageviews, 0);
      const totalClicks = chartDataArray.reduce((sum, day) => sum + day.clicks, 0);
      const _avgBounceRate = chartDataArray.reduce((sum, day) => sum + day.bounceRate, 0) / chartDataArray.length;

      // Calculate changes (compare first half vs second half of period)
      const midpoint = Math.floor(chartDataArray.length / 2);
      const firstHalf = chartDataArray.slice(0, midpoint);
      const secondHalf = chartDataArray.slice(midpoint);

      const calculateChange = (firstHalf: any[], secondHalf: any[], key: string) => {
        const firstSum = firstHalf.reduce((sum, day) => sum + day[key], 0);
        const secondSum = secondHalf.reduce((sum, day) => sum + day[key], 0);
        if (firstSum === 0) return 0;
        return ((secondSum - firstSum) / firstSum) * 100;
      };

      setMetrics([
        {
          title: "Total Sessions",
          value: totalSessions.toLocaleString(),
          change: calculateChange(firstHalf, secondHalf, "sessions"),
          icon: Activity,
          color: "text-blue-600",
        },
        {
          title: "Total Users",
          value: totalUsers.toLocaleString(),
          change: calculateChange(firstHalf, secondHalf, "users"),
          icon: Users,
          color: "text-green-600",
        },
        {
          title: "Total Pageviews",
          value: totalPageviews.toLocaleString(),
          change: calculateChange(firstHalf, secondHalf, "pageviews"),
          icon: Eye,
          color: "text-purple-600",
        },
        {
          title: "Total Clicks",
          value: totalClicks.toLocaleString(),
          change: calculateChange(firstHalf, secondHalf, "clicks"),
          icon: MousePointerClick,
          color: "text-orange-600",
        },
      ]);
    } catch (error: any) {
      console.error("Error fetching traffic overview:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const isPositive = metric.change >= 0;

          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                <Icon className={`h-4 w-4 ${metric.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metric.value}</div>
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3 text-green-600 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-600 mr-1" />
                  )}
                  <span className={isPositive ? "text-green-600" : "text-red-600"}>
                    {Math.abs(metric.change).toFixed(1)}%
                  </span>
                  <span className="ml-1">vs previous period</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Traffic Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Traffic Trends</CardTitle>
          <CardDescription>Sessions and users over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="sessions"
                stroke="#3b82f6"
                fill="url(#colorSessions)"
                name="Sessions"
              />
              <Area
                type="monotone"
                dataKey="users"
                stroke="#10b981"
                fill="url(#colorUsers)"
                name="Users"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Search Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Search Performance</CardTitle>
          <CardDescription>Impressions and clicks from search engines</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="impressions"
                stroke="#a855f7"
                name="Impressions"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="clicks"
                stroke="#f97316"
                name="Clicks"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
