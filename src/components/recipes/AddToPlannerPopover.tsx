import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Food, Kid, MealSlot, Recipe } from "@/types";
import type { ScheduleRecipeResult } from "@/contexts/PlanContext";
import { toISODate } from "@/lib/date-utils";
import { findAllergenConflicts, isAllergyUnknown } from "@/lib/kidFit";
import {
  RECIPE_PLAN_SLOTS,
  defaultPlanSlot,
  slotLabel,
  useRecipeQuickPlan,
  type ScheduleRecipeOptions,
} from "@/hooks/useRecipeQuickPlan";
import "@/i18n/appLocale";

export type ScheduleRecipeFn = (
  recipe: Recipe,
  dateISO: string,
  slot: MealSlot,
  kidIds: string[],
  opts?: ScheduleRecipeOptions,
) => Promise<ScheduleRecipeResult>;

interface AddToPlannerPopoverProps {
  recipe: Recipe;
  kids: Kid[];
  foods: Food[];
  activeKidId?: string | null;
  trigger?: React.ReactNode;
  /**
   * Schedules the recipe. Omitted: the popover schedules through
   * useRecipeQuickPlan().schedule, which also owns the toasts and Undo.
   */
  onSchedule?: ScheduleRecipeFn;
  /** Controlled open state, for a trigger that lives outside the popover. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ADD_MISSING_KEY = "eatpal.recipes.plan.addMissing";

function readAddMissing(): boolean {
  try {
    return window.localStorage.getItem(ADD_MISSING_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAddMissing(value: boolean) {
  try {
    window.localStorage.setItem(ADD_MISSING_KEY, value ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
}

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function AddToPlannerPopover(props: AddToPlannerPopoverProps) {
  // Which branch renders depends only on whether a caller passed onSchedule,
  // which does not change for a mounted popover, so the hook order is stable.
  if (props.onSchedule) return <PlannerPopoverBody {...props} onSchedule={props.onSchedule} />;
  return <PlannerPopoverWithQuickPlan {...props} />;
}

function PlannerPopoverWithQuickPlan(props: AddToPlannerPopoverProps) {
  const { schedule } = useRecipeQuickPlan();
  return <PlannerPopoverBody {...props} onSchedule={schedule} />;
}

function PlannerPopoverBody({
  recipe,
  kids,
  foods,
  activeKidId = null,
  trigger,
  onSchedule,
  open: controlledOpen,
  onOpenChange,
}: AddToPlannerPopoverProps & { onSchedule: ScheduleRecipeFn }) {
  const { t, i18n } = useTranslation();
  const uid = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const today = useMemo(startOfToday, []);
  const [date, setDate] = useState<Date>(today);
  const [showCalendar, setShowCalendar] = useState(false);
  const [mealSlot, setMealSlot] = useState<MealSlot>(() => defaultPlanSlot());
  const [addMissing, setAddMissing] = useState<boolean>(readAddMissing);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inFlight = useRef(false);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const conflicts = useMemo(
    () => findAllergenConflicts(kids, recipe.food_ids ?? [], foodById),
    [kids, recipe.food_ids, foodById],
  );
  const conflictsByKid = useMemo(() => {
    const map = new Map<string, typeof conflicts>();
    for (const c of conflicts) {
      const list = map.get(c.kid.id) ?? [];
      list.push(c);
      map.set(c.kid.id, list);
    }
    return map;
  }, [conflicts]);

  const [selectedKids, setSelectedKids] = useState<string[]>(() => {
    const base = activeKidId && kids.some((k) => k.id === activeKidId) ? [activeKidId] : kids.map((k) => k.id);
    const blocked = new Set(conflicts.map((c) => c.kid.id));
    return base.filter((id) => !blocked.has(id));
  });

  const toggleKid = (kidId: string) => {
    setSelectedKids((prev) => (prev.includes(kidId) ? prev.filter((id) => id !== kidId) : [...prev, kidId]));
  };

  const dayChips = useMemo(() => {
    const weekday = (() => {
      try {
        return new Intl.DateTimeFormat(i18n.language || undefined, { weekday: "short" });
      } catch {
        return new Intl.DateTimeFormat(undefined, { weekday: "short" });
      }
    })();
    const chips: { key: string; date: Date; label: string }[] = [
      {
        key: "today",
        date: today,
        label:
          mealSlot === "dinner"
            ? t("recipes.plan.tonight", { defaultValue: "Tonight" })
            : t("recipes.plan.today", { defaultValue: "Today" }),
      },
      { key: "tomorrow", date: plusDays(today, 1), label: t("recipes.plan.tomorrow", { defaultValue: "Tomorrow" }) },
    ];
    for (let i = 2; i < 7; i++) {
      const d = plusDays(today, i);
      chips.push({ key: `d${i}`, date: d, label: weekday.format(d) });
    }
    return chips;
  }, [today, mealSlot, t, i18n.language]);

  const selectedKey = toISODate(date);
  const onChip = dayChips.some((c) => toISODate(c.date) === selectedKey);

  const run = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      // US-818: the calendar picker hands back LOCAL midnight, and
      // toISOString() converted that to the previous day for every user west
      // of Greenwich -- pick Tuesday, get Monday on the planner.
      const dateStr = toISODate(date);
      const res = await onSchedule(recipe, dateStr, mealSlot, selectedKids, { addMissing });
      if (res.succeeded.length > 0) setOpen(false);
    } catch {
      toast.error(t("planner.toasts.recipeFailed", { defaultValue: "Couldn't plan {{name}}. Please try again.", name: recipe.name }));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const selectedConflicts = conflicts.filter((c) => selectedKids.includes(c.kid.id));

  const handleSubmit = () => {
    if (inFlight.current) return;
    if (selectedKids.length === 0) {
      toast.error(t("recipes.plan.pickChild", { defaultValue: "Pick at least one child" }));
      return;
    }
    if (selectedConflicts.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void run();
  };

  const slotName = (slot: MealSlot) => slotLabel(t, slot);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarPlus className="h-4 w-4" />
              {t("recipes.plan.addToPlanner", { defaultValue: "Add to Planner" })}
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(22rem,calc(100vw-2rem))] max-h-[80vh] overflow-y-auto p-4"
          align="start"
        >
          <div className="space-y-4">
            <h4 className="font-medium text-sm">
              {t("recipes.plan.title", { defaultValue: "Plan \"{{name}}\"", name: recipe.name })}
            </h4>

            {/* Day */}
            <div className="space-y-1.5" role="group" aria-labelledby={`${uid}-day`}>
              <p id={`${uid}-day`} className="text-xs font-medium text-muted-foreground">
                {t("recipes.plan.day", { defaultValue: "Day" })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dayChips.map((chip) => {
                  const active = toISODate(chip.date) === selectedKey;
                  return (
                    <Button
                      key={chip.key}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      className="h-9 px-3 text-xs"
                      onClick={() => {
                        setDate(chip.date);
                        setShowCalendar(false);
                      }}
                    >
                      {chip.label}
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant={!onChip ? "default" : "outline"}
                  aria-expanded={showCalendar}
                  className="h-9 px-3 text-xs"
                  onClick={() => setShowCalendar((v) => !v)}
                >
                  {!onChip
                    ? new Intl.DateTimeFormat(i18n.language || undefined, { month: "short", day: "numeric" }).format(date)
                    : t("recipes.plan.pickDate", { defaultValue: "Pick a date" })}
                </Button>
              </div>
              {showCalendar && (
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) {
                      setDate(d);
                      setShowCalendar(false);
                    }
                  }}
                  disabled={{ before: today }}
                  fromDate={today}
                  className="rounded-md border"
                />
              )}
            </div>

            {/* Meal slot */}
            <div className="space-y-1.5">
              <p id={`${uid}-slot`} className="text-xs font-medium text-muted-foreground">
                {t("recipes.plan.meal", { defaultValue: "Meal" })}
              </p>
              <div role="radiogroup" aria-labelledby={`${uid}-slot`} className="flex flex-wrap gap-1.5">
                {RECIPE_PLAN_SLOTS.map((slot) => {
                  const active = mealSlot === slot;
                  return (
                    <Button
                      key={slot}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className="h-9 px-3 text-xs"
                      onClick={() => setMealSlot(slot)}
                    >
                      {slotName(slot)}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Kids */}
            {kids.length > 0 && (
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium text-muted-foreground">
                  {t("recipes.plan.for", { defaultValue: "For" })}
                </legend>
                <div className="space-y-1">
                  {kids.map((kid) => {
                    const hits = conflictsByKid.get(kid.id) ?? [];
                    const allergens = [...new Set(hits.map((h) => h.allergen))];
                    const unknown = hits.length === 0 && isAllergyUnknown(kid);
                    const inputId = `${uid}-kid-${kid.id}`;
                    return (
                      <div key={kid.id} className="flex min-h-[44px] items-center gap-3">
                        <Checkbox
                          id={inputId}
                          checked={selectedKids.includes(kid.id)}
                          onCheckedChange={() => toggleKid(kid.id)}
                          aria-describedby={hits.length > 0 || unknown ? `${inputId}-note` : undefined}
                        />
                        <label htmlFor={inputId} className="flex flex-1 cursor-pointer flex-col text-sm">
                          <span>{kid.name}</span>
                          {hits.length > 0 && (
                            <span id={`${inputId}-note`} className="flex items-center gap-1 text-xs text-destructive">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {t("recipes.fit.allergy", {
                                defaultValue: "Allergy: {{allergen}}",
                                allergen: allergens.join(", "),
                              })}
                            </span>
                          )}
                          {unknown && (
                            <span id={`${inputId}-note`} className="text-xs text-muted-foreground">
                              {t("recipes.fit.unknown", { defaultValue: "Allergy info not checked" })}
                            </span>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="flex min-h-[44px] items-center gap-3">
              <Checkbox
                id={`${uid}-missing`}
                checked={addMissing}
                onCheckedChange={(v) => {
                  const next = v === true;
                  setAddMissing(next);
                  writeAddMissing(next);
                }}
              />
              <label htmlFor={`${uid}-missing`} className="cursor-pointer text-sm">
                {t("recipes.plan.alsoAddMissing", { defaultValue: "Also add missing to grocery" })}
              </label>
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              className="h-11 w-full gap-2"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
              {t("recipes.plan.submit", {
                defaultValue: "Plan for {{day}} {{slot}}",
                day: dayChips.find((c) => toISODate(c.date) === selectedKey)?.label ??
                  new Intl.DateTimeFormat(i18n.language || undefined, { month: "short", day: "numeric" }).format(date),
                slot: slotName(mealSlot),
              })}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              {t("planner.confirm.allergenTitle", { defaultValue: "Allergen warning" })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                {selectedConflicts.map((c) => (
                  <p key={`${c.kid.id}-${c.food.id}-${c.allergen}`}>
                    {t("planner.confirm.allergenLine", {
                      defaultValue: "{{food}} contains {{allergen}}, which {{name}} is allergic to.",
                      food: c.food.name,
                      allergen: c.allergen,
                      name: c.kid.name,
                    })}
                  </p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("planner.actions.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmOpen(false);
                void run();
              }}
            >
              {t("planner.actions.addAnyway", { defaultValue: "Add anyway" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
