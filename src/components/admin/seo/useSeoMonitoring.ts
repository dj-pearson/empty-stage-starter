import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * US-553: the monitoring and alerts surface, lifted out of SEOManager.
 *
 * Owns the six pieces of monitoring state and the five handlers that move
 * them. Deliberately has NO mount effect: monitoring data is loaded lazily
 * when its tab is opened (SeoMonitoringTab drives that), so hoisting a load in
 * here would add four queries to every admin page view. The characterisation
 * tests in SEOManager.test.tsx pin that.
 */
export function useSeoMonitoring() {
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [alertRules, setAlertRules] = useState<Record<string, unknown>[]>([]);
  const [schedules, setSchedules] = useState<Record<string, unknown>[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, unknown> | null>(null);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [isLoadingMonitoring, setIsLoadingMonitoring] = useState(false);

  const loadMonitoringData = async () => {
    try {
      setIsLoadingMonitoring(true);
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      // Load active alerts
      const { data: alertsData } = await supabase
        .from("seo_alerts")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10);

      setAlerts(alertsData || []);
      setActiveAlertsCount(alertsData?.length || 0);

      // Load alert rules
      const { data: rulesData } = await supabase
        .from("seo_alert_rules")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setAlertRules(rulesData || []);

      // Load schedules
      const { data: schedulesData } = await supabase
        .from("seo_monitoring_schedules")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false});

      setSchedules(schedulesData || []);

      // Load notification preferences - create default if doesn't exist
      const { data: prefsData, error: prefsError } = await supabase
        .from("seo_notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (prefsError && prefsError.code === "PGRST116") {
        // No preferences found - create default
        const defaultPrefs = {
          user_id: user.id,
          email_enabled: true,
          email_address: user.email,
          immediate_alerts: true,
          daily_digest: true,
          notify_score_drops: true,
          notify_keyword_changes: true,
          notify_gsc_issues: true,
          notify_performance_issues: true,
        };

        const { data: newPrefs } = await supabase
          .from("seo_notification_preferences")
          .insert(defaultPrefs)
          .select()
          .single();

        setNotificationPrefs(newPrefs || defaultPrefs);

        // Also create default alert rule
        await supabase.from("seo_alert_rules").insert({
          user_id: user.id,
          rule_name: "SEO Score Drop Alert",
          rule_type: "score_drop",
          condition: { type: "score_drop", threshold: 10, timeframe_hours: 24 },
          severity: "high",
        });

        // Create default monitoring schedule
        await supabase.from("seo_monitoring_schedules").insert({
          user_id: user.id,
          schedule_name: "Daily SEO Audit",
          schedule_type: "audit",
          cron_expression: "0 3 * * *",
          config: { audit_type: "full" },
        });

        // Reload data to show newly created defaults
        setTimeout(() => loadMonitoringData(), 500);
      } else {
        setNotificationPrefs(prefsData || {
          email_enabled: true,
          immediate_alerts: true,
          daily_digest: true,
          notify_score_drops: true,
          notify_keyword_changes: true,
        });
      }
    } catch (error: unknown) {
      logger.error("Error loading monitoring data:", error);
    } finally {
      setIsLoadingMonitoring(false);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { error } = await supabase
        .from("seo_alerts")
        .update({
          status: "acknowledged",
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        })
        .eq("id", alertId);

      if (error) throw error;

      await loadMonitoringData();
      toast.success("Alert acknowledged");
    } catch (error: unknown) {
      logger.error("Error acknowledging alert:", error);
      toast.error("Failed to acknowledge alert");
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("seo_alerts")
        .update({ status: "dismissed" })
        .eq("id", alertId);

      if (error) throw error;

      await loadMonitoringData();
      toast.success("Alert dismissed");
    } catch (error: unknown) {
      logger.error("Error dismissing alert:", error);
      toast.error("Failed to dismiss alert");
    }
  };

  const toggleSchedule = async (scheduleId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from("seo_monitoring_schedules")
        .update({ is_enabled: enabled })
        .eq("id", scheduleId);

      if (error) throw error;

      await loadMonitoringData();
      toast.success(enabled ? "Schedule enabled" : "Schedule disabled");
    } catch (error: unknown) {
      logger.error("Error toggling schedule:", error);
      toast.error("Failed to update schedule");
    }
  };

  const saveNotificationPreferences = async (prefs: Record<string, unknown>) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { error } = await supabase
        .from("seo_notification_preferences")
        .upsert({
          user_id: user.id,
          ...prefs,
        });

      if (error) throw error;

      setNotificationPrefs(prefs);
      toast.success("Notification preferences saved");
    } catch (error: unknown) {
      logger.error("Error saving preferences:", error);
      toast.error("Failed to save preferences");
    }
  };

  return {
    alerts,
    alertRules,
    schedules,
    notificationPrefs,
    activeAlertsCount,
    isLoadingMonitoring,
    loadMonitoringData,
    acknowledgeAlert,
    dismissAlert,
    toggleSchedule,
    saveNotificationPreferences,
  };
}
