import { useState } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  checkFeatureLimit as checkFeatureLimitRpc,
  type FeatureLimitResult,
  type FeatureType,
} from "@/lib/featureLimits";
import { useUpgradeNavigator } from "@/hooks/useUpgradeNavigator";

export function useFeatureLimit() {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const { goToUpgrade } = useUpgradeNavigator();

  /**
   * One limit check for the whole app: src/lib/featureLimits.checkFeatureLimit.
   * It fails open (the plan-limit triggers in the database are the real gate),
   * so this only adds the upgrade toast. "Upgrade" goes where the account's
   * plan is actually managed, never to a second checkout.
   */
  const checkFeatureLimit = async (
    featureType: FeatureType,
    currentCount?: number
  ): Promise<FeatureLimitResult> => {
    try {
      setLoading(true);
      const result = await checkFeatureLimitRpc(featureType, currentCount || 1);

      if (!result.allowed && result.message) {
        toast.error(result.message, {
          action: {
            label: t("billing.planData.upgrade.action", { defaultValue: "Upgrade" }),
            onClick: () => {
              void goToUpgrade();
            },
          },
          duration: 5000,
        });
      }

      return result;
    } catch (error: unknown) {
      logger.error("Error checking feature limit:", error);
      return { allowed: true };
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
