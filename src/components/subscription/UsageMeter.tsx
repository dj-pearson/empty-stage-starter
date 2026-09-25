import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usageState, type UsageKind, type UsageState } from "@/lib/usageState";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

interface UsageMeterProps {
  title: string;
  description?: string;
  current: number;
  limit: number | null;
  /** 'count' for standing totals, 'quota' for allowances that reset. */
  kind?: UsageKind;
  /** Already formatted, e.g. "Resets at 7:00 PM". */
  resetLabel?: string;
  icon?: ReactNode;
  className?: string;
  /** Where "Upgrade" goes. Without it no upgrade button is shown. */
  onUpgrade?: () => void;
}

const INDICATOR: Record<UsageState, string> = {
  unlimited: "[&>div]:bg-primary",
  not_included: "[&>div]:bg-muted-foreground",
  ok: "[&>div]:bg-primary",
  near: "[&>div]:bg-warning",
  full: "[&>div]:bg-warning",
  over: "[&>div]:bg-destructive",
};

export function UsageMeter({
  title,
  description,
  current,
  limit,
  kind = "count",
  resetLabel,
  icon,
  className,
  onUpgrade,
}: UsageMeterProps) {
  const { t } = useTranslation();
  const state = usageState(current, limit, kind);
  // A full count limit is not a problem, only a fact; a spent quota is.
  const indicator = state === "full" && kind === "count" ? "[&>div]:bg-primary" : INDICATOR[state];

  const badge = (() => {
    switch (state) {
      case "unlimited":
        return <Badge variant="outline">{t("billing.meter.unlimited", { defaultValue: "Unlimited" })}</Badge>;
      case "not_included":
        return <Badge variant="secondary">{t("billing.meter.notIncluded", { defaultValue: "Not in your plan" })}</Badge>;
      case "over":
        return (
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-foreground">
            {t("billing.meter.over", { defaultValue: "Over your limit" })}
          </Badge>
        );
      case "full":
        return (
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-foreground">
            {t("billing.meter.full", { defaultValue: "All used" })}
          </Badge>
        );
      case "near":
        return (
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-foreground">
            {t("billing.meter.near", { defaultValue: "Getting close" })}
          </Badge>
        );
      default:
        return null;
    }
  })();

  const ofText =
    limit === null
      ? t("billing.meter.ofUnlimited", { defaultValue: "{{current}} of Unlimited", current })
      : t("billing.meter.of", { defaultValue: "{{current}} of {{limit}}", current, limit });

  const constrained = state === "near" || state === "full" || state === "over";

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="text-muted-foreground" aria-hidden="true">
                {icon}
              </span>
            )}
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              {description && <CardDescription className="mt-1 text-sm">{description}</CardDescription>}
            </div>
          </div>
          {badge}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm tabular-nums">
          {state === "not_included" ? t("billing.meter.notIncluded", { defaultValue: "Not in your plan" }) : ofText}
        </p>

        {limit !== null && limit > 0 && (
          <div className="space-y-2">
            <Progress
              value={Math.min(100, (current / limit) * 100)}
              className={cn("h-2 motion-reduce:[&>div]:transition-none", indicator)}
              aria-label={title}
              aria-valuetext={ofText}
            />
            {resetLabel && <p className="text-xs text-muted-foreground">{resetLabel}</p>}
          </div>
        )}

        {constrained && onUpgrade && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 p-3">
            <p className="min-w-0 flex-1 text-sm font-medium">
              {state === "near"
                ? t("billing.meter.approaching", { defaultValue: "Approaching your limit" })
                : t("billing.meter.reached", { defaultValue: "You've reached your limit" })}
            </p>
            <Button size="sm" variant="outline" onClick={onUpgrade} className="shrink-0">
              <TrendingUp className="mr-1 h-3 w-3" aria-hidden="true" />
              <span>{t("billing.meter.upgrade", { defaultValue: "Upgrade" })}</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
