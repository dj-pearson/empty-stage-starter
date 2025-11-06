import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface PlatformHealth {
  total_users: number;
  new_users_7d: number;
  new_users_30d: number;
  active_users_7d: number;
  active_users_30d: number;
  total_kids: number;
  total_foods: number;
  total_recipes: number;
  total_plan_entries: number;
  total_food_attempts: number;
  successful_attempts_7d: number;
  achievements_7d: number;
  rate_limit_hits_1h: number;
  failed_backups_24h: number;
  failed_emails_24h: number;
  snapshot_at: string;
}

export interface UserEngagement {
  user_id: string;
  full_name: string;
  joined_at: string;
  kids_count: number;
  foods_count: number;
  recipes_count: number;
  total_plan_entries: number;
  total_food_attempts: number;
  last_plan_date?: string;
  last_attempt_date?: string;
  engagement_score: number;
  user_tier: string;
}

export interface DailyActivity {
  date: string;
  active_users: number;
  plan_entries_created: number;
  meals_logged: number;
  food_attempts_created: number;
  successful_attempts: number;
  foods_added: number;
  recipes_created: number;
  achievements_earned: number;
}

export interface AIUsage {
  endpoint: string;
  description: string;
  total_requests: number;
  unique_users: number;
  requests_24h: number;
  requests_7d: number;
  last_request_at: string;
  avg_requests_per_user: number;
  peak_requests_per_minute: number;
}

export interface AdminNotification {
  id: string;
  notification_type: string;
  severity: string;
  title: string;
  message: string;
  metadata: any;
  is_read: boolean;
  created_at: string;
}

/**
 * Check if current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (error) return false;

    return data?.role === "admin";
  } catch {
    return false;
  }
}

/**
 * Get platform health metrics
 */
export async function getPlatformHealth(): Promise<PlatformHealth | null> {
  try {
const { data, error } = await (supabase as any)
      .from("admin_platform_health")
      .select("*")
      .single();

    if (error) {
      logger.error("Failed to fetch platform health:", error);
      return null;
    }

    return data as PlatformHealth;
  } catch (error) {
    logger.error("Failed to fetch platform health:", error);
    return null;
  }
}

/**
 * Get user engagement metrics
 */
export async function getUserEngagement(
  limit: number = 50
): Promise<UserEngagement[]> {
  try {
const { data, error } = await (supabase as any)
      .from("admin_user_engagement")
      .select("*")
      .order("engagement_score", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Failed to fetch user engagement:", error);
      return [];
    }

    return data as UserEngagement[];
  } catch (error) {
    logger.error("Failed to fetch user engagement:", error);
    return [];
  }
}

/**
 * Get daily activity metrics
 */
export async function getDailyActivity(days: number = 30): Promise<DailyActivity[]> {
  try {
const { data, error } = await (supabase as any)
      .from("admin_daily_activity")
      .select("*")
      .order("date", { ascending: false })
      .limit(days);

    if (error) {
      logger.error("Failed to fetch daily activity:", error);
      return [];
    }

    return data as DailyActivity[];
  } catch (error) {
    logger.error("Failed to fetch daily activity:", error);
    return [];
  }
}

/**
 * Get AI usage metrics
 */
export async function getAIUsage(): Promise<AIUsage[]> {
  try {
const { data, error } = await (supabase as any)
      .from("admin_ai_usage")
      .select("*")
      .order("total_requests", { ascending: false });

    if (error) {
      logger.error("Failed to fetch AI usage:", error);
      return [];
    }

    return data as AIUsage[];
  } catch (error) {
    logger.error("Failed to fetch AI usage:", error);
    return [];
  }
}

/**
 * Get feature adoption metrics
 */
export async function getFeatureAdoption(): Promise<
  Array<{
    feature: string;
    users_using: number;
    adoption_rate_pct: number;
    total_usage_count: number;
    last_used: string;
  }>
> {
  try {
const { data, error } = await (supabase as any)
      .from("admin_feature_adoption")
      .select("*")
      .order("adoption_rate_pct", { ascending: false });

    if (error) {
      logger.error("Failed to fetch feature adoption:", error);
      return [];
    }

    return data as any[];
  } catch (error) {
    logger.error("Failed to fetch feature adoption:", error);
    return [];
  }
}

/**
 * Get admin notifications
 */
export async function getAdminNotifications(
  unreadOnly: boolean = false
): Promise<AdminNotification[]> {
  try {
let query = (supabase as any)
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch admin notifications:", error);
      return [];
    }

    return data as AdminNotification[];
  } catch (error) {
    logger.error("Failed to fetch admin notifications:", error);
    return [];
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<boolean> {
  try {
const { error } = await (supabase as any)
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) {
      logger.error("Failed to mark notification as read:", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Failed to mark notification as read:", error);
    return false;
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(): Promise<boolean> {
  try {
const { error } = await (supabase as any)
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("is_read", false);

    if (error) {
      logger.error("Failed to mark all notifications as read:", error);
      toast.error("Failed to mark notifications as read");
      return false;
    }

    toast.success("All notifications marked as read");
    return true;
  } catch (error) {
    logger.error("Failed to mark all notifications as read:", error);
    toast.error("Failed to mark notifications as read");
    return false;
  }
}

/**
 * Get user retention cohort data
 */
export async function getUserRetention(): Promise<any[]> {
  try {
const { data, error } = await (supabase as any)
      .from("admin_user_retention")
      .select("*")
      .order("cohort_month", { ascending: false });

    if (error) {
      logger.error("Failed to fetch user retention:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error("Failed to fetch user retention:", error);
    return [];
  }
}

/**
 * Get error tracking data
 */
export async function getErrorTracking(): Promise<any[]> {
  try {
const { data, error } = await (supabase as any)
      .from("admin_error_tracking")
      .select("*")
      .order("error_count", { ascending: false });

    if (error) {
      logger.error("Failed to fetch error tracking:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error("Failed to fetch error tracking:", error);
    return [];
  }
}

/**
 * Format severity with color
 */
export function formatSeverity(severity: string): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (severity) {
    case "critical":
      return { label: "Critical", color: "text-red-700", bgColor: "bg-red-100" };
    case "high":
      return { label: "High", color: "text-orange-700", bgColor: "bg-orange-100" };
    case "medium":
      return { label: "Medium", color: "text-yellow-700", bgColor: "bg-yellow-100" };
    case "low":
      return { label: "Low", color: "text-blue-700", bgColor: "bg-blue-100" };
    default:
      return { label: severity, color: "text-gray-700", bgColor: "bg-gray-100" };
  }
}

/**
 * Format user tier with badge
 */
export function formatUserTier(tier: string): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (tier) {
    case "power_user":
      return { label: "Power User", color: "text-purple-700", bgColor: "bg-purple-100" };
    case "active":
      return { label: "Active", color: "text-green-700", bgColor: "bg-green-100" };
    case "casual":
      return { label: "Casual", color: "text-blue-700", bgColor: "bg-blue-100" };
    case "inactive":
      return { label: "Inactive", color: "text-gray-700", bgColor: "bg-gray-100" };
    default:
      return { label: tier, color: "text-gray-700", bgColor: "bg-gray-100" };
  }
}

/**
 * Format large numbers
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

/**
 * Calculate growth percentage
 */
export function calculateGrowth(current: number, previous: number): {
  percent: number;
  isPositive: boolean;
} {
  if (previous === 0) {
    return { percent: current > 0 ? 100 : 0, isPositive: true };
  }
  const percent = ((current - previous) / previous) * 100;
  return {
    percent: Math.abs(Math.round(percent)),
    isPositive: percent >= 0,
  };
}
