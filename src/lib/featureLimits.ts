import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type FeatureType =
  | "children"
  | "pantry_foods"
  | "ai_coach"
  | "food_tracker"
  | "food_chaining"
  | "meal_builder"
  | "nutrition_tracking"
  // No branch in check_feature_limit for these two: the RPC's ELSE returns
  // { allowed: true } and increment_usage counts nothing. They are listed so
  // ScanReceiptDialog and HideVeggiesDialog typecheck against the same union.
  | "receipt_scan"
  | "hidden_veggies_rewrite";

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
/**
 * Detect a rejection raised by the server-side plan-limit triggers
 * (enforce_plan_row_limit, migration 20260723123300). Those raise an exception
 * whose message begins with `plan_limit_exceeded`. The pre-insert
 * checkFeatureLimit above stays fail-open for UX (a flaky RPC shouldn't block a
 * legitimate user) because the DB trigger is now the authoritative gate; when it
 * fires, the insert's error handler uses this to show the upgrade prompt instead
 * of optimistically adding a row the server refused.
 */
export function isPlanLimitError(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === "string"
      ? error
      : ((error as { message?: string; details?: string }).message ??
         (error as { details?: string }).details ??
         "");
  return message.includes("plan_limit_exceeded");
}

export async function checkFeatureLimit(
  featureType: FeatureType,
  currentCount = 1,
): Promise<FeatureLimitResult> {
  try {
    // getSession() reads the local session with no network round trip.
    // check_feature_limit rejects any p_user_id other than auth.uid(), so the
    // server verifies the id rather than trusting it.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return { allowed: true };

    const { data, error } = await supabase.rpc("check_feature_limit", {
      p_user_id: userId,
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
