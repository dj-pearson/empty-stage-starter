import { useTranslation } from "react-i18next";
import { ShoppingCart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAutoRestockPref } from "@/hooks/useAutoRestockPref";
import { PrefScopeBadge } from "@/components/settings/PrefScopeBadge";
import "@/i18n/appLocale";

const LEAD_DAY_OPTIONS = [1, 2, 3, 5, 7] as const;

/**
 * US-299: add pantry items forecast to run out to the grocery list. Kept in
 * this browser (useAutoRestockPref) until the household_preferences column is
 * typed, and labelled so: a parent should not expect it on their phone.
 */
export function GroceryAutomationCard() {
  const { t } = useTranslation();
  const { enabled, leadDays, setEnabled, setLeadDays } = useAutoRestockPref();

  const leadLabel = (days: number) =>
    days === 7
      ? t("settings.prefs.automation.leadWeek", { defaultValue: "1 week" })
      : t("settings.prefs.automation.leadDays", { defaultValue: "{{count}} days", count: days });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {t("settings.prefs.automation.title", { defaultValue: "Grocery automation" })}
          </CardTitle>
          <PrefScopeBadge scope="device" />
        </div>
        <CardDescription>
          {t("settings.prefs.automation.description", {
            defaultValue: "Let the pantry forecast keep your grocery list topped up.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="auto-restock" className="text-sm font-medium">
              {t("settings.prefs.automation.autoRestock.label", { defaultValue: "Auto-add predicted run-outs" })}
            </Label>
            <p id="auto-restock-help" className="text-sm text-muted-foreground">
              {t("settings.prefs.automation.autoRestock.help", {
                defaultValue: "Items forecast to run out soon go on your grocery list by themselves.",
              })}
            </p>
          </div>
          <Switch
            id="auto-restock"
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-describedby="auto-restock-help"
          />
        </div>
        {enabled && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="auto-restock-lead" className="text-sm">
              {t("settings.prefs.automation.leadLabel", { defaultValue: "Add when due within" })}
            </Label>
            <Select value={String(leadDays)} onValueChange={(v) => setLeadDays(Number(v))}>
              <SelectTrigger id="auto-restock-lead" className="min-h-11 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_DAY_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)} className="min-h-11">
                    {leadLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
