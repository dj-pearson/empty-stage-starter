import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type FeatureType =
  | "children"
  | "pantry_foods"
  | "ai_coach"
  | "food_tracker"
  | "food_chaining"
  | "meal_builder"
  | "nutrition_tracking";

export interface FeatureLimitResult {
  allowed: boolean;
  limit?: number | null;
  current?: number;
  message?: string;
}

/**
 * Server-side limit check via the `check_feature_limit` RPC. Returns `{ allowed: true }`
 * if the user is unauthenticated or the RPC fails — UI gating must not block users when
 * we can't verify their plan.
 */
export async function checkFeatureLimit(
  featureType: FeatureType,
  currentCount = 1,
): Promise<FeatureLimitResult> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { allowed: true };

    const { data, error } = await supabase.rpc("check_feature_limit", {
      p_user_id: user.id,
      p_feature_type: featureType,
      p_current_count: currentCount,
    });

    if (error) throw error;
    return data as unknown as FeatureLimitResult;
  } catch (error) {
    logger.error("checkFeatureLimit error:", error);
    return { allowed: true };
  }
}
