import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmailPreferences } from "@/components/EmailPreferences";
import { PrefScopeBadge } from "@/components/settings/PrefScopeBadge";
import { useVarietyNudgePref } from "@/hooks/useVarietyNudgePref";
import "@/i18n/appLocale";

/**
 * Settings > Notifications: email (saved to the account) and in-app
 * suggestions (this device). Content only; the hub supplies the section and
 * its h2. Grocery automation lives under Planner, where the hub's summary and
 * the ?focus=auto-restock deep link put it.
 */
export function NotificationsSection() {
  const { t } = useTranslation();
  const { enabled: nudges, setEnabled: setNudges } = useVarietyNudgePref();

  return (
    <div className="space-y-6">
      <EmailPreferences />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              {t("settings.prefs.suggestions.title", { defaultValue: "In-app suggestions" })}
            </CardTitle>
            <PrefScopeBadge scope="device" />
          </div>
          <CardDescription>
            {t("settings.prefs.suggestions.description", {
              defaultValue: "Gentle prompts inside EatPal. They never send email or push alerts.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="variety-nudges" className="text-sm font-medium">
                {t("settings.prefs.suggestions.variety.label", { defaultValue: "Variety nudges" })}
              </Label>
              <p id="variety-nudges-help" className="text-sm text-muted-foreground">
                {t("settings.prefs.suggestions.variety.help", {
                  defaultValue: "Point out when a meal keeps repeating and suggest a small twist.",
                })}
              </p>
            </div>
            <Switch
              id="variety-nudges"
              checked={nudges}
              onCheckedChange={setNudges}
              aria-describedby="variety-nudges-help"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
