import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import {
  Bell,
  Calendar,
  CheckCircle,
  Info,
  Mail,
  RefreshCw,
  Settings,
  Shield,
  XCircle,
} from 'lucide-react';

/**
 * US-553: the monitoring tab, lifted verbatim out of SEOManager.
 *
 * The largest of the extracted tabs at ~500 lines. Presentational and
 * props-down like its siblings; all state and handlers stay in SEOManager.
 */
export interface SeoMonitoringTabProps {
  alerts: Record<string, unknown>[];
  alertRules: Record<string, unknown>[];
  schedules: Record<string, unknown>[];
  notificationPrefs: Record<string, unknown> | null;
  activeAlertsCount: number;
  isLoadingMonitoring: boolean;
  /** Read so the tab can lazy-load its data only while it is the open one. */
  activeTab: string;
  loadMonitoringData: () => void | Promise<void>;
  acknowledgeAlert: (alertId: string) => void | Promise<void>;
  dismissAlert: (alertId: string) => void | Promise<void>;
  toggleSchedule: (scheduleId: string, enabled: boolean) => void | Promise<void>;
  saveNotificationPreferences: (prefs: Record<string, unknown>) => void | Promise<void>;
}

export function SeoMonitoringTab({
  alerts,
  alertRules,
  schedules,
  notificationPrefs,
  activeAlertsCount,
  isLoadingMonitoring,
  activeTab,
  loadMonitoringData,
  acknowledgeAlert,
  dismissAlert,
  toggleSchedule,
  saveNotificationPreferences,
}: SeoMonitoringTabProps) {
  // US-553: this used to be an IIFE in the JSX -- `{(() => { loadMonitoringData();
  // return null; })()}` -- which calls a loader, and through it setState, during
  // render. React warns about it ("Cannot update a component while rendering a
  // different component") and it re-fires on every render that meets the
  // condition. An effect is where a load belongs; the condition is unchanged, so
  // the tab still fetches only when it is the open one and has nothing yet.
  const shouldLoad =
    activeTab === 'monitoring' &&
    !isLoadingMonitoring &&
    alerts.length === 0 &&
    alertRules.length === 0;

  useEffect(() => {
    if (shouldLoad) void loadMonitoringData();
    // loadMonitoringData is redefined on every SEOManager render, so depending
    // on it here would refetch continuously. Track the condition instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoad]);

  return (
<TabsContent value="monitoring" className="space-y-4">

  {/* Active Alerts Section */}
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Active Alerts
          {activeAlertsCount > 0 && (
            <Badge variant="destructive">{activeAlertsCount}</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadMonitoringData}
          disabled={isLoadingMonitoring}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingMonitoring ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardTitle>
      <CardDescription>
        SEO issues and changes that require your attention
      </CardDescription>
    </CardHeader>
    <CardContent>
      {isLoadingMonitoring ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
          <p>No active alerts - your SEO is looking good!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 border rounded-lg ${
                alert.severity === "critical"
                  ? "border-red-500 bg-red-50 dark:bg-red-950"
                  : alert.severity === "high"
                  ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                  : alert.severity === "medium"
                  ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                  : "border-blue-500 bg-blue-50 dark:bg-blue-950"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant={
                        alert.severity === "critical" || alert.severity === "high"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">{alert.alert_type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleString()}
                    </span>
                  </div>
                  <h4 className="font-semibold mb-1">{alert.title}</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    {alert.message}
                  </p>
                  {alert.details && Object.keys(alert.details).length > 0 && (
                    <div className="text-xs bg-card p-2 rounded border mt-2">
                      {Object.entries(alert.details).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-1">
                          <span className="font-medium">{key}:</span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Acknowledge
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissAlert(alert.id)}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>

  {/* Monitoring Schedules Section */}
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Calendar className="h-5 w-5" />
        Automated Monitoring Schedules
      </CardTitle>
      <CardDescription>
        Configure automated SEO audits and keyword position checks
      </CardDescription>
    </CardHeader>
    <CardContent>
      {schedules.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          <Info className="h-8 w-8 mx-auto mb-2" />
          <p>No monitoring schedules configured yet</p>
          <p className="text-sm mt-1">Default daily audit schedule will be created automatically</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell className="font-medium">
                  {schedule.schedule_name}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{schedule.schedule_type}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {schedule.cron_expression}
                </TableCell>
                <TableCell className="text-sm">
                  {schedule.last_run_at ? (
                    <div>
                      <div>{new Date(schedule.last_run_at).toLocaleDateString()}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(schedule.last_run_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ) : (
                    "Never"
                  )}
                </TableCell>
                <TableCell>
                  {schedule.last_run_status === "success" ? (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Success
                    </Badge>
                  ) : schedule.last_run_status === "failed" ? (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Failed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant={schedule.is_enabled ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      toggleSchedule(schedule.id, !schedule.is_enabled)
                    }
                  >
                    {schedule.is_enabled ? "Enabled" : "Disabled"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>

  {/* Notification Preferences Section */}
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Settings className="h-5 w-5" />
        Notification Preferences
      </CardTitle>
      <CardDescription>
        Configure how and when you want to receive SEO alerts
      </CardDescription>
    </CardHeader>
    <CardContent>
      {notificationPrefs && (
        <div className="space-y-6">
          {/* Email Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Notifications
            </h3>
            <div className="grid gap-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-enabled">Email Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive alerts via email
                  </p>
                </div>
                <Button
                  id="email-enabled"
                  variant={notificationPrefs.email_enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    saveNotificationPreferences({
                      ...notificationPrefs,
                      email_enabled: !notificationPrefs.email_enabled,
                    })
                  }
                >
                  {notificationPrefs.email_enabled ? "Enabled" : "Disabled"}
                </Button>
              </div>

              {notificationPrefs.email_enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Immediate Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Get notified immediately when issues occur
                      </p>
                    </div>
                    <Button
                      variant={notificationPrefs.immediate_alerts ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        saveNotificationPreferences({
                          ...notificationPrefs,
                          immediate_alerts: !notificationPrefs.immediate_alerts,
                        })
                      }
                    >
                      {notificationPrefs.immediate_alerts ? "On" : "Off"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Daily Digest</Label>
                      <p className="text-sm text-muted-foreground">
                        Daily summary of SEO metrics and alerts
                      </p>
                    </div>
                    <Button
                      variant={notificationPrefs.daily_digest ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        saveNotificationPreferences({
                          ...notificationPrefs,
                          daily_digest: !notificationPrefs.daily_digest,
                        })
                      }
                    >
                      {notificationPrefs.daily_digest ? "On" : "Off"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Weekly Digest</Label>
                      <p className="text-sm text-muted-foreground">
                        Weekly performance report
                      </p>
                    </div>
                    <Button
                      variant={notificationPrefs.weekly_digest ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        saveNotificationPreferences({
                          ...notificationPrefs,
                          weekly_digest: !notificationPrefs.weekly_digest,
                        })
                      }
                    >
                      {notificationPrefs.weekly_digest ? "On" : "Off"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Alert Types */}
          <div className="space-y-4">
            <h3 className="font-semibold">What to Monitor</h3>
            <div className="grid gap-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>SEO Score Drops</Label>
                  <p className="text-sm text-muted-foreground">
                    Alert when your SEO score decreases
                  </p>
                </div>
                <Button
                  variant={notificationPrefs.notify_score_drops ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    saveNotificationPreferences({
                      ...notificationPrefs,
                      notify_score_drops: !notificationPrefs.notify_score_drops,
                    })
                  }
                >
                  {notificationPrefs.notify_score_drops ? "On" : "Off"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Keyword Position Changes</Label>
                  <p className="text-sm text-muted-foreground">
                    Alert when keyword rankings change significantly
                  </p>
                </div>
                <Button
                  variant={notificationPrefs.notify_keyword_changes ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    saveNotificationPreferences({
                      ...notificationPrefs,
                      notify_keyword_changes: !notificationPrefs.notify_keyword_changes,
                    })
                  }
                >
                  {notificationPrefs.notify_keyword_changes ? "On" : "Off"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Competitor Changes</Label>
                  <p className="text-sm text-muted-foreground">
                    Alert when competitors' rankings change
                  </p>
                </div>
                <Button
                  variant={notificationPrefs.notify_competitor_changes ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    saveNotificationPreferences({
                      ...notificationPrefs,
                      notify_competitor_changes: !notificationPrefs.notify_competitor_changes,
                    })
                  }
                >
                  {notificationPrefs.notify_competitor_changes ? "On" : "Off"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>GSC Issues</Label>
                  <p className="text-sm text-muted-foreground">
                    Alert about Google Search Console issues
                  </p>
                </div>
                <Button
                  variant={notificationPrefs.notify_gsc_issues ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    saveNotificationPreferences({
                      ...notificationPrefs,
                      notify_gsc_issues: !notificationPrefs.notify_gsc_issues,
                    })
                  }
                >
                  {notificationPrefs.notify_gsc_issues ? "On" : "Off"}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Performance Issues</Label>
                  <p className="text-sm text-muted-foreground">
                    Alert about page speed and performance problems
                  </p>
                </div>
                <Button
                  variant={notificationPrefs.notify_performance_issues ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    saveNotificationPreferences({
                      ...notificationPrefs,
                      notify_performance_issues: !notificationPrefs.notify_performance_issues,
                    })
                  }
                >
                  {notificationPrefs.notify_performance_issues ? "On" : "Off"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </CardContent>
  </Card>

  {/* Alert Rules Section */}
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Shield className="h-5 w-5" />
        Alert Rules
      </CardTitle>
      <CardDescription>
        Custom rules that trigger alerts based on specific conditions
      </CardDescription>
    </CardHeader>
    <CardContent>
      {alertRules.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          <p>Default alert rules are configured automatically</p>
          <p className="text-sm mt-1">
            Custom rules can be added via the database
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alertRules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">
                  {rule.rule_name}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{rule.rule_type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      rule.severity === "critical" || rule.severity === "high"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {rule.severity}
                  </Badge>
                </TableCell>
                <TableCell>
                  {rule.is_enabled ? (
                    <Badge variant="default" className="bg-green-500">
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</TabsContent>
  );
}