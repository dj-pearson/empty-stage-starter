import { useCallback, useRef, useState } from "react";
import type { Kid, MealSlot, PlanEntry } from "@/types";
import type { SlotTarget } from "@/contexts/PlanContext";
import { groupSlot, kidsOnFamilyMeal, type FamilyTarget } from "@/lib/familySlot";
import type { MealQuickAddContext } from "./MealQuickAddDrawer";

function toSlotTarget(target: FamilyTarget): SlotTarget {
  return target.kind === "recipe" ? { recipeId: target.id } : { foodId: target.id };
}

export interface FamilySlotPickerOptions {
  planEntries: PlanEntry[];
  kids: Kid[];
  /** The kid the planner shows, or null for the whole family. */
  activeKidId: string | null;
  /** Plain add into an empty slot for one kid. */
  onAddEntry: (kidId: string, date: string, slot: MealSlot, foodId: string) => void;
  /** One call for every kid, so one allergen check and one toast. */
  onSelectRecipeForKids: (recipeId: string, date: string, slot: MealSlot, kidIds: string[]) => void;
  /** Empty (kid, date, slot) for each kid and put one food or recipe there. */
  onReplaceSlot: (kidIds: string[], date: string, slot: MealSlot, target: SlotTarget) => void;
}

/**
 * The family-slot picker the phone day view and the desktop family grid share
 * (item 2): which kids a tap acts on, and what a pick in MealQuickAddDrawer
 * writes. One implementation, so "change the family dinner" and "swap Leo's
 * dinner" mean the same thing on both screens.
 *
 * - Add: an empty slot. A kid id targets one kid; otherwise the whole family.
 * - Change family meal: the kids currently on the family dish (a kid on a
 *   substitute keeps it).
 * - Substitute: one kid, with "Eat with family" offered back.
 *
 * Handlers read the latest plan through a ref so they keep one identity and
 * memoized cells are not re-rendered on every realtime tick.
 */
export function useFamilySlotPicker({
  planEntries,
  kids,
  activeKidId,
  onAddEntry,
  onSelectRecipeForKids,
  onReplaceSlot,
}: FamilySlotPickerOptions) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<MealQuickAddContext | null>(null);

  const singleKidMode = activeKidId !== null;
  const latest = useRef({ planEntries, kids, singleKidMode, activeKidId });
  latest.current = { planEntries, kids, singleKidMode, activeKidId };

  const rowsFor = useCallback((date: string, slot: MealSlot, kidIds: readonly string[]) => {
    const set = new Set(kidIds);
    return latest.current.planEntries.filter(
      (e) => e.date === date && e.meal_slot === slot && set.has(e.kid_id),
    );
  }, []);

  // --- Openers ---

  const tapAdd = useCallback((date: string, slot: MealSlot, kidId?: string) => {
    const { singleKidMode: single, activeKidId: active } = latest.current;
    setContext({
      date,
      slot,
      kidId: kidId ?? (single && active ? active : undefined),
      mode: "add",
    });
    setOpen(true);
  }, []);

  const tapChangeFamilyMeal = useCallback((date: string, slot: MealSlot) => {
    const { singleKidMode: single, activeKidId: active, kids: allKids, planEntries: all } = latest.current;
    if (single && active) {
      setContext({ date, slot, kidId: active, mode: "change" });
    } else {
      const group = groupSlot(all.filter((e) => e.date === date && e.meal_slot === slot));
      const ids = allKids.map((k) => k.id);
      // Change what the family is eating; a kid on a substitute keeps it.
      const onFamily = kidsOnFamilyMeal(group, ids);
      setContext({
        date,
        slot,
        kidId: allKids.length === 1 ? allKids[0].id : undefined,
        kidIds: onFamily.length > 0 ? onFamily : ids,
        familyTarget: group.familyTarget ?? undefined,
        mode: "change",
      });
    }
    setOpen(true);
  }, []);

  const tapKidSubstitute = useCallback((date: string, slot: MealSlot, kidId: string) => {
    const group = groupSlot(latest.current.planEntries.filter((e) => e.date === date && e.meal_slot === slot));
    setContext({
      date,
      slot,
      kidId,
      familyTarget: group.familyTarget ?? undefined,
      mode: "substitute",
    });
    setOpen(true);
  }, []);

  // --- Results ---

  const onSelectFood = useCallback(
    (foodId: string, ctx: MealQuickAddContext, kidIds: string[]) => {
      if (kidIds.length === 0) return;
      const existing = rowsFor(ctx.date, ctx.slot, kidIds);
      if (kidIds.length === 1 && existing.length === 0) {
        onAddEntry(kidIds[0], ctx.date, ctx.slot, foodId);
        return;
      }
      onReplaceSlot(kidIds, ctx.date, ctx.slot, { foodId });
    },
    [rowsFor, onAddEntry, onReplaceSlot],
  );

  const onSelectRecipe = useCallback(
    (recipeId: string, ctx: MealQuickAddContext, kidIds: string[]) => {
      if (kidIds.length === 0) return;
      if (rowsFor(ctx.date, ctx.slot, kidIds).length === 0) {
        onSelectRecipeForKids(recipeId, ctx.date, ctx.slot, kidIds);
        return;
      }
      onReplaceSlot(kidIds, ctx.date, ctx.slot, { recipeId });
    },
    [rowsFor, onSelectRecipeForKids, onReplaceSlot],
  );

  // "Eat with family": put the kid back on the family dish, recipe and all.
  const onEatWithFamily = useCallback(
    (ctx: MealQuickAddContext) => {
      if (!ctx.kidId || !ctx.familyTarget) return;
      onReplaceSlot([ctx.kidId], ctx.date, ctx.slot, toSlotTarget(ctx.familyTarget));
    },
    [onReplaceSlot],
  );

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setContext(null);
  }, []);

  return {
    tapAdd,
    tapChangeFamilyMeal,
    tapKidSubstitute,
    drawer: {
      open,
      context,
      onOpenChange,
      onSelectFood,
      onSelectRecipeForKids: onSelectRecipe,
      onEatWithFamily,
    },
  };
}
