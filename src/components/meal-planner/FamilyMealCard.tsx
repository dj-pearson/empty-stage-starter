import { useMemo, memo, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KidAvatarImage } from "@/components/KidAvatarImage";
import { Food, Kid, MealSlot, PlanEntry, Recipe } from "@/types";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { groupSlot, type KidSlot } from "@/lib/familySlot";
import { isoDay } from "@/lib/mobilePlannerDay";
import {
  Plus,
  Sparkles,
  ArrowRightLeft,
  Check,
  CheckCheck,
  Users,
  Trash2,
  ShoppingCart,
  Sunrise,
  Sun,
  Moon,
  Cookie,
  Apple,
} from "lucide-react";

export type MealOutcome = "ate" | "tasted" | "refused";

interface FamilyMealCardProps {
  slot: MealSlot;
  label: string;
  date: string;
  /** yyyy-MM-dd; outcomes can only be logged on or before it. */
  today?: string;
  entries: PlanEntry[];
  kids: Kid[];
  foodById: Map<string, Food>;
  recipeById: Map<string, Recipe>;
  singleKidMode: boolean;
  activeKidId: string | null;
  onTapAdd: (date: string, slot: MealSlot, kidId?: string) => void;
  onTapChangeFamilyMeal: (date: string, slot: MealSlot) => void;
  onTapKidSubstitute: (date: string, slot: MealSlot, kidId: string) => void;
  onMarkResult: (entry: PlanEntry, result: MealOutcome) => void;
  onDeleteEntries?: (ids: string[]) => void;
  /** Tapped from the "Need to buy" chip. */
  onNeedToBuy?: () => void;
}

const SLOT_ICON: Record<MealSlot, ComponentType<{ className?: string }>> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack1: Cookie,
  snack2: Apple,
  try_bite: Sparkles,
};

const OUTCOMES: readonly MealOutcome[] = ["ate", "tasted", "refused"];

const OUTCOME_SELECTED: Record<MealOutcome, string> = {
  ate: "bg-success text-success-foreground border-success",
  tasted: "bg-warning text-warning-foreground border-warning",
  refused: "bg-destructive text-destructive-foreground border-destructive",
};

const OUTCOME_DEFAULT_LABEL: Record<MealOutcome, string> = {
  ate: "Ate",
  tasted: "Tasted",
  refused: "Refused",
};

const ICON_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function isUnstocked(food: Food | undefined): boolean {
  return !!food && (food.quantity ?? 0) <= 0;
}

interface OutcomeControlProps {
  entry: PlanEntry;
  kidName: string;
  onMarkResult: (entry: PlanEntry, result: MealOutcome) => void;
  pressClass: string;
}

function OutcomeControl({ entry, kidName, onMarkResult, pressClass }: OutcomeControlProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("planner.mobile.outcomeFor", { defaultValue: "How did {{name}} do?", name: kidName })}
      className="flex gap-1.5"
    >
      {OUTCOMES.map((result) => {
        const selected = entry.result === result;
        return (
          <button
            key={result}
            type="button"
            aria-pressed={selected}
            onClick={() => onMarkResult(entry, result)}
            className={cn(
              "flex-1 min-h-11 px-2 rounded-xl text-xs font-semibold border",
              pressClass,
              selected
                ? OUTCOME_SELECTED[result]
                : "bg-background text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {t(`planner.mobile.outcome.${result}`, { defaultValue: OUTCOME_DEFAULT_LABEL[result] })}
          </button>
        );
      })}
    </div>
  );
}

function KidAvatar({ kid }: { kid: Kid }) {
  return (
    <Avatar className="h-8 w-8 shrink-0">
      {kid.profile_picture_url && <KidAvatarImage src={kid.profile_picture_url} alt="" />}
      <AvatarFallback className="text-xs font-bold bg-primary/15 text-primary">
        {getInitials(kid.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export const FamilyMealCard = memo(function FamilyMealCard({
  slot,
  label,
  date,
  today,
  entries,
  kids,
  foodById,
  recipeById,
  singleKidMode,
  activeKidId,
  onTapAdd,
  onTapChangeFamilyMeal,
  onTapKidSubstitute,
  onMarkResult,
  onDeleteEntries,
  onNeedToBuy,
}: FamilyMealCardProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const press = reduceMotion ? "" : "transition-transform active:scale-95";
  const pressSoft = reduceMotion ? "" : "transition-transform active:scale-[0.98]";
  const SlotIcon = SLOT_ICON[slot];
  const isTryBite = slot === "try_bite";
  const canLog = date <= (today ?? isoDay(new Date()));

  const grouped = useMemo(() => groupSlot(entries), [entries]);

  const nameOf = (key: string | null): string => {
    if (!key) return t("planner.mobile.unknownMeal", { defaultValue: "Unknown meal" });
    return (
      recipeById.get(key)?.name ??
      foodById.get(key)?.name ??
      t("planner.mobile.unknownMeal", { defaultValue: "Unknown meal" })
    );
  };

  /** A plain food with no stock, or a recipe with any unstocked food. */
  const needsBuying = (key: string | null): boolean => {
    if (!key) return false;
    const recipe = recipeById.get(key);
    if (recipe) return (recipe.food_ids ?? []).some((id) => isUnstocked(foodById.get(id)));
    return isUnstocked(foodById.get(key));
  };

  const soloKidId = singleKidMode ? activeKidId : kids.length === 1 ? kids[0].id : null;
  const isEmpty = entries.length === 0;

  const needToBuyChip = (key: string | null) =>
    needsBuying(key) ? (
      <button
        type="button"
        onClick={onNeedToBuy}
        disabled={!onNeedToBuy}
        className={cn(
          "inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-muted px-2.5 text-xs font-medium text-foreground hover:bg-muted/70",
          press,
        )}
      >
        <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
        {t("planner.mobile.needToBuy", { defaultValue: "Need to buy" })}
      </button>
    ) : null;

  const header = (showChange: boolean, changeLabel: string) => (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <SlotIcon className={cn("h-4 w-4", isTryBite && "text-try-bite")} aria-hidden="true" />
        {label}
      </h3>
      <div className="flex items-center">
        {showChange && (
          <button
            type="button"
            onClick={() => onTapChangeFamilyMeal(date, slot)}
            className={ICON_BUTTON}
            aria-label={changeLabel}
          >
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {!isEmpty && onDeleteEntries && (
          <button
            type="button"
            onClick={() => onDeleteEntries(entries.map((e) => e.id))}
            className={ICON_BUTTON}
            aria-label={
              soloKidId
                ? t("planner.mobile.removeSlot", { defaultValue: "Remove {{slot}}", slot: label })
                : t("planner.mobile.removeForEveryone", {
                    defaultValue: "Remove {{slot}} for everyone",
                    slot: label,
                  })
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const shell = (children: ReactNode) => (
    <section
      aria-label={label}
      className={cn(
        "rounded-2xl border p-4",
        isTryBite ? "bg-try-bite/10 border-try-bite/30" : "bg-card border-border",
      )}
    >
      {children}
    </section>
  );

  const addButton = (text: string, kidId?: string) => (
    <button
      type="button"
      onClick={() => onTapAdd(date, slot, kidId)}
      className={cn(
        "w-full py-5 rounded-xl border-2 border-dashed border-border flex flex-col items-center gap-2 hover:bg-muted",
        pressSoft,
      )}
    >
      <span className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10">
        <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
      </span>
      <span className="text-sm font-medium text-muted-foreground">{text}</span>
    </button>
  );

  // --- One kid: the active kid, or a family of one ---------------------------
  if (soloKidId) {
    const kidSlot = grouped.perKid.get(soloKidId);
    const kid = kids.find((k) => k.id === soloKidId);
    const recipe = kidSlot ? recipeById.get(kidSlot.key) : undefined;

    return shell(
      <>
        {header(!!kidSlot, t("planner.mobile.changeSlot", { defaultValue: "Change {{slot}}", slot: label }))}
        {!kidSlot ? (
          addButton(
            isTryBite
              ? t("planner.mobile.addTryBite", { defaultValue: "Add a try bite" })
              : t("planner.mobile.addMeal", { defaultValue: "Add meal" }),
            soloKidId,
          )
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onTapChangeFamilyMeal(date, slot)}
              className={cn("w-full text-left", pressSoft)}
            >
              <p className="font-bold text-base text-foreground leading-snug">{nameOf(kidSlot.key)}</p>
              {recipe && (
                <Badge variant="secondary" className="mt-1 text-xs px-1.5 py-0">
                  {t("planner.mobile.recipe", { defaultValue: "Recipe" })}
                </Badge>
              )}
            </button>
            {needToBuyChip(kidSlot.key)}
            {canLog && (
              <OutcomeControl
                entry={kidSlot.primary}
                kidName={kid?.name ?? ""}
                onMarkResult={onMarkResult}
                pressClass={press}
              />
            )}
          </div>
        )}
      </>,
    );
  }

  // --- Family: one row per kid ----------------------------------------------
  const kidRow = (kid: Kid, kidSlot: KidSlot | undefined) => {
    const onFamily = !!kidSlot && !isTryBite && kidSlot.key === grouped.familyKey;
    const openPicker = () =>
      isTryBite ? onTapAdd(date, slot, kid.id) : onTapKidSubstitute(date, slot, kid.id);
    let subtitle: ReactNode;
    if (!kidSlot) {
      subtitle = (
        <span className="text-muted-foreground">
          {t("planner.mobile.notPlanned", { defaultValue: "Not planned" })}
        </span>
      );
    } else if (onFamily) {
      subtitle = (
        <span className="inline-flex items-center gap-1 text-foreground">
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          {t("planner.mobile.familyMeal", { defaultValue: "Family meal" })}
        </span>
      );
    } else {
      subtitle = <span className="text-foreground truncate">{nameOf(kidSlot.key)}</span>;
    }

    return (
      <li key={kid.id} className="py-2 first:pt-0 last:pb-0 space-y-2" data-testid={`kid-row-${kid.id}`}>
        <div className="flex items-center gap-2">
          <KidAvatar kid={kid} />
          <div className="flex-1 min-w-0 flex flex-col text-xs">
            <span className="font-semibold text-sm text-foreground truncate">{kid.name}</span>
            {subtitle}
          </div>
          {kidSlot ? (
            <>
              <button
                type="button"
                onClick={openPicker}
                className={ICON_BUTTON}
                aria-label={t("planner.mobile.swapFor", {
                  defaultValue: "Swap {{name}}'s {{slot}}",
                  name: kid.name,
                  slot: label,
                })}
              >
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              {onDeleteEntries && (
                <button
                  type="button"
                  onClick={() => onDeleteEntries(kidSlot.allRows.map((e) => e.id))}
                  className={ICON_BUTTON}
                  aria-label={t("planner.mobile.removeFor", {
                    defaultValue: "Remove {{name}}'s {{slot}}",
                    name: kid.name,
                    slot: label,
                  })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={openPicker}
              className={ICON_BUTTON}
              aria-label={t("planner.mobile.addFor", {
                defaultValue: "Add {{slot}} for {{name}}",
                name: kid.name,
                slot: label,
              })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {kidSlot && canLog && (
          <OutcomeControl
            entry={kidSlot.primary}
            kidName={kid.name}
            onMarkResult={onMarkResult}
            pressClass={press}
          />
        )}
      </li>
    );
  };

  if (isTryBite) {
    return shell(
      <>
        {header(false, "")}
        <ul className="divide-y divide-border">
          {kids.map((kid) => kidRow(kid, grouped.perKid.get(kid.id)))}
        </ul>
      </>,
    );
  }

  const everyoneShares =
    kids.length > 0 && kids.every((k) => grouped.perKid.get(k.id)?.key === grouped.familyKey);
  const everyoneAte =
    everyoneShares && kids.every((k) => grouped.perKid.get(k.id)?.primary.result === "ate");
  const familyRecipe = grouped.familyKey ? recipeById.get(grouped.familyKey) : undefined;

  return shell(
    <>
      {header(
        !isEmpty,
        t("planner.mobile.changeFamilySlot", { defaultValue: "Change family {{slot}}", slot: label }),
      )}
      {isEmpty ? (
        addButton(t("planner.mobile.addFamilyMeal", { defaultValue: "Add family meal" }))
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onTapChangeFamilyMeal(date, slot)}
            className={cn("w-full text-left", pressSoft)}
          >
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="font-bold text-base text-foreground leading-snug">
                {nameOf(grouped.familyKey)}
              </span>
              {familyRecipe && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {t("planner.mobile.recipe", { defaultValue: "Recipe" })}
                </Badge>
              )}
            </span>
          </button>
          {(needsBuying(grouped.familyKey) || (everyoneShares && canLog && !everyoneAte)) && (
            <div className="flex flex-wrap items-center gap-2">
              {needToBuyChip(grouped.familyKey)}
              {everyoneShares && canLog && !everyoneAte && (
                <button
                  type="button"
                  onClick={() => {
                    for (const k of kids) {
                      const s = grouped.perKid.get(k.id);
                      if (s && s.primary.result !== "ate") onMarkResult(s.primary, "ate");
                    }
                  }}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1 rounded-full border border-success bg-success/10 px-2.5 text-xs font-semibold text-foreground hover:bg-success/20",
                    press,
                  )}
                >
                  <CheckCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                  {t("planner.mobile.everyoneAte", { defaultValue: "Everyone ate it" })}
                </button>
              )}
            </div>
          )}
          <ul className="divide-y divide-border">
            {kids.map((kid) => kidRow(kid, grouped.perKid.get(kid.id)))}
          </ul>
        </div>
      )}
    </>,
  );
});
