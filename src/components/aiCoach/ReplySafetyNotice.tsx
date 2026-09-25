import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { replyAllergenWarnings } from "@/lib/coachReply";
import { kidAllergyState } from "@/lib/kidAllergenChips";
import type { Kid } from "@/types";
import "@/i18n/appLocale";

export interface ReplySafetyNoticeProps {
  text: string;
  kid: Kid | null;
}

const SEVERITY_DEFAULTS: Record<string, string> = {
  severe: "severe",
  moderate: "moderate",
  mild: "mild",
  unrecorded: "severity not recorded",
};

/**
 * Sits above each coach reply. The reply is checked with the canonical
 * matcher (whole words, synonyms, families), so a model that ignored its
 * instructions is caught here: "almond butter" warns a tree-nut kid,
 * "butternut squash" does not. The copy says "your child" rather than a
 * name, so there is one code path and no name in screen-reader text.
 */
export const ReplySafetyNotice = memo(function ReplySafetyNotice({ text, kid }: ReplySafetyNoticeProps) {
  const { t } = useTranslation();
  const warnings = useMemo(() => (kid ? replyAllergenWarnings(text, kid) : []), [text, kid]);
  const unknown = kid ? kidAllergyState(kid) === "unknown" : false;

  if (warnings.length > 0) {
    return (
      <Alert variant="destructive" role="note" className="py-3">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription className="space-y-1 font-medium">
          {warnings.map((w) => (
            <p key={w.key}>
              {t("aiCoach.allergenWarning", {
                defaultValue: "This reply mentions {{allergen}}, which your child is allergic to ({{severity}}). Don't serve it.",
                allergen: w.key,
                severity: t(`aiCoach.severity.${w.severity}`, { defaultValue: SEVERITY_DEFAULTS[w.severity] ?? w.severity }),
              })}
            </p>
          ))}
        </AlertDescription>
      </Alert>
    );
  }

  if (unknown) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {t("aiCoach.allergenUnknownNote", {
            defaultValue:
              "Allergies aren't recorded for this child, so this reply wasn't checked against them. Check labels before serving.",
          })}
        </span>
      </p>
    );
  }

  return null;
});
