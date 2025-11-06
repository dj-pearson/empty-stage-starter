import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface AIUsageLog {
  id: string;
  user_id: string;
  endpoint: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cost_cents: number;
  completion_cost_cents: number;
  total_cost_cents: number;
  request_duration_ms?: number;
  status: string;
  error_message?: string;
  created_at: string;
}

export interface BudgetCheck {
  within_budget: boolean;
  current_spend_cents: number;
  budget_limit_cents: number;
  percentage_used: number;
  alert_level: string;
}

export interface CostSummary {
  date: string;
  total_requests: number;
  unique_users: number;
  total_tokens: number;
  total_cost_cents: number;
  total_cost_dollars: number;
  avg_cost_per_request_cents: number;
  avg_duration_ms: number;
  error_count: number;
}

/**
 * Log AI API usage with automatic cost calculation
 * Call this from Edge Functions after AI API calls
 */
export async function logAIUsage(params: {
  userId: string;
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  requestDurationMs?: number;
  status?: string;
  errorMessage?: string;
  requestMetadata?: any;
  responseMetadata?: any;
}): Promise<string | null> {
  try {
const { data, error } = await (supabase as any).rpc("log_ai_usage", {
      p_user_id: params.userId,
      p_endpoint: params.endpoint,
      p_model: params.model,
      p_prompt_tokens: params.promptTokens,
      p_completion_tokens: params.completionTokens,
      p_request_duration_ms: params.requestDurationMs,
      p_status: params.status || "success",
      p_error_message: params.errorMessage,
      p_request_metadata: params.requestMetadata || {},
      p_response_metadata: params.responseMetadata || {},
    });

    if (error) {
      logger.error("Failed to log AI usage:", error);
      return null;
    }

    return data as string;
  } catch (error) {
    logger.error("Failed to log AI usage:", error);
    return null;
  }
}

/**
 * Check user's AI budget status
 */
export async function checkAIBudget(
  budgetType: "daily" | "weekly" | "monthly" = "daily"
): Promise<BudgetCheck | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

const { data, error } = await (supabase as any).rpc("check_ai_budget", {
      p_user_id: user.id,
      p_budget_type: budgetType,
    });

    if (error) {
      logger.error("Failed to check AI budget:", error);
      return null;
    }

    if (!data || data.length === 0) return null;

    return data[0] as BudgetCheck;
  } catch (error) {
    logger.error("Failed to check AI budget:", error);
    return null;
  }
}

/**
 * Get AI usage logs for current user
 */
export async function getAIUsageLogs(limit: number = 50): Promise<AIUsageLog[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

const { data, error } = await (supabase as any)
      .from("ai_usage_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Failed to fetch AI usage logs:", error);
      return [];
    }

    return data as AIUsageLog[];
  } catch (error) {
    logger.error("Failed to fetch AI usage logs:", error);
    return [];
  }
}

/**
 * Get daily cost summary
 */
export async function getDailyCostSummary(days: number = 30): Promise<CostSummary[]> {
  try {
const { data, error } = await (supabase as any)
      .from("ai_cost_daily_summary")
      .select("*")
      .order("date", { ascending: false })
      .limit(days);

    if (error) {
      logger.error("Failed to fetch daily cost summary:", error);
      return [];
    }

    return data as CostSummary[];
  } catch (error) {
    logger.error("Failed to fetch daily cost summary:", error);
    return [];
  }
}

/**
 * Get cost breakdown by endpoint
 */
export async function getCostByEndpoint(): Promise<
  Array<{
    endpoint: string;
    total_requests: number;
    unique_users: number;
    total_tokens: number;
    total_cost_cents: number;
    total_cost_dollars: number;
    avg_cost_per_request_cents: number;
    avg_tokens_per_request: number;
    avg_duration_ms: number;
  }>
> {
  try {
const { data, error } = await (supabase as any)
      .from("ai_cost_by_endpoint")
      .select("*")
      .order("total_cost_cents", { ascending: false });

    if (error) {
      logger.error("Failed to fetch cost by endpoint:", error);
      return [];
    }

    return data as any[];
  } catch (error) {
    logger.error("Failed to fetch cost by endpoint:", error);
    return [];
  }
}

/**
 * Get cost breakdown by model
 */
export async function getCostByModel(): Promise<
  Array<{
    model: string;
    total_requests: number;
    unique_users: number;
    total_tokens: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_cost_cents: number;
    total_cost_dollars: number;
    avg_cost_per_request_cents: number;
    avg_duration_ms: number;
  }>
> {
  try {
const { data, error } = await (supabase as any)
      .from("ai_cost_by_model")
      .select("*")
      .order("total_cost_cents", { ascending: false });

    if (error) {
      logger.error("Failed to fetch cost by model:", error);
      return [];
    }

    return data as any[];
  } catch (error) {
    logger.error("Failed to fetch cost by model:", error);
    return [];
  }
}

/**
 * Get top users by AI cost (admin only)
 */
export async function getCostByUser(limit: number = 20): Promise<
  Array<{
    user_id: string;
    full_name: string;
    total_requests: number;
    total_tokens: number;
    total_cost_cents: number;
    total_cost_dollars: number;
    current_month_cost_cents: number;
    monthly_budget_cents: number;
    last_request_at: string;
  }>
> {
  try {
const { data, error } = await (supabase as any)
      .from("ai_cost_by_user")
      .select("*")
      .order("total_cost_cents", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Failed to fetch cost by user:", error);
      return [];
    }

    return data as any[];
  } catch (error) {
    logger.error("Failed to fetch cost by user:", error);
    return [];
  }
}

/**
 * Show budget warning if needed
 */
export async function showBudgetWarning(budgetCheck: BudgetCheck) {
  if (budgetCheck.alert_level === "critical") {
    toast.error("AI Budget Critical", {
      description: `You've used ${budgetCheck.percentage_used.toFixed(1)}% of your daily AI budget. Consider upgrading your plan.`,
      duration: 10000,
      action: {
        label: "Upgrade",
        onClick: () => (window.location.href = "/pricing"),
      },
    });
  } else if (budgetCheck.alert_level === "warning") {
    toast.warning("AI Budget Warning", {
      description: `You've used ${budgetCheck.percentage_used.toFixed(1)}% of your daily AI budget.`,
      duration: 5000,
    });
  }
}

/**
 * Format cost in cents to dollars
 */
export function formatCost(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 0.01) {
    return `< $0.01`;
  }
  return `$${dollars.toFixed(2)}`;
}

/**
 * Format tokens with K/M suffixes
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Get alert level color
 */
export function getAlertLevelColor(alertLevel: string): {
  text: string;
  bg: string;
} {
  switch (alertLevel) {
    case "critical":
      return { text: "text-red-700", bg: "bg-red-100" };
    case "warning":
      return { text: "text-yellow-700", bg: "bg-yellow-100" };
    case "ok":
      return { text: "text-green-700", bg: "bg-green-100" };
    default:
      return { text: "text-gray-700", bg: "bg-gray-100" };
  }
}

/**
 * Calculate cost efficiency (tokens per cent)
 */
export function calculateEfficiency(tokens: number, costCents: number): number {
  if (costCents === 0) return 0;
  return Math.round(tokens / costCents);
}
