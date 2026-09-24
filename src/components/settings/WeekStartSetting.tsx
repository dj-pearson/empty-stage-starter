import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useWeekStartsOnSetting } from "@/hooks/useWeekStartsOn";
import { parseWeekStartsOn } from "@/lib/weekStartPref";
import "@/i18n/appLocale";

/**
 * Item 3: which day the planner's week begins on. Saved per user; the planner,
 * the grocery week and templates all follow it.
 */
export function WeekStartSetting() {
  const { t } = useTranslation();
  const { weekStartsOn, setWeekStartsOn } = useWeekStartsOnSetting();
  const [saving, setSaving] = useState(false);

  const onChange = async (raw: string) => {
    const next = parseWeekStartsOn(raw);
    if (next === null || next === weekStartsOn) return;
    setSaving(true);
    try {
      const { error } = await setWeekStartsOn(next);
      if (error) {
        toast.error(
          t("planner.weekStart.saveFailed", {
            defaultValue: "Couldn't save that to your account. It applies on this device for now.",
          }),
        );
      } else {
        toast.success(
          next === 1
            ? t("planner.weekStart.savedMonday", { defaultValue: "Weeks now start on Monday" })
            : t("planner.weekStart.savedSunday", { defaultValue: "Weeks now start on Sunday" }),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
          {t("planner.weekStart.title", { defaultValue: "Planner week" })}
        </CardTitle>
        <CardDescription>
          {t("planner.weekStart.description", {
            defaultValue:
              "The day your meal plan and grocery week begin. Planned meals stay on their dates; only the seven-day view moves.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={String(weekStartsOn)}
          onValueChange={(v) => void onChange(v)}
          disabled={saving}
          aria-label={t("planner.weekStart.label", { defaultValue: "Week starts on" })}
          className="flex flex-col gap-3 sm:flex-row sm:gap-6"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="1" id="week-starts-monday" />
            <Label htmlFor="week-starts-monday" className="min-h-11 flex items-center">
              {t("planner.weekStart.monday", { defaultValue: "Monday" })}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="0" id="week-starts-sunday" />
            <Label htmlFor="week-starts-sunday" className="min-h-11 flex items-center">
              {t("planner.weekStart.sunday", { defaultValue: "Sunday" })}
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
