import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  XCircle,
  CheckCircle,
  Bell,
  BellOff,
  RefreshCw,
  Plus,
  Settings,
  Trash2,
  Clock,
  History,
  Mail,
  Smartphone,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// --- Types ---

interface AlertRule {
  id: string;
  alert_type: string;
  threshold: number;
  notification_channel: string;
  is_active: boolean;
  created_at: string;
}

interface Alert {
  id: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  alert_data: Record<string, unknown>;
  is_read: boolean;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Constants ---

const ALERT_TYPES = [
  {
    value: "error_rate_high",
    label: "High Error Rate",
    unit: "% errors",
    description: "Triggers when the application error rate exceeds the threshold percentage.",
    defaultThreshold: 5,
    placeholder: "e.g., 5 for 5%",
  },
  {
    value: "response_time_slow",
    label: "Slow Response Time",
    unit: "ms",
    description: "Triggers when average API response time exceeds the threshold in milliseconds.",
    defaultThreshold: 2000,
    placeholder: "e.g., 2000 for 2 seconds",
  },
  {
    value: "disk_usage_high",
    label: "High Disk Usage",
    unit: "% used",
    description: "Triggers when disk usage exceeds the threshold percentage.",
    defaultThreshold: 85,
    placeholder: "e.g., 85 for 85%",
  },
  {
    value: "subscription_churn_spike",
    label: "Subscription Churn Spike",
    unit: "% churn",
    description: "Triggers when subscription churn rate exceeds the threshold percentage.",
    defaultThreshold: 10,
    placeholder: "e.g., 10 for 10%",
  },
] as const;

const NOTIFICATION_CHANNELS = [
  { value: "in_app", label: "In-App", icon: Smartphone },
  { value: "email", label: "Email", icon: Mail },
] as const;

const severityIcons: Record<Alert["severity"], typeof Info> = {
  low: Info,
  medium: AlertCircle,
  high: AlertTriangle,
  critical: XCircle,
};

const severityColors: Record<Alert["severity"], string> = {
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20 animate-pulse",
};

// --- Helpers ---

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "An unexpected error occurred";
}

function getAlertTypeConfig(alertType: string) {
  return ALERT_TYPES.find((t) => t.value === alertType);
}

function formatThresholdDisplay(alertType: string, threshold: number): string {
  const config = getAlertTypeConfig(alertType);
  if (!config) return String(threshold);
  return `${threshold}${config.unit}`;
}

// --- Component ---

export function AlertManager() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("active");
  const [newRule, setNewRule] = useState({
    alert_type: "",
    threshold: 0,
    notification_channel: "in_app",
  });

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setAlerts((data as unknown as Alert[]) || []);
    } catch (error: unknown) {
      toast({
        title: "Error loading alerts",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAlertRules = useCallback(async () => {
    try {
      setRulesLoading(true);
      // @ts-ignore - admin_alert_rules table not yet in generated types
      const { data, error } = await supabase
        .from("admin_alert_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setAlertRules(data as unknown as AlertRule[]);
      }
    } catch {
      // Table may not exist yet - this is expected during initial setup
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    fetchAlertRules();

    // Subscribe to new alerts via real-time
    logger.debug('Subscribing to admin_alerts_changes');
    const channel = supabase
      .channel("admin_alerts_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_alerts",
        },
        (payload) => {
          const newAlert = payload.new as Alert;
          setAlerts((prev) => [newAlert, ...prev]);

          // Show toast for critical alerts
          if (newAlert.severity === "critical") {
            toast({
              title: newAlert.title,
              description: newAlert.message,
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    return () => {
      logger.debug('Unsubscribing from admin_alerts_changes');
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts, fetchAlertRules]);

  const createAlertRule = async () => {
    if (!newRule.alert_type) {
      toast({
        title: "Validation error",
        description: "Please select an alert type.",
        variant: "destructive",
      });
      return;
    }
    if (newRule.threshold <= 0) {
      toast({
        title: "Validation error",
        description: "Threshold must be a positive number.",
        variant: "destructive",
      });
      return;
    }

    try {
      // @ts-ignore - admin_alert_rules table not yet in generated types
      const { error } = await supabase.from("admin_alert_rules").insert([
        {
          alert_type: newRule.alert_type,
          threshold: newRule.threshold,
          notification_channel: newRule.notification_channel,
          is_active: true,
        },
      ]);
      if (error) throw error;
      toast({ title: "Alert rule created successfully" });
      setShowCreateRule(false);
      setNewRule({ alert_type: "", threshold: 0, notification_channel: "in_app" });
      fetchAlertRules();
    } catch (error: unknown) {
      toast({
        title: "Error creating rule",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const toggleAlertRule = async (ruleId: string, isActive: boolean) => {
    try {
      // @ts-ignore - admin_alert_rules table not yet in generated types
      const { error } = await supabase
        .from("admin_alert_rules")
        .update({ is_active: !isActive })
        .eq("id", ruleId);
      if (error) throw error;
      setAlertRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_active: !isActive } : r))
      );
      toast({
        title: `Alert rule ${!isActive ? "activated" : "deactivated"}`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error toggling rule",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const deleteAlertRule = async (ruleId: string) => {
    try {
      setDeletingRuleId(ruleId);
      // @ts-ignore - admin_alert_rules table not yet in generated types
      const { error } = await supabase
        .from("admin_alert_rules")
        .delete()
        .eq("id", ruleId);
      if (error) throw error;
      setAlertRules((prev) => prev.filter((r) => r.id !== ruleId));
      toast({ title: "Alert rule deleted" });
    } catch (error: unknown) {
      toast({
        title: "Error deleting rule",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setDeletingRuleId(null);
    }
  };

  const markAsRead = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("admin_alerts")
        .update({ is_read: true })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts((prev) =>
        prev.map((alert) => (alert.id === alertId ? { ...alert, is_read: true } : alert))
      );
    } catch (error: unknown) {
      toast({
        title: "Error marking alert as read",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const { error } = await supabase
        .from("admin_alerts")
        .update({
          is_resolved: true,
          is_read: true,
          resolved_by: userId,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts((prev) =>
        prev.map((alert) =>
          alert.id === alertId
            ? {
                ...alert,
                is_resolved: true,
                is_read: true,
                resolved_by: userId,
                resolved_at: new Date().toISOString(),
              }
            : alert
        )
      );

      toast({
        title: "Alert resolved",
        description: "The alert has been marked as resolved.",
      });

      setSelectedAlert(null);
    } catch (error: unknown) {
      toast({
        title: "Error resolving alert",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  // Set default threshold when alert type changes
  const handleAlertTypeChange = (value: string) => {
    const config = getAlertTypeConfig(value);
    setNewRule({
      ...newRule,
      alert_type: value,
      threshold: config?.defaultThreshold ?? 0,
    });
  };

  // --- Derived State ---

  const activeAlerts = alerts.filter((a) => !a.is_resolved);
  const resolvedAlerts = alerts.filter((a) => a.is_resolved);
  const filteredAlerts = showResolved ? alerts : activeAlerts;

  const unreadCount = alerts.filter((a) => !a.is_read).length;
  const unresolvedCount = activeAlerts.length;
  const criticalCount = activeAlerts.filter((a) => a.severity === "critical").length;
  const activeRulesCount = alertRules.filter((r) => r.is_active).length;

  const selectedAlertTypeConfig = getAlertTypeConfig(newRule.alert_type);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-2xl font-bold">Alert Notifications</h2>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={showResolved ? "default" : "outline"}
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? (
              <BellOff className="h-4 w-4 mr-2" />
            ) : (
              <Bell className="h-4 w-4 mr-2" />
            )}
            {showResolved ? "Hide Resolved" : "Show All"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAlerts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{unresolvedCount}</div>
          <div className="text-sm text-muted-foreground">Unresolved Alerts</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-500">{criticalCount}</div>
          <div className="text-sm text-muted-foreground">Critical Alerts</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-500">{unreadCount}</div>
          <div className="text-sm text-muted-foreground">Unread Alerts</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-500">{activeRulesCount}</div>
          <div className="text-sm text-muted-foreground">Active Rules</div>
        </Card>
      </div>

      {/* Tabs for Rules / Active Alerts / History */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active" className="flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            Active Alerts
            {unresolvedCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1 text-xs">
                {unresolvedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            Alert Rules
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="h-4 w-4" />
            Alert History
          </TabsTrigger>
        </TabsList>

        {/* Active Alerts Tab */}
        <TabsContent value="active" className="mt-4">
          <Card className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
                <p>No active alerts</p>
                <p className="text-sm">All systems running smoothly!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAlerts.map((alert) => {
                  const Icon = severityIcons[alert.severity];
                  return (
                    <div
                      key={alert.id}
                      className={`flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer ${
                        !alert.is_read ? "ring-2 ring-primary/20" : ""
                      }`}
                      onClick={() => {
                        setSelectedAlert(alert);
                        if (!alert.is_read) {
                          markAsRead(alert.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedAlert(alert);
                          if (!alert.is_read) {
                            markAsRead(alert.id);
                          }
                        }
                      }}
                      aria-label={`${alert.severity} alert: ${alert.title}`}
                    >
                      <div className={`p-2 rounded-lg border ${severityColors[alert.severity]}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold">{alert.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {alert.severity}
                          </Badge>
                          {!alert.is_read && (
                            <Badge variant="default" className="text-xs">
                              NEW
                            </Badge>
                          )}
                          {alert.is_resolved && (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {alert.message}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                          </span>
                          <span className="capitalize">
                            {alert.alert_type.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Alert Rules Tab */}
        <TabsContent value="rules" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <h3 className="font-semibold">Alert Rules</h3>
                <Badge variant="outline" className="text-xs">
                  {alertRules.length} total
                </Badge>
              </div>
              <Button size="sm" onClick={() => setShowCreateRule(!showCreateRule)}>
                <Plus className="h-4 w-4 mr-1" />
                Create Rule
              </Button>
            </div>

            {/* Create Rule Form */}
            {showCreateRule && (
              <div className="mb-4 p-4 border rounded-lg space-y-4 bg-muted/30">
                <h4 className="font-medium text-sm">New Alert Rule</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="alert-type-select">Alert Type</Label>
                    <Select
                      value={newRule.alert_type}
                      onValueChange={handleAlertTypeChange}
                    >
                      <SelectTrigger id="alert-type-select">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALERT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedAlertTypeConfig && (
                      <p className="text-xs text-muted-foreground">
                        {selectedAlertTypeConfig.description}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="threshold-input">
                      Threshold
                      {selectedAlertTypeConfig && (
                        <span className="text-muted-foreground ml-1">
                          ({selectedAlertTypeConfig.unit})
                        </span>
                      )}
                    </Label>
                    <Input
                      id="threshold-input"
                      type="number"
                      min={0}
                      value={newRule.threshold}
                      onChange={(e) =>
                        setNewRule({ ...newRule, threshold: Number(e.target.value) })
                      }
                      placeholder={selectedAlertTypeConfig?.placeholder ?? "Enter threshold"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channel-select">Notification Channel</Label>
                    <Select
                      value={newRule.notification_channel}
                      onValueChange={(v) =>
                        setNewRule({ ...newRule, notification_channel: v })
                      }
                    >
                      <SelectTrigger id="channel-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOTIFICATION_CHANNELS.map((ch) => (
                          <SelectItem key={ch.value} value={ch.value}>
                            <span className="flex items-center gap-2">
                              <ch.icon className="h-3 w-3" />
                              {ch.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={createAlertRule}>
                    Save Rule
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowCreateRule(false);
                      setNewRule({ alert_type: "", threshold: 0, notification_channel: "in_app" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Rules List */}
            {rulesLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : alertRules.length > 0 ? (
              <div className="space-y-2">
                {alertRules.map((rule) => {
                  const channelConfig = NOTIFICATION_CHANNELS.find(
                    (ch) => ch.value === rule.notification_channel
                  );
                  const ChannelIcon = channelConfig?.icon ?? Smartphone;

                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                        rule.is_active ? "bg-card" : "bg-muted/50 opacity-75"
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium capitalize">
                              {rule.alert_type.replace(/_/g, " ")}
                            </span>
                            <Badge
                              variant={rule.is_active ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {rule.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span>
                              Threshold: {formatThresholdDisplay(rule.alert_type, rule.threshold)}
                            </span>
                            <span className="flex items-center gap-1">
                              <ChannelIcon className="h-3 w-3" />
                              {channelConfig?.label ?? rule.notification_channel}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(rule.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() => toggleAlertRule(rule.id, rule.is_active)}
                          aria-label={`Toggle ${rule.alert_type.replace(/_/g, " ")} rule`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteAlertRule(rule.id)}
                          disabled={deletingRuleId === rule.id}
                          aria-label={`Delete ${rule.alert_type.replace(/_/g, " ")} rule`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Settings className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No alert rules configured</p>
                <p className="text-sm">Create a rule to start monitoring system metrics.</p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Alert History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4" />
                <h3 className="font-semibold">Alert History</h3>
                <Badge variant="outline" className="text-xs">
                  {alerts.length} total
                </Badge>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No alert history</p>
                <p className="text-sm">Alerts will appear here once triggered.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Resolved summary */}
                <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground border-b pb-3">
                  <span>{activeAlerts.length} active</span>
                  <span>{resolvedAlerts.length} resolved</span>
                </div>

                {alerts.map((alert) => {
                  const Icon = severityIcons[alert.severity];
                  return (
                    <div
                      key={alert.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-accent/50 ${
                        alert.is_resolved ? "opacity-70" : "bg-card"
                      }`}
                      onClick={() => {
                        setSelectedAlert(alert);
                        if (!alert.is_read) {
                          markAsRead(alert.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedAlert(alert);
                          if (!alert.is_read) {
                            markAsRead(alert.id);
                          }
                        }
                      }}
                      aria-label={`Alert history: ${alert.title}`}
                    >
                      <div className={`p-1.5 rounded-lg border ${severityColors[alert.severity]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{alert.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {alert.severity}
                          </Badge>
                          {alert.is_resolved ? (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Open
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {alert.message}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Created: {format(new Date(alert.created_at), "MMM d, yyyy HH:mm")}
                          </span>
                          {alert.is_resolved && alert.resolved_at && (
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              Resolved: {format(new Date(alert.resolved_at), "MMM d, yyyy HH:mm")}
                            </span>
                          )}
                          <span className="capitalize">
                            {alert.alert_type.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alert Detail Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              {selectedAlert && (
                <>
                  {(() => {
                    const Icon = severityIcons[selectedAlert.severity];
                    return (
                      <div
                        className={`p-2 rounded-lg border ${severityColors[selectedAlert.severity]}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                    );
                  })()}
                  <Badge variant="outline">{selectedAlert.severity}</Badge>
                </>
              )}
            </div>
            <DialogTitle>{selectedAlert?.title}</DialogTitle>
            <DialogDescription>{selectedAlert?.message}</DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Alert Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <span className="ml-2 font-medium capitalize">
                      {selectedAlert.alert_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <span className="ml-2 font-medium">
                      {format(new Date(selectedAlert.created_at), "MMM d, yyyy HH:mm:ss")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <span className="ml-2">
                      {selectedAlert.is_resolved ? (
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Resolved
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Active
                        </Badge>
                      )}
                    </span>
                  </div>
                  {selectedAlert.is_resolved && selectedAlert.resolved_at && (
                    <div>
                      <span className="text-muted-foreground">Resolved:</span>
                      <span className="ml-2 font-medium">
                        {format(new Date(selectedAlert.resolved_at), "MMM d, yyyy HH:mm:ss")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedAlert.alert_data &&
                Object.keys(selectedAlert.alert_data).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Additional Data</h4>
                    <pre className="p-3 bg-muted rounded text-xs overflow-auto max-h-48">
                      {JSON.stringify(selectedAlert.alert_data, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAlert(null)}>
              Close
            </Button>
            {selectedAlert && !selectedAlert.is_resolved && (
              <Button onClick={() => resolveAlert(selectedAlert.id)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark as Resolved
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
