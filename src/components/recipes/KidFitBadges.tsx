import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, CircleHelp, Frown, ShieldCheck, Sparkles, Utensils } from "lucide-react";
import type { ItemFit } from "@/lib/kidFit";
import { cn } from "@/lib/utils";

export type KidFitChipTone = "danger" | "unknown" | "dislike" | "safe" | "trying" | "neutral";

export interface KidFitChip {
  key: string;
  tone: KidFitChipTone;
  label: string;
  icon: LucideIcon;
}

const TONE_CLASS: Record<KidFitChipTone, string> = {
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  // Unknown is muted on purpose: it must never look like the safe chip.
  unknown: "border-border bg-muted text-muted-foreground",
  dislike: "border-warning/40 bg-warning/15 text-foreground",
  safe: "border-safe-food/30 bg-safe-food/10 text-safe-food",
  trying: "border-try-bite/30 bg-try-bite/10 text-foreground",
  neutral: "border-border bg-transparent text-muted-foreground",
};

/**
 * Chips in priority order. Pure so the order is testable without rendering:
 *
 * 1. one per kid whose allergen is in it ("Not for Ava: peanut")
 * 2. allergy status unknown ("Allergy not checked"), never green
 * 3. one per kid with a disliked ingredient
 * 4. safe for everyone (or "No allergens" when only the allergy check passed)
 * 5. a try-bite someone is working on
 * 6. with one kid, how it went before ("Ate 3 of 4")
 */
export function kidFitChips(fit: ItemFit | undefined, t: TFunction, mode: "compact" | "full"): KidFitChip[] {
  if (!fit || fit.perKid.length === 0) return [];
  const chips: KidFitChip[] = [];
  const single = fit.perKid.length === 1 ? fit.perKid[0] : null;

  for (const hit of fit.allergenKids) {
    chips.push({
      key: `allergen-${hit.kid.id}`,
      tone: "danger",
      icon: AlertTriangle,
      label: t("recipes.fit.notFor", {
        defaultValue: "Not for {{name}}: {{allergen}}",
        name: hit.kid.name,
        allergen: hit.fit.allergen ?? "",
      }),
    });
  }

  if (fit.allergenStatus === "unknown") {
    chips.push({
      key: "unknown",
      tone: "unknown",
      icon: CircleHelp,
      label:
        mode === "full" && fit.unchecked > 0
          ? t("recipes.fit.uncheckedCount", {
              defaultValue: "Allergy not checked ({{count}} unmatched ingredients)",
              defaultValue_one: "Allergy not checked (1 unmatched ingredient)",
              count: fit.unchecked,
            })
          : t("recipes.fit.unchecked", { defaultValue: "Allergy not checked" }),
    });
  }

  for (const kid of fit.dislikeKids) {
    chips.push({
      key: `dislike-${kid.id}`,
      tone: "dislike",
      icon: Frown,
      label: t("recipes.fit.dislikes", {
        defaultValue: "{{name}} dislikes an ingredient",
        name: kid.name,
      }),
    });
  }

  if (fit.safeForAll) {
    chips.push({
      key: "safe",
      tone: "safe",
      icon: Check,
      label: single
        ? t("recipes.fit.safeFor", { defaultValue: "Safe for {{name}}", name: single.kid.name })
        : t("recipes.fit.safeForAll", { defaultValue: "Safe for all" }),
    });
  } else if (fit.allergenStatus === "safe") {
    chips.push({
      key: "no-allergens",
      tone: "neutral",
      icon: ShieldCheck,
      label: t("recipes.fit.noAllergens", { defaultValue: "No allergens" }),
    });
  }

  if (fit.trying) {
    chips.push({
      key: "trying",
      tone: "trying",
      icon: Sparkles,
      label: t("recipes.fit.trying", { defaultValue: "Try bite" }),
    });
  }

  if (single && single.fit.tries > 0) {
    chips.push({
      key: "history",
      tone: "neutral",
      icon: Utensils,
      label: t("recipes.fit.ateOf", {
        defaultValue: "Ate {{ate}} of {{tries}}",
        ate: single.fit.ate,
        tries: single.fit.tries,
      }),
    });
  }

  return chips;
}

export const COMPACT_CHIP_LIMIT = 3;

interface KidFitBadgesProps {
  fit?: ItemFit;
  mode?: "compact" | "full";
  className?: string;
}

/**
 * Per-kid fit for a recipe, as a row of chips. Every chip carries its meaning
 * in text; the icon and color only repeat it.
 */
export const KidFitBadges = memo(function KidFitBadges({ fit, mode = "compact", className }: KidFitBadgesProps) {
  const { t } = useTranslation();
  const chips = useMemo(() => kidFitChips(fit, t, mode), [fit, t, mode]);
  if (chips.length === 0) return null;

  const shown = mode === "compact" ? chips.slice(0, COMPACT_CHIP_LIMIT) : chips;
  const hidden = chips.slice(shown.length);

  return (
    <ul
      className={cn("flex flex-wrap items-center gap-1", className)}
      aria-label={t("recipes.fit.label", { defaultValue: "How this fits your kids" })}
    >
      {shown.map((chip) => {
        const Icon = chip.icon;
        return (
          <li
            key={chip.key}
            data-tone={chip.tone}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              TONE_CLASS[chip.tone],
            )}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{chip.label}</span>
          </li>
        );
      })}
      {hidden.length > 0 && (
        <li
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            TONE_CLASS.neutral,
          )}
          title={hidden.map((c) => c.label).join(", ")}
        >
          <span aria-hidden="true">+{hidden.length}</span>
          <span className="sr-only">
            {t("recipes.fit.more", {
              defaultValue: "{{count}} more: {{list}}",
              count: hidden.length,
              list: hidden.map((c) => c.label).join(", "),
            })}
          </span>
        </li>
      )}
    </ul>
  );
});
