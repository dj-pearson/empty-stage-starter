// @ts-nocheck - Admin tables not yet in generated types
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface AlertRule {
  id: string;
  alert_type: string;
  threshold: number;
  notification_channel: string;
  is_active: boolean;
  created_at: string;
}

const ALERT_TYPES = [
  { value: "error_rate_high", label: "High Error Rate" },
  { value: "response_time_slow", label: "Slow Response Time" },
  { value: "disk_usage_high", label: "High Disk Usage" },
  { value: "subscription_churn_spike", label: "Subscription Churn Spike" },
];

interface Alert {
  id: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  alert_data: Record<string, any>;
  is_read: boolean;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const severityIcons = {
  low: Info,
  medium: AlertCircle,
  high: AlertTriangle,
  critical: XCircle,
};

const severityColors = {
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20 animate-pulse",
};

export function AlertManager() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [newRule, setNewRule] = useState({
    alert_type: "",
    threshold: 0,
    notification_channel: "in_app",
  });

  useEffect(() => {
    fetchAlerts();

    // Subscribe to new alerts
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
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      // @ts-ignore - Table exists but types not yet regenerated
      const { data, error } = await supabase
        .from("admin_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setAlerts((data as any) || []);
    } catch (error: unknown) {
      toast({
        title: "Error loading alerts",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAlertRules = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_alert_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) setAlertRules(data as any);
    } catch {
      // Table may not exist yet
    }
  };

  useEffect(() => {
    fetchAlertRules();
  }, []);

  const createAlertRule = async () => {
    if (!newRule.alert_type) return;
    try {
      const { error } = await supabase.from("admin_alert_rules").insert([{
        alert_type: newRule.alert_type,
        threshold: newRule.threshold,
        notification_channel: newRule.notification_channel,
        is_active: true,
      }]);
      if (error) throw error;
      toast({ title: "Alert rule created" });
      setShowCreateRule(false);
      setNewRule({ alert_type: "", threshold: 0, notification_channel: "in_app" });
      fetchAlertRules();
    } catch (error: unknown) {
      toast({ title: "Error creating rule", description: error.message, variant: "destructive" });
    }
  };

  const toggleAlertRule = async (ruleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("admin_alert_rules")
        .update({ is_active: !isActive })
        .eq("id", ruleId);
      if (error) throw error;
      setAlertRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_active: !isActive } : r));
    } catch {
      // silent
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
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      const { error } = await supabase
        .from("admin_alerts")
        .update({
          is_resolved: true,
          is_read: true,
          resolved_by: profile?.id,
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
                resolved_by: profile?.id,
                resolved_at: new Date().toISOString(),
              }
            : alert
        )
      );

      toast({
        title: "Alert resolved",
        description: "The alert has been marked as resolved",
      });

      setSelectedAlert(null);
    } catch (error: unknown) {
      toast({
        title: "Error resolving alert",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredAlerts = alerts.filter((alert) => (showResolved ? true : !alert.is_resolved));

  const unreadCount = alerts.filter((a) => !a.is_read).length;
  const unresolvedCount = alerts.filter((a) => !a.is_resolved).length;
  const criticalCount = alerts.filter((a) => a.severity === "critical" && !a.is_resolved).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-2xl font-bold">Alerts</h2>
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
            {showResolved ? <BellOff className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
            {showResolved ? "Hide Resolved" : "Show All"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAlerts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

      {/* Alert Rules */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <h3 className="font-semibold">Alert Rules</h3>
          </div>
          <Button size="sm" onClick={() => setShowCreateRule(!showCreateRule)}>
            <Plus className="h-4 w-4 mr-1" />
            Create Rule
          </Button>
        </div>

        {showCreateRule && (
          <div className="mb-4 p-4 border rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Alert Type</Label>
                <Select value={newRule.alert_type} onValueChange={(v) => setNewRule({...newRule, alert_type: v})}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {ALERT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Threshold</Label>
                <Input type="number" value={newRule.threshold} onChange={(e) => setNewRule({...newRule, threshold: Number(e.target.value)})} />
              </div>
              <div>
                <Label>Channel</Label>
                <Select value={newRule.notification_channel} onValueChange={(v) => setNewRule({...newRule, notification_channel: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">In-App</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={createAlertRule}>Save Rule</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreateRule(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {alertRules.length > 0 ? (
          <div className="space-y-2">
            {alertRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <span className="font-medium capitalize">{rule.alert_type.replace(/_/g, " ")}</span>
                  <span className="text-sm text-muted-foreground ml-2">Threshold: {rule.threshold}</span>
                  <Badge variant="outline" className="ml-2 text-xs">{rule.notification_channel}</Badge>
                </div>
                <Switch checked={rule.is_active} onCheckedChange={() => toggleAlertRule(rule.id, rule.is_active)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No alert rules configured</p>
        )}
      </Card>

      {/* Alerts List */}
      <Card className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
            <p>No alerts to display</p>
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
                >
                  <div className={`p-2 rounded-lg border ${severityColors[alert.severity]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
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
                    <p className="text-sm text-muted-foreground line-clamp-2">{alert.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</span>
                      <span className="capitalize">{alert.alert_type.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
                      <div className={`p-2 rounded-lg border ${severityColors[selectedAlert.severity]}`}>
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
                      {new Date(selectedAlert.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <span className="ml-2 font-medium">
                      {selectedAlert.is_resolved ? "Resolved" : "Active"}
                    </span>
                  </div>
                  {selectedAlert.is_resolved && selectedAlert.resolved_at && (
                    <div>
                      <span className="text-muted-foreground">Resolved:</span>
                      <span className="ml-2 font-medium">
                        {new Date(selectedAlert.resolved_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {Object.keys(selectedAlert.alert_data).length > 0 && (
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

