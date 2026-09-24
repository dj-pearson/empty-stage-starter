import { memo, useCallback, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { addDays } from "date-fns";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  ArrowRightLeft,
  BookTemplate,
  Check,
  CheckCheck,
  Copy,
  Frown,
  GripVertical,
  MoreHorizontal,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  Users,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KidAvatarImage } from "@/components/KidAvatarImage";
import type { SlotTarget } from "@/contexts/PlanContext";
import type { Food, Kid, MealSlot, PlanEntry, Recipe } from "@/types";
import { cn } from "@/lib/utils";
import { isoDay } from "@/lib/mobilePlannerDay";
import {
  bucketWeek,
  buildKidIndexes,
  cellFitChips,
  cellKey,
  readFamilyCell,
  PLAN_IDS_MIME,
  readDraggedIds,
  type CellChip,
  type FamilyCell,
  type KidLine,
} from "@/lib/familyWeekGrid";
import { MealQuickAddDrawer } from "./MealQuickAddDrawer";
import { useFamilySlotPicker } from "./useFamilySlotPicker";
import type { MealOutcome } from "./FamilyMealCard";
import "@/i18n/appLocale";

const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
  { slot: "snack1", label: "Snack 1" },
  { slot: "snack2", label: "Snack 2" },
  { slot: "try_bite", label: "Try Bite" },
];

const OUTCOMES: readonly MealOutcome[] = ["ate", "tasted", "refused"];
const OUTCOME_DEFAULT_LABEL: Record<MealOutcome, string> = { ate: "Ate", tasted: "Tasted", refused: "Refused" };
const OUTCOME_SELECTED: Record<MealOutcome, string> = {
  ate: "bg-success text-success-foreground border-success",
  tasted: "bg-warning text-warning-foreground border-warning",
  refused: "bg-destructive text-destructive-foreground border-destructive",
};

const EMPTY: PlanEntry[] = [];

const ICON_BUTTON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface DayColumn {
  date: string;
  short: string;
  long: string;
  isToday: boolean;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function chipLabel(chip: CellChip, kidName: string, t: TFunction): string {
  switch (chip.kind) {
    case "allergen":
      if (chip.severe && chip.severityRecorded === false) {
        return t("planner.familyGrid.chip.allergenUnrated", {
          defaultValue: "{{allergen}} allergy, severity not recorded (treated as severe)",
          allergen: chip.allergen ?? "",
        });
      }
      return chip.severe
        ? t("planner.familyGrid.chip.allergenSevere", {
            defaultValue: "Severe {{allergen}} allergy",
            allergen: chip.allergen ?? "",
          })
        : t("planner.familyGrid.chip.allergen", {
            defaultValue: "Not for {{name}}: {{allergen}}",
            name: kidName,
            allergen: chip.allergen ?? "",
          });
    case "dislike":
      return t("planner.familyGrid.chip.dislike", { defaultValue: "Dislikes" });
    case "goTo":
      return t("planner.familyGrid.chip.goTo", { defaultValue: "Go-to" });
    case "tryBite":
      return t("planner.familyGrid.chip.tryBite", { defaultValue: "Try bite" });
    case "history":
      return t("planner.familyGrid.chip.history", {
        defaultValue: "Ate {{ate}} of {{tries}}",
        ate: chip.ate ?? 0,
        tries: chip.tries ?? 0,
      });
  }
}

const CHIP_CLASS: Record<CellChip["kind"], string> = {
  allergen: "border-destructive/40 bg-destructive/10 text-destructive",
  dislike: "border-warning/40 bg-warning/15 text-foreground",
  goTo: "border-safe-food/30 bg-safe-food/10 text-safe-food",
  tryBite: "border-try-bite/30 bg-try-bite/10 text-foreground",
  history: "border-border bg-transparent text-muted-foreground",
};

const CHIP_ICON: Record<CellChip["kind"], typeof AlertTriangle> = {
  allergen: AlertTriangle,
  dislike: Frown,
  goTo: Star,
  tryBite: Sparkles,
  history: Utensils,
};

/* ------------------------------------------------------------------------ */
/* One cell                                                                  */
/* ------------------------------------------------------------------------ */

interface CellProps {
  day: DayColumn;
  slot: MealSlot;
  slotLabel: string;
  cell: FamilyCell;
  days: DayColumn[];
  canLog: boolean;
  foodById: ReadonlyMap<string, Food>;
  recipeById: ReadonlyMap<string, Recipe>;
  dragEnabled: boolean;
  onTapAdd: (date: string, slot: MealSlot, kidId?: string) => void;
  onTapChangeFamilyMeal: (date: string, slot: MealSlot) => void;
  onTapKidSubstitute: (date: string, slot: MealSlot, kidId: string) => void;
  onDeleteEntries: (ids: string[]) => void;
  onMoveEntries: (ids: string[], date: string, slot: MealSlot) => void;
  onMarkResult: (entry: PlanEntry, result: MealOutcome) => void;
  onOpenMissingForRecipe?: (recipeId: string) => void;
}

/** Drag payload: the cell a drag started from ("date|slot"). */
const PLAN_FROM_MIME = "application/x-eatpal-plan-from";

const FamilyGridCell = memo(function FamilyGridCell({
  day,
  slot,
  slotLabel,
  cell,
  days,
  canLog,
  foodById,
  recipeById,
  dragEnabled,
  onTapAdd,
  onTapChangeFamilyMeal,
  onTapKidSubstitute,
  onDeleteEntries,
  onMoveEntries,
  onMarkResult,
  onOpenMissingForRecipe,
}: CellProps) {
  const { t } = useTranslation();
  const [dropping, setDropping] = useState(false);
  const isTryBite = slot === "try_bite";
  const { group, lines } = cell;
  const isEmpty = lines.every((l) => l.status === "unplanned");

  const nameOf = (key: string | null): string =>
    (key && (recipeById.get(key)?.name ?? foodById.get(key)?.name)) ||
    t("planner.mobile.unknownMeal", { defaultValue: "Unknown meal" });

  const startDrag = (ids: string[]) => (e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    e.dataTransfer.setData(PLAN_IDS_MIME, JSON.stringify(ids));
    // The source cell, so a drop back where it started is not a move.
    e.dataTransfer.setData(PLAN_FROM_MIME, `${day.date}|${slot}`);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragEnabled || !e.dataTransfer.types.includes(PLAN_IDS_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dropping) setDropping(true);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDropping(false);
    const ids = readDraggedIds(e.dataTransfer.getData(PLAN_IDS_MIME));
    if (!ids) return;
    e.preventDefault();
    // An aborted drag dropped on its own cell: no write, no "Moved" toast.
    if (e.dataTransfer.getData(PLAN_FROM_MIME) === `${day.date}|${slot}`) return;
    onMoveEntries(ids, day.date, slot);
  };

  /** "Move to" another day, same slot: the keyboard path for a drag. */
  const moveMenu = (ids: string[]) => (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {t("planner.familyGrid.moveTo", { defaultValue: "Move to" })}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {days
          .filter((d) => d.date !== day.date)
          .map((d) => (
            <DropdownMenuItem key={d.date} onClick={() => onMoveEntries(ids, d.date, slot)}>
              {d.long}
            </DropdownMenuItem>
          ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  const familyRecipeId = group.familyTarget?.kind === "recipe" ? group.familyTarget.id : null;
  const familyName = nameOf(group.familyKey);
  const everyoneAte =
    cell.everyoneShares && lines.every((l) => l.slot?.primary.result === "ate");

  const familyHeader =
    !isTryBite && !isEmpty && cell.familyKidIds.length > 0 ? (
      <div
        className="flex items-start gap-1"
        draggable={dragEnabled}
        onDragStart={startDrag(cell.familyRowIds)}
        data-testid={`family-dish-${day.date}-${slot}`}
      >
        {dragEnabled && (
          <GripVertical className="mt-1 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onTapChangeFamilyMeal(day.date, slot)}
          className="flex min-w-0 flex-1 items-start gap-1 text-left text-sm font-semibold leading-snug text-foreground hover:underline"
          aria-label={t("planner.familyGrid.changeFamily", {
            defaultValue: "Change family {{slot}} on {{day}}: {{name}}",
            slot: slotLabel,
            day: day.long,
            name: familyName,
          })}
        >
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="break-words">{familyName}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t("planner.familyGrid.familyActions", {
                defaultValue: "Family {{slot}} options for {{day}}",
                slot: slotLabel,
                day: day.long,
              })}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onTapChangeFamilyMeal(day.date, slot)}>
              <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("planner.familyGrid.changeFamilyShort", { defaultValue: "Change family meal" })}
            </DropdownMenuItem>
            {canLog && cell.everyoneShares && !everyoneAte && (
              <DropdownMenuItem
                onClick={() => {
                  for (const l of lines) {
                    if (l.slot && l.slot.primary.result !== "ate") onMarkResult(l.slot.primary, "ate");
                  }
                }}
              >
                <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("planner.mobile.everyoneAte", { defaultValue: "Everyone ate it" })}
              </DropdownMenuItem>
            )}
            {familyRecipeId && onOpenMissingForRecipe && (
              <DropdownMenuItem onClick={() => onOpenMissingForRecipe(familyRecipeId)}>
                {t("planner.familyGrid.checkIngredients", { defaultValue: "Check ingredients" })}
              </DropdownMenuItem>
            )}
            {moveMenu(cell.familyRowIds)}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDeleteEntries(lines.flatMap((l) => (l.slot ? l.slot.allRows.map((r) => r.id) : [])))}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("planner.mobile.removeForEveryone", { defaultValue: "Remove {{slot}} for everyone", slot: slotLabel })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ) : null;

  const kidLine = (line: KidLine) => {
    const { kid, status, slot: ks } = line;
    const chips = cellFitChips(line.fit);
    let text: ReactNode;
    if (status === "unplanned") {
      text = <span className="text-muted-foreground">{t("planner.mobile.notPlanned", { defaultValue: "Not planned" })}</span>;
    } else if (status === "family") {
      text = (
        <span className="inline-flex items-center gap-1 text-foreground">
          <Check className="h-3 w-3 text-success" aria-hidden="true" />
          {t("planner.mobile.familyMeal", { defaultValue: "Family meal" })}
        </span>
      );
    } else {
      text = <span className="break-words text-foreground">{nameOf(line.key)}</span>;
    }
    const openPicker = () =>
      isTryBite || (status === "unplanned" && group.familyKey === null)
        ? onTapAdd(day.date, slot, kid.id)
        : onTapKidSubstitute(day.date, slot, kid.id);
    const kidIds = ks ? ks.allRows.map((r) => r.id) : [];

    return (
      <li
        key={kid.id}
        className="space-y-1 py-1.5 first:pt-0 last:pb-0"
        data-testid={`family-line-${day.date}-${slot}-${kid.id}`}
        draggable={dragEnabled && !!ks}
        onDragStart={ks ? startDrag(kidIds) : undefined}
      >
        <div className="flex items-center gap-1.5">
          <Avatar className="h-6 w-6 shrink-0">
            {kid.profile_picture_url && <KidAvatarImage src={kid.profile_picture_url} alt="" />}
            <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">{initials(kid.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col text-xs leading-tight">
            <span className="sr-only">{kid.name}: </span>
            {text}
          </div>
          {ks ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  aria-label={t("planner.familyGrid.kidActions", {
                    defaultValue: "{{name}}'s {{slot}} options for {{day}}",
                    name: kid.name,
                    slot: slotLabel,
                    day: day.long,
                  })}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openPicker}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("planner.mobile.swapFor", { defaultValue: "Swap {{name}}'s {{slot}}", name: kid.name, slot: slotLabel })}
                </DropdownMenuItem>
                {moveMenu(kidIds)}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDeleteEntries(kidIds)}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("planner.mobile.removeFor", { defaultValue: "Remove {{name}}'s {{slot}}", name: kid.name, slot: slotLabel })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={openPicker}
              className={ICON_BUTTON}
              aria-label={t("planner.familyGrid.addForOn", {
                defaultValue: "Add {{slot}} for {{name}} on {{day}}",
                name: kid.name,
                slot: slotLabel,
                day: day.long,
              })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-1 pl-7" aria-label={t("planner.familyGrid.fitFor", { defaultValue: "How it fits {{name}}", name: kid.name })}>
            {chips.map((chip) => {
              const Icon = CHIP_ICON[chip.kind];
              const label = chipLabel(chip, kid.name, t);
              return (
                <li
                  key={chip.kind}
                  data-chip={chip.kind}
                  title={label}
                  className={cn(
                    "inline-flex max-w-full items-center gap-0.5 rounded-full border px-1.5 py-0 text-[11px] font-medium",
                    CHIP_CLASS[chip.kind],
                  )}
                >
                  <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </li>
              );
            })}
          </ul>
        )}
        {ks && canLog && (
          <div
            role="group"
            aria-label={t("planner.mobile.outcomeFor", { defaultValue: "How did {{name}} do?", name: kid.name })}
            className="flex gap-0.5 pl-7"
          >
            {OUTCOMES.map((result) => {
              const selected = ks.primary.result === result;
              return (
                <button
                  key={result}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onMarkResult(ks.primary, result)}
                  className={cn(
                    "min-h-6 flex-1 rounded-md border px-1 text-[11px] font-semibold",
                    selected ? OUTCOME_SELECTED[result] : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t(`planner.mobile.outcome.${result}`, { defaultValue: OUTCOME_DEFAULT_LABEL[result] })}
                </button>
              );
            })}
          </div>
        )}
      </li>
    );
  };

  return (
    <div
      role="cell"
      data-cell-date={day.date}
      data-cell-slot={slot}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      className={cn(
        "min-h-[90px] space-y-2 rounded-xl border p-2",
        isTryBite ? "border-try-bite/30 bg-try-bite/5" : "border-border bg-card",
        day.isToday && "ring-1 ring-primary/30",
        dropping && "border-primary bg-primary/5",
      )}
    >
      {isEmpty && !isTryBite ? (
        <button
          type="button"
          onClick={() => onTapAdd(day.date, slot)}
          className="flex min-h-[72px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary"
          aria-label={t("planner.familyGrid.addFamilyOn", {
            defaultValue: "Add family {{slot}} on {{day}}",
            slot: slotLabel,
            day: day.long,
          })}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("planner.mobile.addFamilyMeal", { defaultValue: "Add family meal" })}
        </button>
      ) : (
        <>
          {familyHeader}
          <ul className="divide-y divide-border">{lines.map(kidLine)}</ul>
        </>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* The week                                                                  */
/* ------------------------------------------------------------------------ */

interface FamilyWeekGridProps {
  weekStart: Date;
  planEntries: PlanEntry[];
  foods: Food[];
  recipes: Recipe[];
  kids: Kid[];
  onAddEntry: (kidId: string, date: string, slot: MealSlot, foodId: string) => void;
  onSelectRecipeForKids: (recipeId: string, date: string, slot: MealSlot, kidIds: string[]) => void;
  onReplaceSlot: (kidIds: string[], date: string, slot: MealSlot, target: SlotTarget) => void;
  onDeleteEntries: (ids: string[]) => void;
  onMoveEntries: (ids: string[], date: string, slot: MealSlot) => void;
  onMarkResult: (entry: PlanEntry, result: MealOutcome) => void;
  /** Switch the planner to one kid's detailed grid. */
  onViewKid?: (kidId: string) => void;
  onCopyWeek?: (toDate: string) => void;
  onClearWeek?: () => void;
  onOpenSaveTemplate?: () => void;
  onOpenTemplateGallery?: () => void;
  onOpenMissingForRecipe?: (recipeId: string) => void;
}

/**
 * Item 2: the desktop planner in family mode. One grid; each day and slot
 * shows the family dish and one line per kid (on it, on a substitute, or not
 * planned) with that kid's fit chips and outcome buttons. Replaces a stack of
 * one full grid per child, which made "what is everyone eating Tuesday" a
 * scroll through N grids.
 */
export const FamilyWeekGrid = memo(function FamilyWeekGrid({
  weekStart,
  planEntries,
  foods,
  recipes,
  kids,
  onAddEntry,
  onSelectRecipeForKids,
  onReplaceSlot,
  onDeleteEntries,
  onMoveEntries,
  onMarkResult,
  onViewKid,
  onCopyWeek,
  onClearWeek,
  onOpenSaveTemplate,
  onOpenTemplateGallery,
  onOpenMissingForRecipe,
}: FamilyWeekGridProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || undefined;
  const today = isoDay(new Date());

  const days = useMemo<DayColumn[]>(() => {
    const shortFmt = new Intl.DateTimeFormat(lang, { weekday: "short", month: "short", day: "numeric" });
    const longFmt = new Intl.DateTimeFormat(lang, { weekday: "long", month: "long", day: "numeric" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      const date = isoDay(d);
      return { date, short: shortFmt.format(d), long: longFmt.format(d), isToday: date === today };
    });
  }, [weekStart, lang, today]);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const buckets = useMemo(() => bucketWeek(planEntries, days.map((d) => d.date)), [planEntries, days]);
  const indexes = useMemo(() => buildKidIndexes(planEntries, kids, today), [planEntries, kids, today]);
  const cells = useMemo(() => {
    const out = new Map<string, FamilyCell>();
    for (const { slot } of MEAL_SLOTS) {
      for (const day of days) {
        const k = cellKey(day.date, slot);
        out.set(k, readFamilyCell(buckets.get(k) ?? EMPTY, slot, kids, foodById, recipeById, indexes));
      }
    }
    return out;
  }, [days, buckets, kids, foodById, recipeById, indexes]);

  const picker = useFamilySlotPicker({
    planEntries,
    kids,
    activeKidId: null,
    onAddEntry,
    onSelectRecipeForKids,
    onReplaceSlot,
  });

  const slotLabel = useCallback(
    (slot: MealSlot, fallback: string) => t(`planner.mobile.slot.${slot}`, { defaultValue: fallback }),
    [t],
  );

  return (
    <div className="space-y-4" data-testid="family-week-grid">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {onOpenTemplateGallery && (
            <Button variant="outline" size="sm" onClick={onOpenTemplateGallery}>
              <BookTemplate className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("planner.grid.useTemplate", { defaultValue: "Use template" })}
            </Button>
          )}
          {onOpenSaveTemplate && (
            <Button variant="outline" size="sm" onClick={onOpenSaveTemplate}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("planner.grid.saveTemplate", { defaultValue: "Save as template" })}
            </Button>
          )}
          {onCopyWeek && (
            <Button variant="outline" size="sm" onClick={() => onCopyWeek(isoDay(addDays(weekStart, 7)))}>
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("planner.familyGrid.copyWeek", { defaultValue: "Copy everyone to next week" })}
            </Button>
          )}
          {onClearWeek && (
            <Button variant="outline" size="sm" onClick={onClearWeek}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("planner.familyGrid.clearWeek", { defaultValue: "Clear everyone's week" })}
            </Button>
          )}
        </div>
        {onViewKid && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("planner.familyGrid.oneKid", { defaultValue: "One child's week:" })}
            </span>
            {kids.map((k) => (
              <Button key={k.id} variant="ghost" size="sm" onClick={() => onViewKid(k.id)}>
                {k.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div
          className="min-w-[1120px] p-3"
          role="table"
          aria-label={t("planner.familyGrid.tableLabel", { defaultValue: "Family meal plan" })}
        >
          <div className="mb-2 grid grid-cols-[96px_repeat(7,minmax(0,1fr))] gap-2" role="row">
            <div role="columnheader" className="flex items-center justify-center text-sm font-semibold text-muted-foreground">
              {t("planner.grid.meals", { defaultValue: "Meals" })}
            </div>
            {days.map((day) => (
              <div
                key={day.date}
                role="columnheader"
                aria-current={day.isToday ? "date" : undefined}
                className={cn("rounded-xl p-2 text-center text-sm font-bold text-foreground", day.isToday && "bg-primary/10")}
              >
                {day.short}
              </div>
            ))}
          </div>

          {MEAL_SLOTS.map(({ slot, label }) => {
            const name = slotLabel(slot, label);
            return (
              <div key={slot} className="mb-2 grid grid-cols-[96px_repeat(7,minmax(0,1fr))] gap-2" role="row">
                <div role="rowheader" className="flex items-center justify-center gap-1 rounded-xl border bg-muted/30 p-2">
                  <span className="text-sm font-semibold text-foreground">{name}</span>
                  {slot === "try_bite" && <Sparkles className="h-4 w-4 text-try-bite" aria-hidden="true" />}
                </div>
                {days.map((day) => {
                  const cell = cells.get(cellKey(day.date, slot));
                  if (!cell) return null;
                  return (
                    <FamilyGridCell
                      key={day.date}
                      day={day}
                      slot={slot}
                      slotLabel={name}
                      cell={cell}
                      days={days}
                      canLog={day.date <= today}
                      foodById={foodById}
                      recipeById={recipeById}
                      dragEnabled
                      onTapAdd={picker.tapAdd}
                      onTapChangeFamilyMeal={picker.tapChangeFamilyMeal}
                      onTapKidSubstitute={picker.tapKidSubstitute}
                      onDeleteEntries={onDeleteEntries}
                      onMoveEntries={onMoveEntries}
                      onMarkResult={onMarkResult}
                      onOpenMissingForRecipe={onOpenMissingForRecipe}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <MealQuickAddDrawer {...picker.drawer} foods={foods} recipes={recipes} kids={kids} planEntries={planEntries} />
    </div>
  );
});
