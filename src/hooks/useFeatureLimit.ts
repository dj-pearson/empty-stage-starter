import { useState } from "react";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import type { FeatureLimitResult, FeatureType } from "@/lib/featureLimits";

export function useFeatureLimit() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const checkFeatureLimit = async (
    featureType: FeatureType,
    currentCount?: number
  ): Promise<FeatureLimitResult> => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return { allowed: false, message: "Please sign in to continue" };
      }

      const { data, error } = await supabase.rpc("check_feature_limit", {
        p_user_id: user.id,
        p_feature_type: featureType,
        p_current_count: currentCount || 1,
      });

      if (error) throw error;

      const result = data as unknown as FeatureLimitResult;

      if (!result.allowed && result.message) {
        toast.error(result.message, {
          action: {
            label: "Upgrade",
            onClick: () => navigate("/pricing"),
          },
          duration: 5000,
        });
      }

      return result;
    } catch (error: unknown) {
      logger.error("Error checking feature limit:", error);
      return {
        allowed: true,
        message: "Unable to verify limit, proceeding with action",
      };
    } finally {
      setLoading(false);
    }
  };

  // ai_coach is excluded on purpose: the ai-coach edge function will meter a
  // question server-side, after it has actually answered (not wired yet). A
  // client-side bump could double-count or be skipped by a modified client.
  const incrementUsage = async (featureType: Exclude<FeatureType, "ai_coach">): Promise<void> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.rpc("increment_usage", {
        p_user_id: user.id,
        p_feature_type: featureType,
      });

      if (error) throw error;
    } catch (error: unknown) {
      logger.error("Error incrementing usage:", error);
    }
  };

  return {
    checkFeatureLimit,
    incrementUsage,
    loading,
  };
}
