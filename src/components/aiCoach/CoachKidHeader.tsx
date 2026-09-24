import { memo, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, Eye, ShieldCheck } from "lucide-react";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useKids } from "@/contexts/AppContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { CoachContext } from "@/lib/coachContext";
import { kidAllergenChips, kidAllergyState, type KidAllergenChip } from "@/lib/kidAllergenChips";
import { cn } from "@/lib/utils";
import type { Kid } from "@/types";
import "@/i18n/appLocale";

export interface CoachKidHeaderProps {
  kid: Kid | null;
  ctx: CoachContext | null;
}

const MAX_CHIPS = 3;

const SEVERITY_DEFAULTS: Record<string, string> = {
  severe: "severe",
  moderate: "moderate",
  mild: "mild",
  unrecorded: "severity not recorded",
};

/**
 * Which child the coach is working for, that child's allergens with
 * severity, and what the coach is told about them. Allergies that were never
 * entered read "Allergies not recorded" and link to the profile, rather than
 * an empty row that looks like "none". Collapsed, it is one line on a phone.
 */
export const CoachKidHeader = memo(function CoachKidHeader({ kid, ctx }: CoachKidHeaderProps) {
  const { t } = useTranslation();
  const { kids, setActiveKidId } = useKids();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  const chips = useMemo(() => (kid ? kidAllergenChips(kid) : []), [kid]);
  const state = kid ? kidAllergyState(kid) : null;
  const shown = chips.slice(0, MAX_CHIPS);
  const overflow = chips.slice(MAX_CHIPS);

  const severityText = (c: KidAllergenChip) =>
    c.severity ? t(`aiCoach.severity.${c.severity}`, { defaultValue: SEVERITY_DEFAULTS[c.severity] }) : null;

  const chipLabel = (c: KidAllergenChip) => {
    const severity = severityText(c);
    return severity
      ? t("aiCoach.header.allergenChip", { defaultValue: "{{allergen}}, {{severity}}", allergen: c.label, severity })
      : c.label;
  };

  const counts = useMemo(() => {
    if (!ctx) return null;
    return {
      safe: ctx.safeFoods.length,
      close: ctx.ladder.filter((l) => l.status === "close").length,
      pantry: ctx.pantryFits.length,
    };
  }, [ctx]);

  const switcher =
    kids.length > 1 || !kid ? (
      <Select value={kid?.id ?? ""} onValueChange={(id) => setActiveKidId(id)}>
        <SelectTrigger
          className="h-11 w-auto min-w-0 max-w-[45%] shrink-0 gap-1 font-semibold md:h-9"
          aria-label={t("aiCoach.header.switchKid", { defaultValue: "Child the coach is helping" })}
        >
          <SelectValue placeholder={t("aiCoach.header.pickKid", { defaultValue: "Pick a child to get advice about them" })} />
        </SelectTrigger>
        <SelectContent>
          {kids.map((k) => (
            <SelectItem key={k.id} value={k.id}>
              {k.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <span className="shrink-0 truncate font-semibold">{kid.name}</span>
    );

  if (!kid) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        {kids.length > 0 && switcher}
        <p className="truncate text-sm text-muted-foreground">
          {t("aiCoach.header.pickKid", { defaultValue: "Pick a child to get advice about them" })}
        </p>
      </div>
    );
  }

  const profileLink = `/dashboard/kids?kid=${encodeURIComponent(kid.id)}&section=allergies`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex min-w-0 items-center gap-2">
        {switcher}
        <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" aria-label={t("aiCoach.header.allergens", { defaultValue: "Allergens" })}>
          {state === "unknown" && (
            <li className="shrink-0">
              <Link
                to={profileLink}
                title={t("aiCoach.header.allergiesUnknownHint", { defaultValue: "Add allergies so the coach can check its answers" })}
                className={cn(
                  badgeVariants({ variant: "outline" }),
                  "gap-1 whitespace-nowrap border-warning text-foreground hover:bg-warning/10",
                )}
              >
                <AlertTriangle className="h-3 w-3 text-warning" aria-hidden="true" />
                {t("aiCoach.header.allergiesUnknown", { defaultValue: "Allergies not recorded" })}
              </Link>
            </li>
          )}
          {shown.map((c) => (
            <li key={c.key} className="shrink-0">
              <Badge
                variant={c.severity === "severe" ? "destructive" : c.severity === "moderate" ? "secondary" : "outline"}
                className="whitespace-nowrap"
              >
                {chipLabel(c)}
              </Badge>
            </li>
          ))}
          {overflow.length > 0 && (
            <li className="shrink-0">
              <Badge
                variant="outline"
                className="whitespace-nowrap"
                aria-label={t("aiCoach.header.moreAllergensLabel", {
                  defaultValue: "{{count}} more allergens: {{list}}",
                  count: overflow.length,
                  list: overflow.map(chipLabel).join(", "),
                })}
              >
                {t("aiCoach.header.moreAllergens", { defaultValue: "+{{count}}", count: overflow.length })}
              </Badge>
            </li>
          )}
        </ul>
        {state === "none" && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {t("aiCoach.header.noAllergies", { defaultValue: "No known allergies" })}
          </span>
        )}
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 shrink-0 gap-1 px-2 text-xs text-muted-foreground md:h-8"
            aria-label={t("aiCoach.header.sees", { defaultValue: "What the coach sees" })}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">{t("aiCoach.header.sees", { defaultValue: "What the coach sees" })}</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5", !reducedMotion && "transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="pt-2 text-xs text-muted-foreground">
        {counts && (
          <p>
            {[
              t("aiCoach.header.safeCount", { defaultValue: "{{count}} safe foods", count: counts.safe }),
              t("aiCoach.header.closeCount", { defaultValue: "{{count}} close to safe", count: counts.close }),
              t("aiCoach.header.pantryCount", { defaultValue: "{{count}} pantry fits", count: counts.pantry }),
            ].join(", ")}
          </p>
        )}
        <p className="mt-1 flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("aiCoach.header.privacy", { defaultValue: "Your child's name is never sent" })}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
});
