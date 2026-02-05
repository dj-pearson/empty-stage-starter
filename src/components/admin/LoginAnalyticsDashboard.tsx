/**
 * Login Analytics Dashboard
 *
 * Marketing and platform analytics for user login behavior.
 * Provides insights into device usage, geographic distribution,
 * authentication method preferences, and login trends.
 */

import { useState, useEffect, useMemo } from "react";
import { useAdminLoginHistory } from "@/hooks/useLoginHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  TrendingUp,
  TrendingDown,
  Users,
  Shield,
  ShieldAlert,
  Clock,
  MapPin,
  Chrome,
  Apple,
  Key,
  Mail,
  BarChart3,
  PieChart,
  Activity,
  Calendar,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

// Simple bar chart component
function SimpleBarChart({
  data,
  maxValue,
  color = "bg-primary",
}: {
  data: { label: string; value: number }[];
  maxValue: number;
  color?: string;
}) {
  return (
    <div className="space-y-3">
      {data.map((item, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground truncate max-w-[150px]">{item.label}</span>
            <span className="font-medium">{item.value.toLocaleString()}</span>
          </div>
          <Progress
            value={(item.value / maxValue) * 100}
            className="h-2"
          />
        </div>
      ))}
    </div>
  );
}

// Trend indicator
function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const isPositive = change >= 0;

  return (
    <div className={cn(
      "flex items-center gap-1 text-sm",
      isPositive ? "text-safe-food" : "text-destructive"
    )}>
      {isPositive ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      <span>{Math.abs(change).toFixed(1)}%</span>
    </div>
  );
}

// Stat card with trend
function StatCardWithTrend({
  title,
  current,
  previous,
  icon: Icon,
  suffix = "",
}: {
  title: string;
  current: number;
  previous: number;
  icon: typeof Users;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">
              {current.toLocaleString()}{suffix}
            </p>
            <div className="mt-2">
              <TrendIndicator current={current} previous={previous} />
            </div>
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Device breakdown chart
function DeviceBreakdown({
  data,
}: {
  data: { device_type: string; total_logins: number; percentage: number }[];
}) {
  const deviceIcons: Record<string, typeof Monitor> = {
    desktop: Monitor,
    mobile: Smartphone,
    tablet: Tablet,
  };

  const deviceColors: Record<string, string> = {
    desktop: "bg-blue-500",
    mobile: "bg-green-500",
    tablet: "bg-purple-500",
  };

  // Group by device type
  const grouped = data.reduce((acc, item) => {
    const type = item.device_type || "unknown";
    if (!acc[type]) {
      acc[type] = { total: 0, percentage: 0 };
    }
    acc[type].total += item.total_logins;
    acc[type].percentage += item.percentage;
    return acc;
  }, {} as Record<string, { total: number; percentage: number }>);

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([type, stats]) => {
        const Icon = deviceIcons[type] || Monitor;
        return (
          <div key={type} className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="font-medium capitalize">{type}</span>
                <span className="text-muted-foreground">
                  {stats.total.toLocaleString()} ({stats.percentage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={stats.percentage} className="h-2" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Login method breakdown
function LoginMethodBreakdown({
  data,
}: {
  data: { login_method: string; count: number }[];
}) {
  const methodIcons: Record<string, typeof Key> = {
    password: Key,
    google: Chrome,
    apple: Apple,
    otp: Mail,
    magic_link: Mail,
  };

  const methodLabels: Record<string, string> = {
    password: "Email & Password",
    google: "Google OAuth",
    apple: "Apple Sign In",
    otp: "One-Time Password",
    magic_link: "Magic Link",
  };

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const Icon = methodIcons[item.login_method] || Key;
        const percentage = total > 0 ? (item.count / total) * 100 : 0;
        return (
          <div key={item.login_method} className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="font-medium">
                  {methodLabels[item.login_method] || item.login_method}
                </span>
                <span className="text-muted-foreground">
                  {item.count.toLocaleString()} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={percentage} className="h-2" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Geographic distribution
function GeographicDistribution({
  data,
}: {
  data: {
    country: string;
    country_code: string;
    total_logins: number;
    unique_users: number;
  }[];
}) {
  const topCountries = data.slice(0, 10);
  const totalLogins = data.reduce((sum, d) => sum + d.total_logins, 0);

  return (
    <div className="space-y-4">
      {topCountries.map((country, idx) => {
        const percentage = totalLogins > 0 ? (country.total_logins / totalLogins) * 100 : 0;
        return (
          <div key={country.country_code} className="flex items-center gap-4">
            <div className="w-6 text-center">
              <span className="text-sm text-muted-foreground">{idx + 1}</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {country.country || "Unknown"}
                </span>
                <span className="text-muted-foreground">
                  {country.total_logins.toLocaleString()} logins
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={percentage} className="h-2 flex-1" />
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {percentage.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Daily trend mini chart
function DailyTrendChart({
  data,
}: {
  data: { login_date: string; total_logins: number; unique_users: number }[];
}) {
  const sortedData = [...data].sort((a, b) =>
    a.login_date.localeCompare(b.login_date)
  ).slice(-14); // Last 14 days

  const maxLogins = Math.max(...sortedData.map(d => d.total_logins), 1);

  return (
    <div className="flex items-end gap-1 h-32">
      {sortedData.map((day, idx) => {
        const height = (day.total_logins / maxLogins) * 100;
        const date = parseISO(day.login_date);
        return (
          <div
            key={day.login_date}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <div
              className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
              style={{ height: `${height}%` }}
              title={`${format(date, "MMM d")}: ${day.total_logins} logins`}
            />
            {idx % 2 === 0 && (
              <span className="text-[10px] text-muted-foreground">
                {format(date, "d")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Browser breakdown
function BrowserBreakdown({
  data,
}: {
  data: { browser_name: string; total_logins: number }[];
}) {
  // Group by browser
  const grouped = data.reduce((acc, item) => {
    const browser = item.browser_name || "Unknown";
    acc[browser] = (acc[browser] || 0) + item.total_logins;
    return acc;
  }, {} as Record<string, number>);

  const sorted = Object.entries(grouped)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const maxValue = Math.max(...sorted.map(d => d.value), 1);

  return <SimpleBarChart data={sorted} maxValue={maxValue} />;
}

// OS breakdown
function OSBreakdown({
  data,
}: {
  data: { os_name: string; total_logins: number }[];
}) {
  // Group by OS
  const grouped = data.reduce((acc, item) => {
    const os = item.os_name || "Unknown";
    acc[os] = (acc[os] || 0) + item.total_logins;
    return acc;
  }, {} as Record<string, number>);

  const sorted = Object.entries(grouped)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const maxValue = Math.max(...sorted.map(d => d.value), 1);

  return <SimpleBarChart data={sorted} maxValue={maxValue} />;
}

/**
 * Main LoginAnalyticsDashboard Component
 */
export function LoginAnalyticsDashboard() {
  const {
    isAdmin,
    isLoading,
    dailyStats,
    countryStats,
    platformStats,
    refreshStats,
  } = useAdminLoginHistory();

  const [timeRange, setTimeRange] = useState("7");

  // Calculate summary metrics
  const metrics = useMemo(() => {
    const days = parseInt(timeRange);
    const currentPeriod = dailyStats.slice(0, days);
    const previousPeriod = dailyStats.slice(days, days * 2);

    const currentLogins = currentPeriod.reduce((sum, d) => sum + d.total_logins, 0);
    const previousLogins = previousPeriod.reduce((sum, d) => sum + d.total_logins, 0);

    const currentUsers = new Set(currentPeriod.flatMap(d => d.unique_users)).size ||
      currentPeriod.reduce((sum, d) => sum + d.unique_users, 0);
    const previousUsers = previousPeriod.reduce((sum, d) => sum + d.unique_users, 0);

    const currentFailures = currentPeriod.reduce((sum, d) => sum + d.failed_logins, 0);
    const previousFailures = previousPeriod.reduce((sum, d) => sum + d.failed_logins, 0);

    const currentMobile = currentPeriod.reduce((sum, d) => sum + d.mobile_logins, 0);
    const previousMobile = previousPeriod.reduce((sum, d) => sum + d.mobile_logins, 0);

    return {
      currentLogins,
      previousLogins,
      currentUsers,
      previousUsers,
      currentFailures,
      previousFailures,
      currentMobile,
      previousMobile,
      mobilePercentage: currentLogins > 0 ? (currentMobile / currentLogins) * 100 : 0,
      failureRate: currentLogins > 0 ? (currentFailures / currentLogins) * 100 : 0,
    };
  }, [dailyStats, timeRange]);

  // Calculate login method distribution
  const loginMethodData = useMemo(() => {
    const days = parseInt(timeRange);
    const period = dailyStats.slice(0, days);

    return [
      { login_method: "password", count: period.reduce((sum, d) => sum + d.password_logins, 0) },
      { login_method: "google", count: period.reduce((sum, d) => sum + d.google_logins, 0) },
      { login_method: "apple", count: period.reduce((sum, d) => sum + d.apple_logins, 0) },
    ].filter(d => d.count > 0);
  }, [dailyStats, timeRange]);

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Admin access required</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Login Analytics</h2>
          <p className="text-muted-foreground">
            User authentication patterns and platform usage insights
          </p>
        </div>
        <div className="flex gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={refreshStats} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCardWithTrend
          title="Total Logins"
          current={metrics.currentLogins}
          previous={metrics.previousLogins}
          icon={Activity}
        />
        <StatCardWithTrend
          title="Active Users"
          current={metrics.currentUsers}
          previous={metrics.previousUsers}
          icon={Users}
        />
        <StatCardWithTrend
          title="Mobile Logins"
          current={metrics.currentMobile}
          previous={metrics.previousMobile}
          icon={Smartphone}
        />
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failure Rate</p>
                <p className="text-2xl font-bold mt-1">
                  {metrics.failureRate.toFixed(1)}%
                </p>
                <Badge
                  variant={metrics.failureRate > 5 ? "destructive" : "secondary"}
                  className="mt-2"
                >
                  {metrics.currentFailures} failed
                </Badge>
              </div>
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Login Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Login Trend
          </CardTitle>
          <CardDescription>
            Daily login activity over the selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyTrendChart data={dailyStats} />
        </CardContent>
      </Card>

      {/* Analytics Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Device Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Device Distribution
            </CardTitle>
            <CardDescription>
              How users access the platform by device type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeviceBreakdown data={platformStats} />
          </CardContent>
        </Card>

        {/* Login Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Authentication Methods
            </CardTitle>
            <CardDescription>
              Preferred login methods among users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginMethodBreakdown data={loginMethodData} />
          </CardContent>
        </Card>

        {/* Geographic Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Top Countries
            </CardTitle>
            <CardDescription>
              Geographic distribution of user logins
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GeographicDistribution data={countryStats} />
          </CardContent>
        </Card>

        {/* Browser & OS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Browser & OS
            </CardTitle>
            <CardDescription>
              Technology preferences of users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="browser">
              <TabsList className="mb-4">
                <TabsTrigger value="browser">Browsers</TabsTrigger>
                <TabsTrigger value="os">Operating Systems</TabsTrigger>
              </TabsList>
              <TabsContent value="browser">
                <BrowserBreakdown data={platformStats} />
              </TabsContent>
              <TabsContent value="os">
                <OSBreakdown data={platformStats} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Key Insights</CardTitle>
          <CardDescription>
            Automated observations from login data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Mobile Adoption */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <span className="font-medium">Mobile Adoption</span>
              </div>
              <p className="text-2xl font-bold">{metrics.mobilePercentage.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground mt-1">
                {metrics.mobilePercentage > 50
                  ? "Strong mobile presence - ensure mobile experience is optimized"
                  : "Consider improving mobile experience to boost adoption"}
              </p>
            </div>

            {/* OAuth Adoption */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Chrome className="h-5 w-5 text-primary" />
                <span className="font-medium">Social Login Usage</span>
              </div>
              <p className="text-2xl font-bold">
                {loginMethodData.filter(d => d.login_method !== 'password')
                  .reduce((sum, d) => sum + d.count, 0)
                  .toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {loginMethodData.find(d => d.login_method === 'google')?.count || 0} Google,{' '}
                {loginMethodData.find(d => d.login_method === 'apple')?.count || 0} Apple logins
              </p>
            </div>

            {/* Security */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-medium">Security Status</span>
              </div>
              <p className="text-2xl font-bold">
                {metrics.failureRate < 2
                  ? "Healthy"
                  : metrics.failureRate < 5
                  ? "Normal"
                  : "Elevated"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {metrics.currentFailures} failed attempts ({metrics.failureRate.toFixed(1)}% failure rate)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginAnalyticsDashboard;
