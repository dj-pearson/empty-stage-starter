/**
 * Log how a cooked recipe went, per kid, through the plan (item 9).
 *
 * For each kid the parent answered for:
 *   1. today's plan entry for this recipe, if there is one, gets the result;
 *   2. otherwise the recipe is scheduled for today's current meal slot through
 *      PlanContext.scheduleRecipe, and the new primary row gets the result.
 * Scheduling applies the planner's allergen gate: a kid with an allergen hit
 * or unchecked allergy data is not planned, so their answer is not logged
 * (they are reported as blocked). Every result goes through performQuickLog,
 * which also moves the exposure ladder.
 *
 * Undo puts each existing entry's result and amount back and deletes the rows
 * this call scheduled.
 */
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useFoods, useKids, usePlan } from "@/contexts/AppContext";
import { performQuickLog, slotForTime, type QuickLogResult } from "@/lib/quickLog";
import { cookLogGate, findTodayRecipeEntry, primaryForKid, type CookLogGate } from "@/lib/recipeCookLog";
import { toISODate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import type { AmountEaten, MealResult, PlanEntry, Recipe } from "@/types";
import "@/i18n/appLocale";

export interface CookLogChoice {
  kidId: string;
  result: QuickLogResult;
}

interface Restore {
  entryId: string;
  result: MealResult;
  amount_eaten: AmountEaten | null;
  touchedAmount: boolean;
}

export interface CookLogOutcome {
  /** Kids whose result was saved. */
  logged: string[];
  /** Kids the allergen gate kept off the plan, with why. */
  blocked: Array<{ kidId: string; gate: CookLogGate }>;
  /** Kids whose schedule or save failed. */
  failed: string[];
  /** Plan rows this call created (deleted again by undo). */
  createdIds: string[];
  undo: () => Promise<void>;
}

export function useRecipeCookLog() {
  const { t } = useTranslation();
  const { planEntries, scheduleRecipe, updatePlanEntry, deletePlanEntries } = usePlan();
  const { kids } = useKids();
  const { foods } = useFoods();
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const planRef = useRef(planEntries);
  planRef.current = planEntries;

  /** Which kids would need a new plan entry, and which of those the gate stops. */
  const preview = useCallback(
    (recipe: Recipe, now: Date = new Date()) => {
      const todayKey = toISODate(now);
      return kids.map((kid) => {
        const entry = findTodayRecipeEntry(planRef.current, recipe.id, kid.id, todayKey, now);
        const gate = entry ? null : cookLogGate(kid, recipe, foodById, planRef.current);
        return { kid, entry, gate };
      });
    },
    [kids, foodById],
  );

  const logCooked = useCallback(
    async (recipe: Recipe, choices: readonly CookLogChoice[], now: Date = new Date()): Promise<CookLogOutcome> => {
      const todayKey = toISODate(now);
      const slot = slotForTime(now);
      const kidById = new Map(kids.map((k) => [k.id, k]));
      const blocked: CookLogOutcome["blocked"] = [];
      const failed: string[] = [];
      const logged: string[] = [];
      const restores: Restore[] = [];
      let createdIds: string[] = [];

      const targets = new Map<string, PlanEntry>();
      const toSchedule: string[] = [];
      for (const choice of choices) {
        const kid = kidById.get(choice.kidId);
        if (!kid) continue;
        const entry = findTodayRecipeEntry(planRef.current, recipe.id, kid.id, todayKey, now);
        if (entry) {
          targets.set(kid.id, entry);
          continue;
        }
        const gate = cookLogGate(kid, recipe, foodById, planRef.current);
        if (gate) blocked.push({ kidId: kid.id, gate });
        else toSchedule.push(kid.id);
      }

      if (toSchedule.length > 0) {
        const res = await scheduleRecipe(recipe.id, todayKey, slot, toSchedule);
        const rows = res.rows ?? [];
        createdIds = rows.map((r) => r.id);
        for (const kidId of toSchedule) {
          const primary = res.succeeded.includes(kidId) ? primaryForKid(rows, kidId) : undefined;
          if (primary) targets.set(kidId, primary);
          else failed.push(kidId);
        }
      }
      const created = new Set(createdIds);

      for (const choice of choices) {
        const entry = targets.get(choice.kidId);
        if (!entry) continue;
        const outcome = await performQuickLog({
          meals: [{ id: entry.id, label: recipe.name, notes: entry.notes, amount_eaten: entry.amount_eaten }],
          result: choice.result,
          mealId: entry.id,
          save: (id, patch) => updatePlanEntry(id, patch),
        });
        if (outcome.status === "saved") {
          logged.push(choice.kidId);
          if (!created.has(entry.id)) {
            restores.push({
              entryId: entry.id,
              result: entry.result ?? null,
              amount_eaten: entry.amount_eaten ?? null,
              touchedAmount: "amount_eaten" in outcome.patch,
            });
          }
        } else {
          failed.push(choice.kidId);
        }
      }

      const undo = async () => {
        try {
          for (const r of restores) {
            const patch: Partial<PlanEntry> = { result: r.result };
            if (r.touchedAmount) patch.amount_eaten = r.amount_eaten;
            await updatePlanEntry(r.entryId, patch);
          }
          if (createdIds.length > 0) await deletePlanEntries(createdIds);
        } catch (error) {
          logger.error("Undo of a cooked-recipe log failed:", error);
          toast.error(t("recipes.cooked.undoFailed", { defaultValue: "Couldn't undo that. Check today in the planner." }));
        }
      };

      return { logged, blocked, failed, createdIds, undo };
    },
    [kids, foodById, scheduleRecipe, updatePlanEntry, deletePlanEntries, t],
  );

  return { preview, logCooked };
}
