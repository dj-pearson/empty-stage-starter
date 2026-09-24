import { useTranslation } from "react-i18next";
import { Cloud, Smartphone, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

/** Who a setting applies to, and where it is kept. */
export type PrefScope = "you" | "household" | "device" | "account";

const ICONS: Record<PrefScope, LucideIcon> = {
  you: UserRound,
  household: UsersRound,
  device: Smartphone,
  account: Cloud,
};

interface PrefScopeBadgeProps {
  scope: PrefScope;
  className?: string;
}

/**
 * A small label beside a setting: "Just you", "Whole household", "This device
 * only" or "Saved to your account". The icon is decorative; the text carries
 * the meaning, so a screen reader hears the same thing a sighted parent reads.
 */
export function PrefScopeBadge({ scope, className }: PrefScopeBadgeProps) {
  const { t } = useTranslation();
  const Icon = ICONS[scope];
  const label = (() => {
    switch (scope) {
      case "you":
        return t("settings.prefs.scope.you", { defaultValue: "Just you" });
      case "household":
        return t("settings.prefs.scope.household", { defaultValue: "Whole household" });
      case "device":
        return t("settings.prefs.scope.device", { defaultValue: "This device only" });
      case "account":
        return t("settings.prefs.scope.account", { defaultValue: "Saved to your account" });
    }
  })();
  return (
    <Badge variant="secondary" className={cn("gap-1 whitespace-nowrap font-medium", className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}
