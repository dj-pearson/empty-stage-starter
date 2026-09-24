import { memo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, HeartHandshake, Phone, Stethoscope } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { detectRedFlags, telHref, type RedFlagTier } from "@/lib/aiSafety";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

export interface EscalationCardProps {
  flags: ReturnType<typeof detectRedFlags>;
}

const DEFAULTS: Record<RedFlagTier, { title: string; body: string; call: string }> = {
  emergency: {
    title: "If your child is choking, can't breathe or is swelling, call 911 now",
    body: "Don't wait for an answer here.",
    call: "Call {{number}}",
  },
  crisis: {
    title: "You don't have to handle this alone",
    body: "Talk to someone now, any time of day.",
    call: "Call or text {{number}}",
  },
  clinician: {
    title: "This is one for your pediatrician",
    body: "Weight loss, not eating for days or vomiting after meals needs a doctor to look at it.",
    call: "Emergency: call {{number}}",
  },
  eating_disorder: {
    title: "Ask about a feeding evaluation",
    body: "A very short list of foods or real fear of eating can be ARFID. Your pediatrician can refer you to a feeding specialist.",
    call: "ANAD helpline: {{number}}",
  },
};

const ICONS: Record<RedFlagTier, typeof AlertTriangle> = {
  emergency: AlertTriangle,
  crisis: HeartHandshake,
  clinician: Stethoscope,
  eating_disorder: Stethoscope,
};

/** The number as written in the resource ("1-888-375-7767"), for the link text. */
function displayNumber(contact: string): string | null {
  const m = /\d(?:[\d -]*\d)?/.exec(contact);
  return m ? m[0] : null;
}

/**
 * Pinned above a parent's message when detectRedFlags finds something in it.
 * Deterministic: it shows whether or not the model follows its own safety
 * rules and whether or not the call succeeds. Only the emergency tier
 * interrupts a screen reader; the others read in place.
 */
export const EscalationCard = memo(function EscalationCard({ flags }: EscalationCardProps) {
  const { t } = useTranslation();
  if (flags.length === 0) return null;

  return (
    <div className="space-y-2">
      {flags.map(({ tier, resource }) => {
        const urgent = tier === "emergency" || tier === "crisis";
        const href = telHref(resource.contact);
        const number = displayNumber(resource.contact);
        const Icon = ICONS[tier];
        return (
          <Alert
            key={tier}
            variant={urgent ? "destructive" : "default"}
            role={tier === "emergency" ? "alert" : undefined}
            data-tier={tier}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <AlertTitle className="leading-snug">
              {t(`aiCoach.redFlag.${tier}.title`, { defaultValue: DEFAULTS[tier].title })}
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{t(`aiCoach.redFlag.${tier}.body`, { defaultValue: DEFAULTS[tier].body })}</p>
              {tier === "clinician" && (
                <p className="font-medium">
                  {t("aiCoach.redFlag.clinician.pediatrician", { defaultValue: "Call your pediatrician today." })}
                </p>
              )}
              {href && number && (
                <a
                  href={href}
                  className={cn(
                    buttonVariants({ variant: urgent ? "destructive" : "outline", size: "sm" }),
                    "min-h-11 gap-2 px-4",
                  )}
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {t(`aiCoach.redFlag.${tier}.call`, { defaultValue: DEFAULTS[tier].call, number })}
                </a>
              )}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
});
