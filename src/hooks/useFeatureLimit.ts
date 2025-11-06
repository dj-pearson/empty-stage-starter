import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface FeatureLimitResult {
  allowed: boolean;
  limit?: number | null;
  current?: number;
  message?: string;
}

export function useFeatureLimit() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const checkFeatureLimit = async (
    featureType: string,
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
      console.error("Error checking feature limit:", error);
      return {
        allowed: true,
        message: "Unable to verify limit, proceeding with action",
      };
    } finally {
      setLoading(false);
    }
  };

  const incrementUsage = async (featureType: string): Promise<void> => {
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
      console.error("Error incrementing usage:", error);
    }
  };

  return {
    checkFeatureLimit,
    incrementUsage,
    loading,
  };
}
