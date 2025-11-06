import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface RateLimitResult {
  allowed: boolean;
  current_count: number;
  max_requests: number;
  reset_at: string;
  tier: string;
}

/**
 * Check rate limit before making an AI API call
 * @param endpoint - The endpoint name (e.g., 'ai-meal-plan')
 * @returns Rate limit check result
 */
export async function checkRateLimit(endpoint: string): Promise<RateLimitResult | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to use this feature");
      return null;
    }

    const { data, error } = await supabase.rpc('check_rate_limit_with_tier', {
      p_user_id: user.id,
      p_endpoint: endpoint
    });

    if (error) {
      logger.error('Rate limit check error:', error);
      // Allow request on error to avoid blocking users
      return {
        allowed: true,
        current_count: 0,
        max_requests: 100,
        reset_at: new Date(Date.now() + 3600000).toISOString(),
        tier: 'free'
      };
    }

    const result = data[0] as RateLimitResult;

    // Show warning if approaching limit
    if (result.allowed && result.current_count >= result.max_requests * 0.8) {
      const remaining = result.max_requests - result.current_count;
      toast.warning(`Approaching rate limit`, {
        description: `${remaining} requests remaining this hour`
      });
    }

    return result;
  } catch (error) {
    logger.error('Rate limit check failed:', error);
    return null;
  }
}

/**
 * Show rate limit exceeded message
 * @param result - Rate limit result
 */
export function showRateLimitError(result: RateLimitResult) {
  const resetDate = new Date(result.reset_at);
  const minutesUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / 60000);

  toast.error("Rate limit exceeded", {
    description: `You've reached your ${result.tier} tier limit of ${result.max_requests} requests per hour. Try again in ${minutesUntilReset} minutes or upgrade your plan.`,
    duration: 10000,
    action: result.tier === 'free' ? {
      label: "Upgrade",
      onClick: () => window.location.href = '/pricing'
    } : undefined
  });
}

/**
 * Wrapper for AI function calls with rate limiting
 * @param endpoint - The endpoint name
 * @param functionName - Supabase function name
 * @param body - Request body
 * @returns Function response or null if rate limited
 */
export async function callWithRateLimit<T = any>(
  endpoint: string,
  functionName: string,
  body: any
): Promise<T | null> {
  // Check rate limit first
  const rateLimitCheck = await checkRateLimit(endpoint);

  if (!rateLimitCheck) {
    return null;
  }

  if (!rateLimitCheck.allowed) {
    showRateLimitError(rateLimitCheck);
    return null;
  }

  try {
    // Make the actual function call
    const { data, error } = await supabase.functions.invoke(functionName, { body });

    if (error) {
      logger.error(`${functionName} error:`, error);
      toast.error("Request failed", {
        description: error.message || "Please try again"
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.error(`${functionName} failed:`, error);
    toast.error("Request failed", {
      description: "An unexpected error occurred"
    });
    return null;
  }
}

/**
 * Get rate limit status for display
 * @param endpoint - The endpoint name
 * @returns Formatted rate limit status
 */
export async function getRateLimitStatus(endpoint: string): Promise<{
  currentCount: number;
  maxRequests: number;
  percentage: number;
  resetIn: string;
  tier: string;
} | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data, error } = await supabase.rpc('check_rate_limit_with_tier', {
      p_user_id: user.id,
      p_endpoint: endpoint
    });

    if (error || !data || data.length === 0) return null;

    const result = data[0] as RateLimitResult;
    const resetDate = new Date(result.reset_at);
    const minutesUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / 60000);

    return {
      currentCount: result.current_count,
      maxRequests: result.max_requests,
      percentage: (result.current_count / result.max_requests) * 100,
      resetIn: minutesUntilReset > 60
        ? `${Math.ceil(minutesUntilReset / 60)} hours`
        : `${minutesUntilReset} minutes`,
      tier: result.tier
    };
  } catch (error) {
    logger.error('Failed to get rate limit status:', error);
    return null;
  }
}
