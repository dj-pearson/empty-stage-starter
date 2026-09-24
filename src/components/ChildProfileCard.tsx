import '@/i18n/appLocale';
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KidAvatarImage } from '@/components/KidAvatarImage';
import {
  AlertTriangle, Heart, Target, ChefHat, Sparkles, Edit, CheckCircle2,
  Calendar, Utensils, Scale, Ruler, ThumbsUp, ThumbsDown, Leaf, Share2,
  TrendingUp, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Kid } from "@/types";
import type { KidProgressSummary } from "@/lib/kidProgress";
import { kidAllergenChips, kidAllergyState } from "@/lib/kidAllergenChips";
import { computeProfileCompleteness, parseReviewed, type ProfileGap } from "@/lib/kidProfileCompleteness";
import { buildCareCardText, formatKidAge, humanize, severityLabel, type CareCardT } from "@/lib/careCard";
import { RUNGS, RUNG_META } from "@/lib/exposureLadder";

/**
 * Profile fields this card reads beyond the base Kid shape. Package A adds
 * them to Kid; declaring them here as optional keeps the card assignable from
 * Kid whether or not that has landed, with no casts.
 */
type CardKid = Kid & {
  gender?: string | null;
  allergen_severity?: Partial<Record<string, string>> | null;
  cross_contamination_sensitive?: boolean | null;
  nutrition_concerns?: string[] | null;
  behavioral_notes?: string | null;
  texture_sensitivity_level?: string | null;
  preferred_preparations?: string[] | null;
};

interface ChildProfileCardProps {
  kid: Kid;
  progress?: KidProgressSummary;
  onEdit: (kidId: string) => void;
  onCompleteProfile: (kid: Kid) => void;
}

/** Chips shown before "Show all": enough for a glance, short enough for a phone. */
const CHIP_CAP = 8;
/** Ladder foods listed under "This week". */
const LADDER_PREVIEW = 3;
/** Where a parent starts a food on the exposure ladder (src/App.tsx). */
const LADDER_ROUTE = "/dashboard/food-chaining";

const GAP_CTA: Record<ProfileGap, { key: string; english: string }> = {
  allergies: { key: "kids.card.completeness.cta.allergies", english: "Add allergies" },
  birthday: { key: "kids.card.completeness.cta.birthday", english: "Add birthday" },
  safeFoods: { key: "kids.card.completeness.cta.safeFoods", english: "Add safe foods" },
  preferences: { key: "kids.card.completeness.cta.preferences", english: "Add dislikes and textures" },
  goals: { key: "kids.card.completeness.cta.goals", english: "Add a goal" },
};

const nonEmpty = (list: readonly string[] | null | undefined): string[] =>
  (list ?? []).filter((v): v is string => typeof v === "string" && v.trim() !== "");


interface ChipSectionProps {
  id: string;
  icon: ReactNode;
  title: string;
  items: string[];
  chipClassName?: string;
  variant?: "default" | "secondary" | "outline";
  format?: (value: string) => string;
}

function ChipSection({ id, icon, title, items, chipClassName, variant = "outline", format }: ChipSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, CHIP_CAP);
  const hidden = items.length - shown.length;
  const listId = `${id}-chips`;
  return (
    <section className="space-y-2" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`} className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {t("kids.card.sectionCount", { title, count: items.length, defaultValue: "{{title}} ({{count}})" })}
      </h3>
      <div id={listId} className="flex flex-wrap gap-1">
        {shown.map((item) => (
          <Badge key={item} variant={variant} className={cn("text-xs", chipClassName)}>
            {format ? format(item) : item}
          </Badge>
        ))}
      </div>
      {(hidden > 0 || expanded) && items.length > CHIP_CAP && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t("kids.card.showLess", { defaultValue: "Show less" })
            : t("kids.card.showAll", { count: items.length, defaultValue: "Show all {{count}}" })}
        </Button>
      )}
    </section>
  );
}

function ChildProfileCardImpl({ kid: kidProp, progress, onEdit, onCompleteProfile }: ChildProfileCardProps) {
  const kid: CardKid = kidProp;
  const { t, i18n } = useTranslation();
  const tt = useCallback<CareCardT>((key, options) => String(t(key, options)), [t]);

  const age = formatKidAge(kid, tt);
  const allergyState = kidAllergyState(kid);
  const allergenChips = useMemo(() => kidAllergenChips(kid), [kid]);
  const completeness = useMemo(() => computeProfileCompleteness(kid), [kid]);
  const nextGap = completeness.missing[0];
  const reviewed = parseReviewed(kid.profile_last_reviewed);
  const initial = Array.from(kid.name.trim())[0]?.toUpperCase() ?? "?";

  const enumLabel = (group: string, value: string) =>
    t(`kids.enums.${group}.${value}`, { defaultValue: humanize(value) });

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

  const alwaysEats = nonEmpty(kid.always_eats_foods);
  const favorites = nonEmpty(kid.favorite_foods);
  const dislikes = nonEmpty(kid.disliked_foods);
  const hasFoods = alwaysEats.length + favorites.length + dislikes.length > 0;

  const texturePrefs = nonEmpty(kid.texture_preferences);
  const textureDislikes = nonEmpty(kid.texture_dislikes);
  const flavorPrefs = nonEmpty(kid.flavor_preferences);
  const preparations = nonEmpty(kid.preferred_preparations);
  const strategies = nonEmpty(kid.helpful_strategies);
  const hasEatingProfile = Boolean(
    kid.eating_behavior || kid.pickiness_level || kid.new_food_willingness || kid.texture_sensitivity_level,
  );
  const hasPreferences =
    hasEatingProfile ||
    texturePrefs.length + textureDislikes.length + flavorPrefs.length + preparations.length + strategies.length > 0;

  const dietary = nonEmpty(kid.dietary_restrictions);
  const goals = nonEmpty(kid.health_goals);
  const concerns = nonEmpty(kid.nutrition_concerns);
  const hasBody = Boolean(kid.gender || kid.height_cm || kid.weight_kg);
  const hasDetails =
    hasBody || dietary.length + goals.length + concerns.length > 0 || Boolean(kid.behavioral_notes) || Boolean(reviewed);

  const ladderPreview = (progress?.activeLadder ?? []).slice(0, LADDER_PREVIEW);
  const rungLabel = (rung: number) => {
    const key = Number.isInteger(rung) && rung >= 0 ? RUNGS[rung] : undefined;
    return key
      ? t(`kids.card.rung.${key}`, { defaultValue: RUNG_META[key].label })
      : t("kids.card.progress.step", { n: rung + 1, defaultValue: "Step {{n}}" });
  };

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
              onClick={() => onEdit(kid.id)}
              aria-label={t("kids.card.editAria", { name: kid.name, defaultValue: "Edit {{name}}'s profile" })}
            >
              <Edit className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Allergies sit directly under the name on every card, in every tab:
            they are the one thing a caregiver must not have to look for. */}
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
                onClick={() => onEdit(kid.id)}
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
              onClick={() => onCompleteProfile(kidProp)}
            >
              <Sparkles className="mr-1 h-4 w-4" aria-hidden="true" />
              {t(GAP_CTA[nextGap].key, { defaultValue: GAP_CTA[nextGap].english })}
            </Button>
          </div>
        )}

        <Tabs defaultValue="foods" className="w-full">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="foods" className="shrink-0 text-xs sm:text-sm">
              {t("kids.card.tabs.foods", { defaultValue: "Foods" })}
            </TabsTrigger>
            <TabsTrigger value="preferences" className="shrink-0 text-xs sm:text-sm">
              {t("kids.card.tabs.preferences", { defaultValue: "Preferences" })}
            </TabsTrigger>
            <TabsTrigger value="details" className="shrink-0 text-xs sm:text-sm">
              {t("kids.card.tabs.details", { defaultValue: "Details" })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="foods" className="mt-4 space-y-4">
            <ChipSection
              id={`kid-${kid.id}-always`}
              icon={<Heart className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.foods.alwaysEats", { defaultValue: "Always eats" })}
              items={alwaysEats}
              variant="secondary"
            />
            <ChipSection
              id={`kid-${kid.id}-favorites`}
              icon={<Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.foods.favorites", { defaultValue: "Favorites" })}
              items={favorites}
              variant="secondary"
            />
            <ChipSection
              id={`kid-${kid.id}-dislikes`}
              icon={<ThumbsDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              title={t("kids.card.foods.dislikes", { defaultValue: "Doesn't like right now" })}
              items={dislikes}
              chipClassName="text-muted-foreground"
            />
            {!hasFoods && (
              <div className="py-6 text-center text-muted-foreground">
                <Utensils className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
                <p className="text-sm font-medium">
                  {t("kids.card.foods.emptyTitle", { defaultValue: "No foods added yet" })}
                </p>
                <p className="mt-1 text-xs">
                  {t("kids.card.foods.emptyText", {
                    name: kid.name,
                    defaultValue: "Add the foods {{name}} always eats so meal plans start from them.",
                  })}
                </p>
                <Button type="button" size="sm" className="mt-3" onClick={() => onCompleteProfile(kidProp)}>
                  {t("kids.card.foods.emptyCta", { defaultValue: "Add foods" })}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="mt-4 space-y-4">
            {hasEatingProfile && (
              <section className="space-y-2" aria-labelledby={`kid-${kid.id}-eating`}>
                <h3 id={`kid-${kid.id}-eating`} className="flex items-center gap-2 text-sm font-medium">
                  <Utensils className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("kids.card.prefs.eatingProfile", { defaultValue: "Eating profile" })}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {kid.eating_behavior && (
                    <Badge variant="outline" className="text-xs">
                      {t("kids.card.prefs.behavior", {
                        value: enumLabel("eatingBehavior", kid.eating_behavior),
                        defaultValue: "Variety: {{value}}",
                      })}
                    </Badge>
                  )}
                  {kid.pickiness_level && (
                    <Badge variant="outline" className="text-xs">
                      {t("kids.card.prefs.pickiness", {
                        value: enumLabel("pickinessLevel", kid.pickiness_level),
                        defaultValue: "Pickiness: {{value}}",
                      })}
                    </Badge>
                  )}
                  {kid.new_food_willingness && (
                    <Badge variant="outline" className="text-xs">
                      {t("kids.card.prefs.newFoods", {
                        value: enumLabel("newFoodWillingness", kid.new_food_willingness),
                        defaultValue: "New foods: {{value}}",
                      })}
                    </Badge>
                  )}
                  {kid.texture_sensitivity_level && (
                    <Badge variant="outline" className="text-xs">
                      {t("kids.card.prefs.textureSensitivity", {
                        value: enumLabel("textureSensitivity", kid.texture_sensitivity_level),
                        defaultValue: "Texture sensitivity: {{value}}",
                      })}
                    </Badge>
                  )}
                </div>
              </section>
            )}
            <ChipSection
              id={`kid-${kid.id}-texture-likes`}
              icon={<ThumbsUp className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.prefs.textureLikes", { defaultValue: "Textures they like" })}
              items={texturePrefs}
              format={humanize}
            />
            <ChipSection
              id={`kid-${kid.id}-texture-dislikes`}
              icon={<ThumbsDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              title={t("kids.card.prefs.textureDislikes", { defaultValue: "Textures they avoid" })}
              items={textureDislikes}
              chipClassName="text-muted-foreground"
              format={humanize}
            />
            <ChipSection
              id={`kid-${kid.id}-flavors`}
              icon={<Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.prefs.flavors", { defaultValue: "Flavors" })}
              items={flavorPrefs}
              format={humanize}
            />
            <ChipSection
              id={`kid-${kid.id}-preparations`}
              icon={<ChefHat className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.prefs.preparations", { defaultValue: "Preferred preparations" })}
              items={preparations}
              variant="secondary"
              format={humanize}
            />
            <ChipSection
              id={`kid-${kid.id}-strategies`}
              icon={<Target className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.prefs.strategies", { defaultValue: "What helps" })}
              items={strategies}
              format={humanize}
            />
            {!hasPreferences && (
              <div className="py-6 text-center text-muted-foreground">
                <ChefHat className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
                <p className="text-sm font-medium">
                  {t("kids.card.prefs.emptyTitle", { defaultValue: "No preferences yet" })}
                </p>
                <p className="mt-1 text-xs">
                  {t("kids.card.prefs.emptyText", {
                    name: kid.name,
                    defaultValue: "Add the textures and flavors {{name}} likes or avoids.",
                  })}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-4 space-y-4">
            {hasBody && (
              <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-3">
                {kid.gender && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {t("kids.card.details.gender", { defaultValue: "Gender" })}
                    </span>
                    <p className="text-sm font-medium">{enumLabel("gender", kid.gender)}</p>
                  </div>
                )}
                {kid.height_cm ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Ruler className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xs text-muted-foreground">
                        {t("kids.card.details.height", { defaultValue: "Height" })}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {t("kids.card.details.heightValue", { value: kid.height_cm, defaultValue: "{{value}} cm" })}
                    </p>
                  </div>
                ) : null}
                {kid.weight_kg ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Scale className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xs text-muted-foreground">
                        {t("kids.card.details.weight", { defaultValue: "Weight" })}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {t("kids.card.details.weightValue", { value: kid.weight_kg, defaultValue: "{{value}} kg" })}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
            <ChipSection
              id={`kid-${kid.id}-dietary`}
              icon={<Leaf className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.details.dietary", { defaultValue: "Dietary restrictions" })}
              items={dietary}
              variant="secondary"
              format={humanize}
            />
            <ChipSection
              id={`kid-${kid.id}-goals`}
              icon={<Target className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.details.goals", { defaultValue: "Goals" })}
              items={goals}
              format={humanize}
            />
            <ChipSection
              id={`kid-${kid.id}-concerns`}
              icon={<Heart className="h-4 w-4 text-primary" aria-hidden="true" />}
              title={t("kids.card.details.concerns", { defaultValue: "Nutrition concerns" })}
              items={concerns}
              format={humanize}
            />
            {kid.behavioral_notes && (
              <section className="space-y-1">
                <h3 className="text-sm font-medium">
                  {t("kids.card.details.notes", { defaultValue: "Notes" })}
                </h3>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{kid.behavioral_notes}</p>
              </section>
            )}
            {reviewed && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                {t("kids.card.details.lastReviewed", {
                  date: new Intl.DateTimeFormat(i18n.language || undefined, { dateStyle: "medium" }).format(reviewed),
                  defaultValue: "Last updated {{date}}",
                })}
              </p>
            )}
            {!hasDetails && (
              <div className="py-6 text-center text-muted-foreground">
                <Heart className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
                <p className="text-sm font-medium">
                  {t("kids.card.details.emptyTitle", { defaultValue: "No details yet" })}
                </p>
                <p className="mt-1 text-xs">
                  {t("kids.card.details.emptyText", {
                    name: kid.name,
                    defaultValue: "Goals, dietary needs and notes for {{name}} will show here.",
                  })}
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export const ChildProfileCard = memo(ChildProfileCardImpl);
