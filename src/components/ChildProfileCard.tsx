import '@/i18n/appLocale';
import { memo, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { KidAvatarImage } from '@/components/KidAvatarImage';
import {
  AlertTriangle, Sparkles, Edit, CheckCircle2, Calendar, Share2, TrendingUp, Plus, ChevronRight, Pencil,
} from "lucide-react";
import type { Kid } from "@/types";
import type { KidProgressSummary } from "@/lib/kidProgress";
import { kidAllergenChips, kidAllergyState } from "@/lib/kidAllergenChips";
import { computeProfileCompleteness, parseReviewed, type ProfileGap } from "@/lib/kidProfileCompleteness";
import { buildCareCardText, formatKidAge, humanize, severityLabel, type CareCardT } from "@/lib/careCard";
import { RUNGS, RUNG_META } from "@/lib/exposureLadder";
import type { KidSectionId } from "@/lib/kidIntakeForm";
import { GAP_SECTION, KID_SECTION_TITLES } from "@/components/kids/kidSectionMeta";
import {
  DIETARY_RESTRICTIONS,
  EATING_BEHAVIOR,
  GENDERS,
  HEALTH_GOALS,
  NUTRITION_CONCERNS,
  PICKINESS_LABELS,
  TEXTURE_DISLIKES,
  TEXTURE_LEVELS,
  TEXTURE_LIKES,
  WILLINGNESS,
  type KidOption,
} from "@/components/kids/kidEditorOptions";

interface ChildProfileCardProps {
  kid: Kid;
  progress?: KidProgressSummary;
  /** Open the profile editor on one section of this child. */
  onEditSection: (kidId: string, section: KidSectionId) => void;
}

/** Ladder foods listed under "This week". */
const LADDER_PREVIEW = 3;
/** Where a parent starts a food on the exposure ladder (src/App.tsx). */
const LADDER_ROUTE = "/dashboard/food-chaining";

const GAP_CTA: Record<ProfileGap, { key: string; english: string }> = {
  allergies: { key: "kids.card.completeness.cta.allergies", english: "Add allergies" },
  birthday: { key: "kids.card.completeness.cta.birthday", english: "Add birthday" },
  safeFoods: { key: "kids.editor.cta.alwaysEats", english: "Add foods they always eat" },
  preferences: { key: "kids.card.completeness.cta.preferences", english: "Add dislikes and textures" },
  goals: { key: "kids.card.completeness.cta.goals", english: "Add a goal" },
};

/** Card rows, in editor order. Allergies live in the header, under the name. */
const ROW_SECTIONS: readonly KidSectionId[] = [
  "basics",
  "safeFoods",
  "alwaysEats",
  "dislikes",
  "textures",
  "behavior",
  "goals",
  "notes",
];

const nonEmpty = (list: readonly string[] | null | undefined): string[] =>
  (list ?? []).filter((v): v is string => typeof v === "string" && v.trim() !== "");

function ChildProfileCardImpl({ kid, progress, onEditSection }: ChildProfileCardProps) {
  const { t, i18n } = useTranslation();
  const tt = useCallback<CareCardT>((key, options) => String(t(key, options)), [t]);

  const age = formatKidAge(kid, tt);
  const allergyState = kidAllergyState(kid);
  const allergenChips = useMemo(() => kidAllergenChips(kid), [kid]);
  const completeness = useMemo(() => computeProfileCompleteness(kid), [kid]);
  const nextGap = completeness.missing[0];
  const reviewed = parseReviewed(kid.profile_last_reviewed);
  const initial = Array.from(kid.name.trim())[0]?.toUpperCase() ?? "?";
  const dietary = nonEmpty(kid.dietary_restrictions);

  /** The label for a stored answer: its option's text, or the stored value made readable. */
  const label = useCallback(
    (options: readonly KidOption[], value: string) => {
      const o = options.find((opt) => opt.value === value);
      return o ? t(o.labelKey, { defaultValue: o.label }) : humanize(value);
    },
    [t],
  );

  const handleShare = useCallback(async () => {
    const title = t("kids.card.careCard.shareTitle", { name: kid.name, defaultValue: "{{name}}'s care card" });
    const text = buildCareCardText(kid, tt);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, text });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success(t("kids.card.careCard.copied", { defaultValue: "Care card copied. Paste it into a message." }));
        return;
      }
      toast.error(t("kids.card.careCard.unavailable", { defaultValue: "Sharing isn't available in this browser." }));
    } catch (error) {
      // The parent closed the share sheet: nothing went wrong.
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error(t("kids.card.careCard.failed", { defaultValue: "Couldn't share the care card. Try again." }));
    }
  }, [kid, t, tt]);

  /** One line per section, or null when the section has nothing in it yet. */
  const summaries = useMemo((): Record<KidSectionId, string | null> => {
    const join = (parts: readonly (string | null | undefined | false)[], sep = " · ") => {
      const kept = parts.filter((p): p is string => typeof p === "string" && p.trim() !== "");
      return kept.length > 0 ? kept.join(sep) : null;
    };
    const list = (items: readonly string[], format: (v: string) => string = (v) => v) =>
      items.length > 0 ? items.map(format).join(", ") : null;

    const texturesAvoid = nonEmpty(kid.texture_dislikes);
    const texturesLike = nonEmpty(kid.texture_preferences);
    const preparations = nonEmpty(kid.preferred_preparations);
    const flavors = nonEmpty(kid.flavor_preferences);
    const habits = (kid.behavioral_notes ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    const strategies = nonEmpty(kid.helpful_strategies);

    return {
      basics: join([
        kid.gender ? label(GENDERS, kid.gender) : null,
        kid.height_cm ? t("kids.card.details.heightValue", { value: kid.height_cm, defaultValue: "{{value}} cm" }) : null,
        kid.weight_kg ? t("kids.card.details.weightValue", { value: kid.weight_kg, defaultValue: "{{value}} kg" }) : null,
      ]),
      allergies: null,
      safeFoods: list(nonEmpty(kid.favorite_foods)),
      alwaysEats: list(nonEmpty(kid.always_eats_foods)),
      dislikes: list(nonEmpty(kid.disliked_foods)),
      textures: join([
        kid.texture_sensitivity_level
          ? t("kids.card.prefs.textureSensitivity", {
              value: TEXTURE_LEVELS.some((o) => o.value === kid.texture_sensitivity_level)
                ? t(`kids.intake.texture.short.${kid.texture_sensitivity_level}`, {
                    defaultValue: humanize(kid.texture_sensitivity_level),
                  })
                : humanize(kid.texture_sensitivity_level),
              defaultValue: "Texture sensitivity: {{value}}",
            })
          : null,
        texturesAvoid.length > 0
          ? t("kids.intake.review.avoids", { list: list(texturesAvoid, (v) => label(TEXTURE_DISLIKES, v)), defaultValue: "Avoids: {{list}}" })
          : null,
        texturesLike.length > 0
          ? t("kids.intake.review.likes", { list: list(texturesLike, (v) => label(TEXTURE_LIKES, v)), defaultValue: "Likes: {{list}}" })
          : null,
        preparations.length > 0
          ? t("kids.editor.card.prepared", { list: list(preparations), defaultValue: "Prepared: {{list}}" })
          : null,
        flavors.length > 0
          ? t("kids.editor.card.flavors", { list: list(flavors, humanize), defaultValue: "Flavors: {{list}}" })
          : null,
      ]),
      behavior: join([
        kid.eating_behavior ? label(EATING_BEHAVIOR, kid.eating_behavior) : null,
        kid.new_food_willingness ? label(WILLINGNESS, kid.new_food_willingness) : null,
        kid.pickiness_level ? label(PICKINESS_LABELS, kid.pickiness_level) : null,
        list(habits),
      ]),
      goals: join([
        list(nonEmpty(kid.health_goals), (v) => label(HEALTH_GOALS, v)),
        list(nonEmpty(kid.nutrition_concerns), (v) => label(NUTRITION_CONCERNS, v)),
        strategies.length > 0
          ? t("kids.editor.card.helps", { list: list(strategies, humanize), defaultValue: "What helps: {{list}}" })
          : null,
      ]),
      notes: kid.notes?.trim() ? kid.notes.trim() : null,
    };
  }, [kid, label, t]);

  const ladderPreview = (progress?.activeLadder ?? []).slice(0, LADDER_PREVIEW);
  const rungLabel = (rung: number) => {
    const key = Number.isInteger(rung) && rung >= 0 ? RUNGS[rung] : undefined;
    return key
      ? t(`kids.card.rung.${key}`, { defaultValue: RUNG_META[key].label })
      : t("kids.card.progress.step", { n: rung + 1, defaultValue: "Step {{n}}" });
  };

  const sectionTitle = (section: KidSectionId) =>
    t(KID_SECTION_TITLES[section].key, { defaultValue: KID_SECTION_TITLES[section].label });

  const headingId = `kid-${kid.id}-name`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-14 w-14 shrink-0 border-2 border-border">
              <KidAvatarImage src={kid.profile_picture_url} alt="" />
              <AvatarFallback className="text-xl">{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2
                id={headingId}
                className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight"
              >
                <span className="truncate">{kid.name}</span>
                {completeness.percent === 100 && (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-primary"
                    aria-label={t("kids.card.completeness.complete", { defaultValue: "Profile complete" })}
                  />
                )}
              </h2>
              {age && <p className="mt-1 text-sm text-muted-foreground">{age}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={handleShare}
              aria-label={t("kids.card.careCard.shareAria", {
                name: kid.name,
                defaultValue: "Share {{name}}'s care card",
              })}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </Button>
            {/* aria-label (US-778): icon-only, and rendered once per child. */}
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={() => onEditSection(kid.id, "basics")}
              aria-label={t("kids.card.editAria", { name: kid.name, defaultValue: "Edit {{name}}'s profile" })}
            >
              <Edit className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Allergies sit directly under the name on every card: they are the
            one thing a caregiver must not have to look for. */}
        <div className="flex items-start justify-between gap-2">
          <div
            role="list"
            aria-label={t("kids.card.allergies.listLabel", { name: kid.name, defaultValue: "Allergies for {{name}}" })}
            className="flex flex-wrap items-center gap-1.5"
          >
            {allergyState === "unknown" && (
              <div role="listitem" className="flex items-center gap-1.5">
                <Badge variant="outline" className="border-warning bg-warning/15 text-foreground text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                  {t("kids.card.allergies.unknown", { defaultValue: "Allergies not recorded" })}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onEditSection(kid.id, "allergies")}
                  aria-label={t("kids.card.allergies.addAria", {
                    name: kid.name,
                    defaultValue: "Add allergies for {{name}}",
                  })}
                >
                  <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                  {t("kids.card.allergies.add", { defaultValue: "Add" })}
                </Button>
              </div>
            )}
            {allergyState === "none" && (
              <Badge role="listitem" variant="secondary" className="text-xs">
                {t("kids.card.allergies.none", { defaultValue: "No known allergies" })}
              </Badge>
            )}
            {allergyState === "listed" &&
              allergenChips.map((chip) =>
                chip.severity === "severe" ? (
                  <Badge key={chip.key} role="listitem" variant="destructive" className="text-xs">
                    <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                    {chip.label} ({severityLabel(chip.severity, tt)})
                  </Badge>
                ) : (
                  <Badge
                    key={chip.key}
                    role="listitem"
                    variant="outline"
                    className="border-destructive text-destructive text-xs"
                  >
                    {chip.label}
                    {chip.severity ? ` (${severityLabel(chip.severity, tt)})` : ""}
                  </Badge>
                ),
              )}
            {kid.cross_contamination_sensitive && (
              <Badge role="listitem" variant="outline" className="border-destructive text-destructive text-xs">
                {t("kids.card.allergies.crossContact", { defaultValue: "Cross-contact sensitive" })}
              </Badge>
            )}
          </div>
          {allergyState !== "unknown" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 shrink-0"
              onClick={() => onEditSection(kid.id, "allergies")}
              aria-label={t("kids.editor.card.editAllergies", {
                name: kid.name,
                defaultValue: "Edit allergies for {{name}}",
              })}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        {dietary.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("kids.editor.card.diet", {
              list: dietary.map((d) => label(DIETARY_RESTRICTIONS, d)).join(", "),
              defaultValue: "Diet: {{list}}",
            })}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {progress && (
          <section aria-labelledby={`kid-${kid.id}-week`} className="space-y-2 rounded-lg bg-muted/50 p-3">
            <h3 id={`kid-${kid.id}-week`} className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              {t("kids.card.progress.title", { defaultValue: "This week" })}
            </h3>
            <p className="text-sm">
              {t("kids.card.progress.line", {
                ate: progress.ate,
                tasted: progress.tasted,
                refused: progress.refused,
                defaultValue: "Ate {{ate}} · Tasted {{tasted}} · Refused {{refused}}",
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("kids.card.progress.newFoods", {
                count: progress.newFoodsTried,
                defaultValue: progress.newFoodsTried === 1 ? "{{count}} new food tried" : "{{count}} new foods tried",
              })}
              {" · "}
              {t("kids.card.progress.mastered", {
                count: progress.mastered,
                defaultValue: "{{count}} mastered",
              })}
            </p>
            {ladderPreview.length > 0 ? (
              <ul className="space-y-1" aria-label={t("kids.card.progress.ladderLabel", { defaultValue: "Foods in progress" })}>
                {ladderPreview.map((item) => (
                  <li key={item.foodId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {item.foodName || t("kids.card.progress.unnamedFood", { defaultValue: "A food" })}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {rungLabel(item.rung)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <Link to={LADDER_ROUTE} className="inline-block text-sm font-medium text-primary hover:underline">
                {t("kids.card.progress.empty", { defaultValue: "Pick a first food to work on" })}
              </Link>
            )}
          </section>
        )}

        {completeness.percent < 100 && nextGap && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {/* aria-label (US-778): a progressbar needs a name saying what it measures. */}
              <Progress
                value={completeness.percent}
                className="h-1.5 w-24"
                aria-label={t("kids.card.completeness.label", {
                  percent: completeness.percent,
                  defaultValue: "Profile {{percent}}% complete",
                })}
              />
              <span className="text-xs text-muted-foreground">
                {t("kids.card.completeness.label", {
                  percent: completeness.percent,
                  defaultValue: "Profile {{percent}}% complete",
                })}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11 sm:min-h-9"
              onClick={() => onEditSection(kid.id, GAP_SECTION[nextGap])}
            >
              <Sparkles className="mr-1 h-4 w-4" aria-hidden="true" />
              {t(GAP_CTA[nextGap].key, { defaultValue: GAP_CTA[nextGap].english })}
            </Button>
          </div>
        )}

        {/* Each row opens the editor on that section alone. */}
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("kids.editor.card.sectionsLabel", { name: kid.name, defaultValue: "{{name}}'s profile" })}
        >
          {ROW_SECTIONS.map((section) => {
            const summary = summaries[section];
            const title = sectionTitle(section);
            return (
              <li key={section}>
                <button
                  type="button"
                  onClick={() => onEditSection(kid.id, section)}
                  className="flex min-h-11 w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">
                      {t("kids.editor.card.editPrefix", { defaultValue: "Edit" })}{" "}
                    </span>
                    <span className="block text-sm font-medium">{title}</span>
                    {summary ? (
                      <span className="line-clamp-2 block whitespace-pre-line text-sm text-muted-foreground">
                        {summary}
                      </span>
                    ) : (
                      <span className="block text-sm text-muted-foreground">
                        {t("kids.editor.card.empty", { defaultValue: "Not added yet" })}
                      </span>
                    )}
                  </span>
                  {summary ? (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <Plus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {reviewed && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            {t("kids.card.details.lastReviewed", {
              date: new Intl.DateTimeFormat(i18n.language || undefined, { dateStyle: "medium" }).format(reviewed),
              defaultValue: "Last updated {{date}}",
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export const ChildProfileCard = memo(ChildProfileCardImpl);
