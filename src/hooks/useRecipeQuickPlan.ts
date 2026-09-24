/**
 * Recipe -> plan (and optionally -> grocery list), for the Recipes screen
 * (contract 4).
 *
 * One path for every "plan this" button on the Recipes screen: the detail
 * sheet's Plan popover, a card's quick plan, and "Plan tonight". Scheduling
 * goes through PlanContext.scheduleRecipe, which is idempotent per
 * (kid, date, slot, recipe) and returns the rows it wrote, so Undo deletes
 * exactly those rows and "Add N to list" pushes exactly those rows through
 * usePlanToGrocery.
 */

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { useFoods, useGrocery, useKids, usePlan } from "@/contexts/AppContext";
import type { ScheduleRecipeResult } from "@/contexts/PlanContext";
import { usePlanToGrocery } from "@/hooks/usePlanToGrocery";
import { countUncheckedIngredients, getKidRecipeFit, isAllergyUnknown, type ItemFit } from "@/lib/kidFit";
import { addIsoDays, parseIsoDate, toISODate } from "@/lib/date-utils";
import type { Kid, MealSlot, Recipe } from "@/types";
import "@/i18n/appLocale";

/** Every planner slot, in the planner's order. */
export const RECIPE_PLAN_SLOTS: readonly MealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack1",
  "snack2",
  "try_bite",
];

export const SLOT_DEFAULT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack1: "Snack 1",
  snack2: "Snack 2",
  try_bite: "Try Bite",
};

/** Dinner once the afternoon is on; lunch before that. */
export function defaultPlanSlot(now: Date = new Date()): MealSlot {
  return now.getHours() >= 14 ? "dinner" : "lunch";
}

/** The planner's own label for a slot, never the raw slot id. */
export function slotLabel(t: TFunction, slot: MealSlot): string {
  return t(`planner.mobile.slot.${slot}`, { defaultValue: SLOT_DEFAULT_LABELS[slot] });
}

/** "Thursday" for a YYYY-MM-DD key, in the UI language. */
export function weekdayLabel(dateISO: string, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale || undefined, { weekday: "long" }).format(
      parseIsoDate(dateISO),
    );
  } catch {
    return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(parseIsoDate(dateISO));
  }
}

/**
 * A kid's allergy data is unknown when the profile came from the redacted
 * offline cache (no `allergens` field at all), or when the kid has allergies
 * and some of the recipe's ingredients could not be resolved to a food.
 * Unknown is never "safe".
 */
export function isKidAllergyUnknown(kid: Pick<Kid, "allergens">, uncheckedIngredients: number): boolean {
  if (isAllergyUnknown(kid)) return true;
  return (kid.allergens?.length ?? 0) > 0 && uncheckedIngredients > 0;
}

const joinNames = (names: string[]): string => names.join(", ");

export interface ScheduleRecipeOptions {
  /** Add what the meal is missing to the grocery list without asking. */
  addMissing?: boolean;
}

export function useRecipeQuickPlan() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { planEntries, scheduleRecipe, deletePlanEntries } = usePlan();
  const { kids } = useKids();
  const { foods } = useFoods();
  const { preview, push } = usePlanToGrocery();
  const { deleteGroceryItems, updateGroceryItem } = useGrocery();

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const kidName = useCallback(
    (id: string) => kids.find((k) => k.id === id)?.name ?? id,
    [kids],
  );

  const schedule = useCallback(
    async (
      recipe: Recipe,
      dateISO: string,
      slot: MealSlot,
      kidIds: string[],
      opts?: ScheduleRecipeOptions,
    ): Promise<ScheduleRecipeResult> => {
      // The RPC deletes and re-inserts a recipe's rows for the slot, so a kid
      // who already had this recipe here comes back with fresh row ids. Undo
      // must not delete that kid's meal: it was planned before this tap.
      const alreadyPlanned = new Set(
        planEntries
          .filter((e) => e.recipe_id === recipe.id && e.date === dateISO && e.meal_slot === slot)
          .map((e) => e.kid_id),
      );
      const res = await scheduleRecipe(recipe.id, dateISO, slot, kidIds);
      const rows = res.rows ?? [];
      const undoIds = rows.filter((r) => !alreadyPlanned.has(r.kid_id)).map((r) => r.id);

      if (res.succeeded.length === 0) {
        toast.error(t("planner.toasts.recipeFailed", { defaultValue: "Couldn't plan {{name}}. Please try again.", name: recipe.name }));
        return res;
      }

      const where = t("recipes.plan.when", {
        defaultValue: "{{day}} {{slot}}",
        day: weekdayLabel(dateISO, i18n.language),
        slot: slotLabel(t, slot),
      });
      const title =
        res.failed.length > 0
          ? t("planner.toasts.recipePartial", {
              defaultValue: "{{name}} planned for {{succeeded}}, failed for {{failed}}",
              name: recipe.name,
              succeeded: joinNames(res.succeeded.map(kidName)),
              failed: joinNames(res.failed.map(kidName)),
            })
          : t("planner.toasts.recipeScheduled", {
              defaultValue: res.succeeded.length === 1 ? "{{name}} planned for {{count}} child" : "{{name}} planned for {{count}} children",
              name: recipe.name,
              count: res.succeeded.length,
            });

      const show = res.failed.length > 0 ? toast.warning : toast.success;
      show(title, {
        description: where,
        action: {
          label: t("planner.actions.undo", { defaultValue: "Undo" }),
          onClick: () => {
            if (undoIds.length > 0) void deletePlanEntries(undoIds);
          },
        },
        cancel: {
          label: t("recipes.plan.openPlanner", { defaultValue: "Open planner" }),
          onClick: () => navigate(`/dashboard/planner?date=${dateISO}`),
        },
      });

      // Follow-up: the ingredients this meal needs that are neither in the
      // pantry nor on the list yet. Offered as an action, or added straight
      // away when the caller asked for it.
      if (rows.length > 0) {
        const window = { from: dateISO, to: dateISO };
        const pushOpts = { kidIds: res.succeeded };
        const addMissing = () => {
          const out = push(rows, window, pushOpts);
          if (out.added === 0) return;
          toast.success(
            t("planner.toasts.pushedToList", {
              defaultValue: out.added === 1 ? "Added {{count}} item to your list" : "Added {{count}} items to your list",
              count: out.added,
            }),
            {
              action: {
                label: t("planner.actions.undo", { defaultValue: "Undo" }),
                onClick: () => {
                  // insertedIds is known when push returns: the ids are minted on the client.
                  if (out.insertedIds.length > 0) deleteGroceryItems([...out.insertedIds]);
                  // Rows already on the list had their quantity bumped; put it back.
                  for (const bump of out.bumps) updateGroceryItem(bump.id, bump.prev);
                },
              },
            },
          );
        };
        const { toAdd } = preview(rows, window, pushOpts);
        if (toAdd > 0 && opts?.addMissing) {
          addMissing();
        } else if (toAdd > 0) {
          toast(
            t("recipes.plan.missingPrompt", {
              defaultValue: toAdd === 1 ? "{{count}} ingredient isn't on your list" : "{{count}} ingredients aren't on your list",
              count: toAdd,
            }),
            {
              action: {
                label: t("recipes.plan.addMissing", { defaultValue: "Add {{count}} to list", count: toAdd }),
                onClick: addMissing,
              },
            },
          );
        }
      }

      return res;
    },
    [planEntries, scheduleRecipe, deletePlanEntries, preview, push, deleteGroceryItems, updateGroceryItem, navigate, t, i18n.language, kidName],
  );

  const planTonight = useCallback(
    async (recipe: Recipe, fit?: ItemFit): Promise<void> => {
      if (kids.length === 0) {
        toast.error(t("recipes.plan.noKids", { defaultValue: "Add a child first to plan meals" }));
        return;
      }
      const now = new Date();
      const today = toISODate(now);
      const dateISO = now.getHours() >= 16 ? addIsoDays(today, 1) : today;

      const allergenIds = new Set<string>();
      const allergenByKid = new Map<string, string>();
      for (const hit of fit?.allergenKids ?? []) {
        allergenIds.add(hit.kid.id);
        if (hit.fit.allergen) allergenByKid.set(hit.kid.id, hit.fit.allergen);
      }
      // Re-check against the live profile: a caller's fit may be stale, and
      // no caller at all still must not plan a peanut dish for the peanut kid.
      for (const kid of kids) {
        const kidFit = getKidRecipeFit(kid, recipe, foodById, planEntries);
        if (kidFit.allergen) {
          allergenIds.add(kid.id);
          allergenByKid.set(kid.id, kidFit.allergen);
        }
      }
      const unchecked = Math.max(fit?.unchecked ?? 0, countUncheckedIngredients(recipe, foodById));
      const unknownIds = new Set(
        kids.filter((k) => !allergenIds.has(k.id) && isKidAllergyUnknown(k, unchecked)).map((k) => k.id),
      );

      const eligible = kids.filter((k) => !allergenIds.has(k.id) && !unknownIds.has(k.id));
      const skippedAllergen = kids.filter((k) => allergenIds.has(k.id));
      const skippedUnknown = kids.filter((k) => unknownIds.has(k.id));

      const reasons: string[] = [];
      if (skippedAllergen.length > 0) {
        reasons.push(
          t("recipes.plan.skippedAllergen", {
            defaultValue: "Skipped {{names}} (allergy)",
            names: joinNames(
              skippedAllergen.map((k) => {
                const a = allergenByKid.get(k.id);
                return a ? `${k.name}: ${a}` : k.name;
              }),
            ),
          }),
        );
      }
      if (skippedUnknown.length > 0) {
        reasons.push(
          t("recipes.plan.skippedUnknown", {
            defaultValue: "Skipped {{names}} (allergy info not checked)",
            names: joinNames(skippedUnknown.map((k) => k.name)),
          }),
        );
      }

      if (eligible.length === 0) {
        toast.error(t("recipes.plan.nobodyEligible", { defaultValue: "Couldn't plan {{name}} for anyone", name: recipe.name }), {
          description: reasons.join(". "),
        });
        return;
      }

      const res = await schedule(recipe, dateISO, "dinner", eligible.map((k) => k.id));
      if (res.succeeded.length > 0 && reasons.length > 0) {
        toast.info(reasons.join(". "));
      }
    },
    [kids, foodById, planEntries, schedule, t],
  );

  return { schedule, planTonight };
}
