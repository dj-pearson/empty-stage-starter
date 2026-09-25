import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarDays, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useWeekStartsOnSetting } from "@/hooks/useWeekStartsOn";
import { parseWeekStartsOn, type WeekStartsOn } from "@/lib/weekStartPref";
import { PrefScopeBadge } from "@/components/settings/PrefScopeBadge";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

interface WeekStartSettingProps {
  /**
   * One line with a Mon/Sun choice and no card, for the Settings hub's Quick
   * row. The full card is the Planner section's.
   */
  compact?: boolean;
}

/**
 * Item 3: which day the planner's week begins on. Saved per user; the planner,
 * the grocery week and templates all follow it.
 *
 * The change applies on this device at once. When the account save fails the
 * choice still holds here, and a line under the control says so and offers a
 * retry until a save gets through, rather than a toast that is gone in four
 * seconds while the other devices keep the old week.
 */
export function WeekStartSetting({ compact = false }: WeekStartSettingProps) {
  const { t } = useTranslation();
  const uid = useId();
  const { weekStartsOn, setWeekStartsOn, signedIn } = useWeekStartsOnSetting();
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const savedMessage = (day: WeekStartsOn) =>
    day === 1
      ? t("planner.weekStart.savedMonday", { defaultValue: "Weeks now start on Monday" })
      : t("planner.weekStart.savedSunday", { defaultValue: "Weeks now start on Sunday" });

  /** Save `next`; on success, offer to put `previous` back unless this is an undo. */
  const save = async (next: WeekStartsOn, previous: WeekStartsOn | null) => {
    setSaving(true);
    try {
      const { error } = await setWeekStartsOn(next);
      if (error) {
        setSyncError(error);
        toast.error(
          t("planner.weekStart.saveFailed", {
            defaultValue: "Couldn't save that to your account. It applies on this device for now.",
          }),
        );
        return;
      }
      setSyncError(null);
      if (previous === null) {
        toast.success(savedMessage(next));
      } else {
        toast.success(savedMessage(next), {
          action: {
            label: t("settings.prefs.planner.undo", { defaultValue: "Undo" }),
            onClick: () => void save(previous, null),
          },
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const onChange = (raw: string) => {
    const next = parseWeekStartsOn(raw);
    if (next === null || next === weekStartsOn) return;
    void save(next, weekStartsOn);
  };

  const retry = () => void save(weekStartsOn, null);

  const mondayId = compact ? `${uid}-monday` : "week-starts-monday";
  const sundayId = compact ? `${uid}-sunday` : "week-starts-sunday";
  const labelId = `${uid}-label`;

  const radios = (
    <RadioGroup
      value={String(weekStartsOn)}
      onValueChange={onChange}
      disabled={saving}
      aria-labelledby={compact ? labelId : undefined}
      aria-label={compact ? undefined : t("planner.weekStart.label", { defaultValue: "Week starts on" })}
      className={cn(compact ? "flex gap-4" : "flex flex-col gap-3 sm:flex-row sm:gap-6")}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value="1" id={mondayId} />
        <Label htmlFor={mondayId} className="flex min-h-11 items-center">
          {t("planner.weekStart.monday", { defaultValue: "Monday" })}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="0" id={sundayId} />
        <Label htmlFor={sundayId} className="flex min-h-11 items-center">
          {t("planner.weekStart.sunday", { defaultValue: "Sunday" })}
        </Label>
      </div>
    </RadioGroup>
  );

  const syncLine =
    syncError !== null && signedIn ? (
      <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <span>
          {t("settings.prefs.planner.deviceOnly", { defaultValue: "Saved on this device only." })}
        </span>
        <Button variant="link" className="h-11 px-0" onClick={retry} disabled={saving}>
          <RotateCw className="mr-1 h-4 w-4" aria-hidden="true" />
          {t("settings.prefs.planner.retry", { defaultValue: "Retry" })}
        </Button>
      </p>
    ) : null;

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <span id={labelId} className="text-sm font-medium">
            {t("planner.weekStart.label", { defaultValue: "Week starts on" })}
          </span>
          {radios}
        </div>
        {syncLine}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            {t("planner.weekStart.title", { defaultValue: "Planner week" })}
          </CardTitle>
          {signedIn && <PrefScopeBadge scope="account" />}
        </div>
        <CardDescription>
          {t("planner.weekStart.description", {
            defaultValue:
              "The day your meal plan and grocery week begin. Planned meals stay on their dates; only the seven-day view moves.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {radios}
        {syncLine}
      </CardContent>
    </Card>
  );
}
