import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import "@/i18n/appLocale";
import { supabase } from "@/integrations/supabase/client";
import { resolveCheckoutSource } from "@/lib/checkoutSource";
import { upgradeTargetFor, type UpgradeTarget } from "@/lib/planSource";

/**
 * Where an "Upgrade" button honestly goes for the signed-in account, resolved
 * from the server's effective plan when it is pressed. An App Store plan opens
 * Apple's subscriptions page, a comp shows support copy, a Stripe subscriber
 * goes to Billing (portal), and only a free account reaches /pricing.
 */
export async function resolveUpgradeTarget(): Promise<UpgradeTarget> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return { type: "pricing" };
  const source = await resolveCheckoutSource(userId);
  // 'unknown' still goes to /pricing: Pricing re-runs the same guard before it
  // would ever call create-checkout.
  return source === "unknown" ? { type: "pricing" } : upgradeTargetFor(source);
}

export function useUpgradeNavigator() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const followTarget = useCallback(
    (target: UpgradeTarget) => {
      switch (target.type) {
        case "appStore":
          window.open(target.href, "_blank", "noopener,noreferrer");
          return;
        case "support":
          toast.info(
            t("billing.planData.upgrade.compSupport", {
              defaultValue:
                "You have complimentary access from EatPal. Contact support@tryeatpal.com to change your plan.",
            }),
            { duration: 10000 }
          );
          return;
        case "portal":
          navigate("/dashboard/billing");
          return;
        case "pricing":
        default:
          navigate("/pricing");
      }
    },
    [navigate, t]
  );

  const goToUpgrade = useCallback(async () => {
    let target: UpgradeTarget = { type: "pricing" };
    try {
      target = await resolveUpgradeTarget();
    } catch {
      // Fall through to /pricing, which guards checkout itself.
    }
    followTarget(target);
  }, [followTarget]);

  return { goToUpgrade, followTarget };
}
