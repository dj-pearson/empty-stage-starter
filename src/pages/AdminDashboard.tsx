import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Users,
  TrendingUp,
  AlertCircle,
  Bell,
  BarChart3,
  Zap,
  Calendar,
  RefreshCw,
  Monitor,
  History,
  Shield,
} from "lucide-react";
import {
  getPlatformHealth,
  getUserEngagement,
  getDailyActivity,
  getAIUsage,
  getFeatureAdoption,
  getAdminNotifications,
  getUserRetention,
  getErrorTracking,
  markNotificationRead,
  markAllNotificationsRead,
  isAdmin,
  formatSeverity,
  formatUserTier,
  formatNumber,
  calculateGrowth,
  type PlatformHealth,
  type UserEngagement,
  type DailyActivity,
  type AIUsage,
  type AdminNotification,
} from "@/lib/admin-analytics";
import { toast } from "sonner";
import { LiveActivityFeed } from "@/components/admin/LiveActivityFeed";
import { SystemHealthDashboard } from "@/components/admin/SystemHealthDashboard";
import { AlertManager } from "@/components/admin/AlertManager";
import { AdminIntegrationManager } from "@/components/admin/AdminIntegrationManager";
import { LoginHistoryDashboard } from "@/components/admin/LoginHistoryDashboard";
import { LoginAnalyticsDashboard } from "@/components/admin/LoginAnalyticsDashboard";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [platformHealth, setPlatformHealth] = useState<PlatformHealth | null>(null);
  const [userEngagement, setUserEngagement] = useState<UserEngagement[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [aiUsage, setAIUsage] = useState<AIUsage[]>([]);
  const [featureAdoption, setFeatureAdoption] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [retention, setRetention] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [showOnlyUnread, setShowOnlyUnread] = useState(true);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const adminAccess = await isAdmin();
    setHasAccess(adminAccess);

    if (adminAccess) {
      loadData();
    } else {
      setLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);

    const [
      healthData,
      engagementData,
      activityData,
      aiData,
      adoptionData,
      notificationData,
      retentionData,
      errorData,
    ] = await Promise.all([
      getPlatformHealth(),
      getUserEngagement(20),
      getDailyActivity(30),
      getAIUsage(),
      getFeatureAdoption(),
      getAdminNotifications(showOnlyUnread),
      getUserRetention(),
      getErrorTracking(),
    ]);

    setPlatformHealth(healthData);
    setUserEngagement(engagementData);
    setDailyActivity(activityData);
    setAIUsage(aiData);
    setFeatureAdoption(adoptionData);
    setNotifications(notificationData);
    setRetention(retentionData);
    setErrors(errorData);
    setLoading(false);
  };

  const handleMarkRead = async (id: string) => {
    const success = await markNotificationRead(id);
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    }
  };

  const handleMarkAllRead = async () => {
    const success = await markAllNotificationsRead();
    if (success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-muted-foreground">Loading admin dashboard...</div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You don't have permission to access the admin dashboard.
          </p>
        </Card>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Platform analytics and monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="px-3 py-1">
              {unreadCount} alerts
            </Badge>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      {platformHealth && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-5 h-5 text-blue-500" />
              <Badge variant="secondary">
                +{platformHealth.new_users_7d} this week
              </Badge>
            </div>
            <div className="text-3xl font-bold">{formatNumber(platformHealth.total_users)}</div>
            <div className="text-sm text-muted-foreground">Total Users</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-5 h-5 text-green-500" />
              <Badge variant="secondary">
                {Math.round((platformHealth.active_users_7d / platformHealth.total_users) * 100)}%
                active
              </Badge>
            </div>
            <div className="text-3xl font-bold">
              {formatNumber(platformHealth.active_users_7d)}
            </div>
            <div className="text-sm text-muted-foreground">Active Users (7d)</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              <Badge variant="secondary">
                +{platformHealth.achievements_7d} this week
              </Badge>
            </div>
            <div className="text-3xl font-bold">
              {formatNumber(platformHealth.successful_attempts_7d)}
            </div>
            <div className="text-sm text-muted-foreground">Successful Attempts (7d)</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle
                className={`w-5 h-5 ${
                  platformHealth.failed_backups_24h + platformHealth.failed_emails_24h > 0
                    ? "text-red-500"
                    : "text-green-500"
                }`}
              />
              {platformHealth.failed_backups_24h + platformHealth.failed_emails_24h > 0 ? (
                <Badge variant="destructive">Issues</Badge>
              ) : (
                <Badge variant="secondary">Healthy</Badge>
              )}
            </div>
            <div className="text-3xl font-bold">
              {platformHealth.failed_backups_24h + platformHealth.failed_emails_24h}
            </div>
            <div className="text-sm text-muted-foreground">System Errors (24h)</div>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="w-4 h-4 mr-2" />
            Live Activity
          </TabsTrigger>
          <TabsTrigger value="health">
            <Monitor className="w-4 h-4 mr-2" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="login-history">
            <History className="w-4 h-4 mr-2" />
            Login History
          </TabsTrigger>
          <TabsTrigger value="login-analytics">
            <Shield className="w-4 h-4 mr-2" />
            Login Analytics
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <Bell className="w-4 h-4 mr-2" />
            Alerts {unreadCount > 0 && `(${unreadCount})`}
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Zap className="w-4 h-4 mr-2" />
            AI Usage
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-4 h-4 mr-2" />
            Old Notifications
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Zap className="w-4 h-4 mr-2" />
            Integrations
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">

        {/* Live Activity Tab */}
        <TabsContent value="activity">
          <LiveActivityFeed />
        </TabsContent>

        {/* System Health Tab */}
        <TabsContent value="health">
          <SystemHealthDashboard />
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <AlertManager />
        </TabsContent>

        {/* Login History Tab */}
        <TabsContent value="login-history">
          <LoginHistoryDashboard />
        </TabsContent>

        {/* Login Analytics Tab */}
        <TabsContent value="login-analytics">
          <LoginAnalyticsDashboard />
        </TabsContent>
          {/* Daily Activity Chart */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Daily Activity (Last 30 Days)
            </h3>
            <div className="space-y-2">
              {dailyActivity.slice(0, 10).map((day) => (
                <div key={day.date} className="flex items-center gap-4 text-sm">
                  <div className="w-24 text-muted-foreground">
                    {new Date(day.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-16">{day.active_users} users</div>
                    <div className="w-24">{day.meals_logged} meals</div>
                    <div className="w-32">{day.successful_attempts} successes</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Feature Adoption */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Feature Adoption</h3>
            <div className="space-y-4">
              {featureAdoption.map((feature) => (
                <div key={feature.feature}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{feature.feature}</span>
                    <span className="text-sm text-muted-foreground">
                      {feature.users_using} users ({feature.adoption_rate_pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${feature.adoption_rate_pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Error Tracking */}
          {errors.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                Recent Errors
              </h3>
              <div className="space-y-3">
                {errors.map((error) => (
                  <div key={error.error_type} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{error.error_type}</span>
                      <Badge variant="destructive">{error.error_count} errors</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Last: {new Date(error.last_occurrence).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Top Users by Engagement</h3>
            <div className="space-y-3">
              {userEngagement.map((user) => {
                const tier = formatUserTier(user.user_tier);
                return (
                  <div key={user.user_id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{user.full_name || "Anonymous"}</div>
                      <div className="text-sm text-muted-foreground">
                        {user.kids_count} kids · {user.foods_count} foods · {user.recipes_count}{" "}
                        recipes
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-2xl font-bold">{user.engagement_score}</div>
                        <div className="text-xs text-muted-foreground">score</div>
                      </div>
                      <Badge className={`${tier.bgColor} ${tier.color}`}>{tier.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Retention Cohorts */}
          {retention.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">User Retention Cohorts</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Cohort</th>
                      <th className="text-right p-2">Size</th>
                      <th className="text-right p-2">Month 1</th>
                      <th className="text-right p-2">Month 2</th>
                      <th className="text-right p-2">Month 3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retention.map((cohort) => (
                      <tr key={cohort.cohort_month} className="border-b">
                        <td className="p-2">
                          {new Date(cohort.cohort_month).toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="text-right p-2">{cohort.cohort_size}</td>
                        <td className="text-right p-2">{cohort.retention_month_1_pct}%</td>
                        <td className="text-right p-2">{cohort.retention_month_2_pct}%</td>
                        <td className="text-right p-2">{cohort.retention_month_3_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* AI Usage Tab */}
        <TabsContent value="ai" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">AI Endpoint Usage</h3>
            <div className="space-y-4">
              {aiUsage.map((endpoint) => (
                <div key={endpoint.endpoint} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">{endpoint.endpoint}</div>
                      <div className="text-sm text-muted-foreground">{endpoint.description}</div>
                    </div>
                    <Badge variant="secondary">{formatNumber(endpoint.total_requests)} calls</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm mt-3">
                    <div>
                      <div className="text-muted-foreground">24h</div>
                      <div className="font-medium">{endpoint.requests_24h}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">7d</div>
                      <div className="font-medium">{endpoint.requests_7d}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Users</div>
                      <div className="font-medium">{endpoint.unique_users}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg/User</div>
                      <div className="font-medium">{endpoint.avg_requests_per_user}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">System Notifications</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOnlyUnread(!showOnlyUnread)}
                >
                  {showOnlyUnread ? "Show All" : "Show Unread"}
                </Button>
                {unreadCount > 0 && (
                  <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                    Mark All Read
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No notifications to display
                </div>
              ) : (
                notifications.map((notification) => {
                  const severity = formatSeverity(notification.severity);
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 border rounded-lg ${
                        notification.is_read ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`${severity.bgColor} ${severity.color}`}>
                            {severity.label}
                          </Badge>
                          <span className="font-medium">{notification.title}</span>
                        </div>
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkRead(notification.id)}
                          >
                            Mark Read
                          </Button>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        {notification.message}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(notification.created_at).toLocaleString()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <AdminIntegrationManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
