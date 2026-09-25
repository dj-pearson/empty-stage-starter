import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { resolveUpgradeTarget, useUpgradeNavigator } from "@/hooks/useUpgradeNavigator";
import type { UpgradeTarget } from "@/lib/planSource";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  message?: string;
}

export function UpgradeDialog({ open, onOpenChange, feature, message }: UpgradeDialogProps) {
  const { t } = useTranslation();
  const { followTarget } = useUpgradeNavigator();
  // Resolved when the dialog opens, so the button says where it goes. Until it
  // answers, /pricing is the fallback, and Pricing guards checkout itself.
  const [target, setTarget] = useState<UpgradeTarget>({ type: "pricing" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    resolveUpgradeTarget()
      .then((next) => {
        if (!cancelled) setTarget(next);
      })
      .catch(() => {
        if (!cancelled) setTarget({ type: "pricing" });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleUpgrade = () => {
    onOpenChange(false);
    followTarget(target);
  };

  const ctaLabel =
    target.type === "appStore"
      ? t("billing.planData.upgrade.ctaAppStore", { defaultValue: "Manage in App Store" })
      : target.type === "portal"
        ? t("billing.planData.upgrade.ctaPortal", { defaultValue: "Change plan in Billing" })
        : target.type === "support"
          ? t("billing.planData.upgrade.ctaSupport", { defaultValue: "Contact support" })
          : t("billing.planData.upgrade.ctaPricing", { defaultValue: "View Plans" });

  const sourceNote =
    target.type === "appStore"
      ? t("billing.planData.upgrade.noteAppStore", {
          defaultValue: "Your plan is billed through the App Store, so plan changes happen in your Apple ID subscriptions.",
        })
      : target.type === "support"
        ? t("billing.planData.upgrade.noteComp", {
            defaultValue: "You have complimentary access from EatPal. Our support team can change your plan.",
          })
        : target.type === "portal"
          ? t("billing.planData.upgrade.notePortal", {
              defaultValue: "You already have a subscription. Change it from Billing so you're never charged twice.",
            })
          : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Sparkles className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <DialogTitle className="text-xl">
              {t("billing.planData.upgrade.title", { defaultValue: "Upgrade Required" })}
            </DialogTitle>
          </div>
          <DialogDescription className="text-base">
            {message ||
              t("billing.planData.upgrade.notAvailable", {
                defaultValue: "{{feature}} is not available on your current plan.",
                feature,
              })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {sourceNote ? (
            <p className="rounded-lg bg-muted p-4 text-sm">{sourceNote}</p>
          ) : (
            <div className="rounded-lg bg-primary/5 p-4">
              <p className="text-sm font-medium mb-2">
                {t("billing.planData.upgrade.unlockBy", { defaultValue: "Unlock this feature by upgrading to:" })}
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-primary" aria-hidden="true" />
                  {t("billing.planData.upgrade.pro", { defaultValue: "Pro Plan - Starting at $14.99/month" })}
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-primary" aria-hidden="true" />
                  {t("billing.planData.upgrade.familyPlus", { defaultValue: "Family Plus - Starting at $24.99/month" })}
                </li>
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              {t("billing.planData.upgrade.later", { defaultValue: "Maybe Later" })}
            </Button>
            <Button onClick={handleUpgrade} className="flex-1">
              <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
              {ctaLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
