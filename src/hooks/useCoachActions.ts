/**
 * The one-tap actions under a coach reply: Try bite, Add to ladder, Add to
 * grocery. Each resolves to a real household food (extractMentionedFoods) and
 * goes through the planner's allergen guard (resolveCoachActions) when the
 * chips are built, and again at tap time against the current foods, so a food
 * whose allergens were edited in between cannot slip through on a stale chip.
 *
 * Writes go through the same context calls the planner and grocery screens
 * use, and every successful write offers Undo. A second tap on a chip that is
 * in flight or already done does nothing.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGrocery, usePlan } from "@/contexts/AppContext";
import type { LadderRow } from "@/hooks/useFoodLadder";
import { addIsoDays, toISODate } from "@/lib/date-utils";
import {
  extractMentionedFoods,
  pickNextOpenSlot,
  resolveCoachActions,
  type CoachAction,
} from "@/lib/coachReply";
import { kidAllergyState } from "@/lib/kidAllergenChips";
import { logger } from "@/lib/logger";
import type { Food, Kid, PlanEntry } from "@/types";
import "@/i18n/appLocale";

export interface UseCoachActionsArgs {
  kid: Kid | null;
  foods: Food[];
  planEntries: PlanEntry[];
  ladderRows: LadderRow[];
  addFoodToLadder: (foodId: string, paired?: string | null, kidId?: string) => Promise<boolean>;
}

export interface UseCoachActionsResult {
  actionsFor(text: string): CoachAction[];
  run(action: CoachAction): Promise<void>;
  pending: Set<string>;
  done: Set<string>;
}

/** How far ahead a food counts as "already planned" for the try-bite chip. */
const PLANNED_WINDOW_DAYS = 7;

function withKey(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  next.add(key);
  return next;
}

function withoutKey(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  next.delete(key);
  return next;
}

/** "today" / "tomorrow" in the UI language, from local calendar days. */
function relativeDay(date: string, now: Date, language: string): string {
  const diff = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${toISODate(now)}T00:00:00Z`)) / 86_400_000,
  );
  try {
    return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(diff, "day");
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(diff, "day");
  }
}

export function useCoachActions(args: UseCoachActionsArgs): UseCoachActionsResult {
  const { kid, foods, planEntries, ladderRows, addFoodToLadder } = args;
  const { t, i18n } = useTranslation();
  const { addPlanEntry, deletePlanEntries } = usePlan();
  const { mergeGroceryItems, deleteGroceryItems, updateGroceryItem } = useGrocery();

  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [done, setDone] = useState<Set<string>>(() => new Set());
  // State lags a render behind a double tap; the refs do not.
  const pendingRef = useRef<Set<string>>(new Set());
  const doneRef = useRef<Set<string>>(new Set());

  // run() reads current data through refs so a tap is checked against what
  // is true now, not what was true when the chip was drawn.
  const latest = useRef({ kid, foods, planEntries });
  latest.current = { kid, foods, planEntries };

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  const ladderFoodIds = useMemo(() => {
    const ids = new Set<string>();
    if (!kid) return ids;
    for (const row of ladderRows) if (row.kidId === kid.id) ids.add(row.foodId);
    return ids;
  }, [ladderRows, kid]);

  const plannedFoodIds = useMemo(() => {
    const ids = new Set<string>();
    if (!kid) return ids;
    const from = toISODate(new Date());
    const to = addIsoDays(from, PLANNED_WINDOW_DAYS - 1);
    for (const e of planEntries) {
      if (e.kid_id !== kid.id) continue;
      const day = String(e.date).slice(0, 10);
      if (day >= from && day <= to) ids.add(e.food_id);
    }
    return ids;
  }, [planEntries, kid]);

  const actionsFor = useCallback(
    (text: string): CoachAction[] => {
      if (!kid) return [];
      const mentioned = extractMentionedFoods(text, foods);
      if (mentioned.length === 0) return [];
      return resolveCoachActions({
        kid,
        mentioned,
        foodById,
        ladderFoodIds,
        plannedFoodIds,
        allergyState: kidAllergyState(kid),
      });
    },
    [kid, foods, foodById, ladderFoodIds, plannedFoodIds],
  );

  const finish = useCallback((key: string, succeeded: boolean) => {
    pendingRef.current.delete(key);
    setPending((prev) => withoutKey(prev, key));
    if (succeeded) {
      doneRef.current.add(key);
      setDone((prev) => withKey(prev, key));
    }
  }, []);

  const undone = useCallback((key: string) => {
    doneRef.current.delete(key);
    setDone((prev) => withoutKey(prev, key));
  }, []);

  const run = useCallback(
    async (action: CoachAction): Promise<void> => {
      const { key } = action;
      if (pendingRef.current.has(key) || doneRef.current.has(key)) return;
      if (action.status === "blocked") return;

      const { kid: currentKid, foods: currentFoods, planEntries: currentPlan } = latest.current;
      if (!currentKid) return;
      const food = currentFoods.find((f) => f.id === action.food.id);
      if (!food) {
        toast.error(t("aiCoach.actions.foodGone", { defaultValue: "That food is no longer in your list." }));
        return;
      }

      // Tap-time guard: resolve this one food again against current data, with
      // no ladder or plan exclusions so the chip's own type is always present.
      const fresh = resolveCoachActions({
        kid: currentKid,
        mentioned: [food],
        foodById: new Map(currentFoods.map((f) => [f.id, f])),
        ladderFoodIds: new Set(),
        plannedFoodIds: new Set(),
        allergyState: kidAllergyState(currentKid),
      }).find((a) => a.type === action.type);
      if (!fresh || fresh.status === "blocked") {
        toast.error(
          t("aiCoach.actions.blocked", {
            defaultValue: "Not added: {{food}} contains {{allergen}}.",
            food: food.name,
            allergen: fresh?.reason?.allergen ?? action.reason?.allergen ?? "",
          }),
        );
        return;
      }

      pendingRef.current.add(key);
      setPending((prev) => withKey(prev, key));
      const undoLabel = t("aiCoach.actions.undo", { defaultValue: "Undo" });

      try {
        if (action.type === "try_bite") {
          const now = new Date();
          const slot = pickNextOpenSlot(currentKid.id, currentPlan, now);
          const { error, insertedIds } = await addPlanEntry({
            kid_id: currentKid.id,
            food_id: food.id,
            date: slot.date,
            meal_slot: slot.meal_slot,
            result: null,
          });
          if (error) {
            finish(key, false);
            toast.error(
              t("aiCoach.actions.tryBiteFailed", {
                defaultValue: "Couldn't add {{food}} to the plan. Try again.",
                food: food.name,
              }),
            );
            return;
          }
          finish(key, true);
          toast.success(
            t("aiCoach.actions.addedTryBite", {
              defaultValue: "Added {{food}} as a try bite, {{day}} {{slot}}",
              food: food.name,
              day: relativeDay(slot.date, now, i18n.language),
              slot: t(`aiCoach.actions.slot.${slot.meal_slot}`, { defaultValue: slot.meal_slot }),
            }),
            {
              action: {
                label: undoLabel,
                onClick: () => {
                  if (insertedIds.length === 0) return;
                  void deletePlanEntries(insertedIds).then(({ error: undoError }) => {
                    if (!undoError) undone(key);
                  });
                },
              },
            },
          );
          return;
        }

        if (action.type === "ladder") {
          const ok = await addFoodToLadder(food.id, null, currentKid.id);
          finish(key, ok);
          if (!ok) {
            toast.error(
              t("aiCoach.actions.ladderFailed", {
                defaultValue: "Couldn't add {{food}} to the ladder. Try again.",
                food: food.name,
              }),
            );
            return;
          }
          toast.success(
            t("aiCoach.actions.addedLadder", { defaultValue: "Added {{food}} to the ladder", food: food.name }),
          );
          return;
        }

        const result = mergeGroceryItems([
          { name: food.name, quantity: 1, category: food.category, added_via: "ai_coach" },
        ]);
        if (result.touched === 0) {
          finish(key, false);
          toast.error(
            t("aiCoach.actions.groceryFailed", {
              defaultValue: "Couldn't add {{food}} to the grocery list.",
              food: food.name,
            }),
          );
          return;
        }
        finish(key, true);
        toast.success(
          t("aiCoach.actions.addedGrocery", { defaultValue: "Added {{food}} to the grocery list", food: food.name }),
          {
            action: {
              label: undoLabel,
              onClick: () => {
                if (result.insertedIds.length > 0) deleteGroceryItems(result.insertedIds);
                for (const bump of result.bumps) updateGroceryItem(bump.id, bump.prev);
                undone(key);
              },
            },
          },
        );
      } catch (error: unknown) {
        logger.error("Coach action failed:", error);
        finish(key, false);
        const failKey =
          action.type === "try_bite"
            ? "aiCoach.actions.tryBiteFailed"
            : action.type === "ladder"
              ? "aiCoach.actions.ladderFailed"
              : "aiCoach.actions.groceryFailed";
        toast.error(t(failKey, { defaultValue: "Couldn't add {{food}}. Try again.", food: food.name }));
      }
    },
    [
      t,
      i18n.language,
      addPlanEntry,
      deletePlanEntries,
      addFoodToLadder,
      mergeGroceryItems,
      deleteGroceryItems,
      updateGroceryItem,
      finish,
      undone,
    ],
  );

  return { actionsFor, run, pending, done };
}
