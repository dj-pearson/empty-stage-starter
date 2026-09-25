import { memo, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, ChevronRight, CircleDot, NotebookPen, ShoppingCart, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFoods, useGrocery, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { useQuickLog } from "@/contexts/QuickLogContext";
import { useDefaultGroceryListId } from "@/hooks/useDefaultGroceryListId";
import { usePlanToGrocery } from "@/hooks/usePlanToGrocery";
import { selectTargetKids, useTodayKey } from "@/hooks/useTonightPlan";
import { addIsoDays } from "@/lib/date-utils";
import { filterItemsByList } from "@/lib/groceryData";
import { performQuickLog, type QuickLogResult } from "@/lib/quickLog";
import { buildTodayPlan, lastUnloggedEntry, type TodayDish } from "@/lib/todayPlan";
import { cn } from "@/lib/utils";
import type { AmountEaten, Food, MealResult, MealSlot, PlanEntry, Recipe } from "@/types";
import "@/i18n/appLocale";

const MAX_ROWS = 3;
const NOW_TICK_MS = 60_000;

/** The wall clock, re-read every minute and when the page is shown again. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, NOW_TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

function dishLabel(
  dish: Pick<TodayDish, "recipeId" | "foodIds">,
  recipeById: ReadonlyMap<string, Recipe>,
  foodById: ReadonlyMap<string, Food>,
): string {
  const recipe = dish.recipeId ? recipeById.get(dish.recipeId) : undefined;
  if (recipe?.name) return recipe.name;
  return dish.foodIds
    .map((id) => foodById.get(id)?.name)
    .filter((n): n is string => Boolean(n))
    .join(", ");
}

/** What the entry held before a log, so Undo can put it back. */
interface PrevOutcome {
  result: MealResult;
  amount_eaten?: AmountEaten | null;
  notes?: string;
}

interface LoggedMeal {
  entryId: string;
  kidName: string;
  dish: string;
  slot: MealSlot;
  result: QuickLogResult;
  editing: boolean;
}

const RESULTS: readonly QuickLogResult[] = ["ate", "tasted", "refused"];

const RESULT_ICON = { ate: Check, tasted: CircleDot, refused: X } as const;
const RESULT_TONE: Record<QuickLogResult, string> = {
  ate: "text-safe-food",
  tasted: "text-try-bite",
  refused: "text-muted-foreground",
};

/**
 * What needs doing today, most urgent first, never more than three rows:
 * log the last meal, today's try-bite, then the week's groceries.
 */
export const TodayTasks = memo(function TodayTasks() {
  const { t } = useTranslation();
  const { kids, activeKidId, kidsHydrated } = useKids();
  const { foods, foodsHydrated } = useFoods();
  const { recipes } = useRecipes();
  const { planEntries, updatePlanEntry } = usePlan();
  const { groceryItems, deleteGroceryItems, updateGroceryItem } = useGrocery();
  const { openQuickLog } = useQuickLog();
  const { preview, push } = usePlanToGrocery();
  const defaultListId = useDefaultGroceryListId();
  const todayKey = useTodayKey();
  const now = useNow();
  const [logged, setLogged] = useState<LoggedMeal | null>(null);
  const [saving, setSaving] = useState(false);

  const targetKids = useMemo(() => selectTargetKids(kids, activeKidId), [kids, activeKidId]);
  const targetKidIds = useMemo(() => targetKids.map((k) => k.id), [targetKids]);
  const kidName = useCallback((id: string) => kids.find((k) => k.id === id)?.name ?? "", [kids]);
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const unlogged = useMemo(
    () => lastUnloggedEntry(planEntries, targetKidIds, now),
    [planEntries, targetKidIds, now],
  );

  const tryBites = useMemo(() => {
    const today = buildTodayPlan(planEntries, targetKids, todayKey);
    const out: TodayDish[] = [];
    for (const kid of targetKids) {
      const dish = today.byKid.get(kid.id)?.try_bite;
      if (dish && !dish.result) out.push(dish);
    }
    return out;
  }, [planEntries, targetKids, todayKey]);

  const week = useMemo(() => ({ from: todayKey, to: addIsoDays(todayKey, 6) }), [todayKey]);
  const groceryPreview = useMemo(
    () => preview(planEntries, week, { defaultListId }),
    // groceryItems: preview reads the list through a ref, so recompute when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, planEntries, week, defaultListId, groceryItems],
  );
  const leftToBuy = useMemo(
    () => filterItemsByList(groceryItems, defaultListId, defaultListId).filter((i) => !i.checked).length,
    [groceryItems, defaultListId],
  );

  const logResult = useCallback(
    async (entry: PlanEntry, result: QuickLogResult, meta: { kidName: string; dish: string }) => {
      if (saving) return;
      const prev: PrevOutcome = { result: entry.result, amount_eaten: entry.amount_eaten, notes: entry.notes };
      setSaving(true);
      const outcome = await performQuickLog({
        meals: [{ id: entry.id, label: meta.dish, notes: entry.notes, amount_eaten: entry.amount_eaten }],
        result,
        mealId: entry.id,
        save: (id, patch) => updatePlanEntry(id, patch),
      });
      setSaving(false);
      if (outcome.status !== "saved") {
        // updatePlanEntry rolls back and toasts a rejected write itself.
        if (outcome.status === "unknown-meal") {
          toast.error(t("home.today.logGone", { defaultValue: "That meal is no longer on the plan." }));
        }
        return;
      }
      setLogged({ entryId: entry.id, kidName: meta.kidName, dish: meta.dish, slot: entry.meal_slot, result, editing: false });
      toast.success(
        t("home.today.logged", {
          defaultValue: "Logged: {{kid}} {{result}}",
          kid: meta.kidName,
          result: t(`home.today.resultPast.${result}`, { defaultValue: result }),
        }),
        {
          action: {
            label: t("home.today.undo", { defaultValue: "Undo" }),
            onClick: () => {
              void updatePlanEntry(entry.id, {
                result: prev.result,
                amount_eaten: prev.amount_eaten ?? null,
                notes: prev.notes,
              });
              setLogged(null);
            },
          },
        },
      );
    },
    [saving, updatePlanEntry, t],
  );

  const onPushGroceries = useCallback(() => {
    const result = push(planEntries, week, { defaultListId });
    if (result.added === 0) {
      toast(t("home.today.groceriesNone", { defaultValue: "The list already has this week covered." }));
      return;
    }
    toast.success(
      t("home.today.groceriesAdded", { defaultValue: "Added {{count}} items to the grocery list", count: result.added }),
      {
        action: {
          label: t("home.today.undo", { defaultValue: "Undo" }),
          onClick: () => {
            if (result.insertedIds.length > 0) deleteGroceryItems(result.insertedIds);
            for (const bump of result.bumps) updateGroceryItem(bump.id, bump.prev);
          },
        },
      },
    );
  }, [push, planEntries, week, defaultListId, deleteGroceryItems, updateGroceryItem, t]);

  if (!(kidsHydrated && foodsHydrated) || kids.length === 0) return null;

  const slotName = (slot: MealSlot) => t(`mealSlots.${slot}`, { defaultValue: slot });
  const loggedEntry = logged ? planEntries.find((e) => e.id === logged.entryId) : undefined;

  const rows: ReactElement[] = [];

  // 1. Log the last meal (or the one just logged, as a chip that reopens the choice).
  if (logged && loggedEntry && !logged.editing) {
    const Icon = RESULT_ICON[logged.result];
    rows.push(
      <li key="log" className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={() => setLogged({ ...logged, editing: true })}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm"
          aria-label={t("home.today.changeResult", {
            defaultValue: "Change {{kid}}'s {{slot}} result",
            kid: logged.kidName,
            slot: slotName(logged.slot),
          })}
        >
          <Icon className={cn("h-4 w-4", RESULT_TONE[logged.result])} aria-hidden="true" />
          <span>
            {t("home.today.loggedChip", {
              defaultValue: "{{kid}} {{result}} {{dish}}",
              kid: logged.kidName,
              result: t(`home.today.resultPast.${logged.result}`, { defaultValue: logged.result }),
              dish: logged.dish,
            })}
          </span>
        </button>
      </li>,
    );
  } else {
    const entry = logged?.editing ? loggedEntry : unlogged?.primary;
    if (entry) {
      const kid = logged?.editing ? logged.kidName : kidName(entry.kid_id);
      const dish = logged?.editing ? logged.dish : unlogged ? dishLabel(unlogged, recipeById, foodById) : "";
      rows.push(
        <li key="log" className="space-y-2 py-2">
          <p className="text-sm">
            {t("home.today.logPrompt", {
              defaultValue: "How did {{kid}} do with {{slot}}?",
              kid,
              slot: slotName(entry.meal_slot).toLowerCase(),
            })}{" "}
            <span className="text-muted-foreground">{dish}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {RESULTS.map((r) => {
              const Icon = RESULT_ICON[r];
              return (
                <Button
                  key={r}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  className="min-h-11 min-w-11 gap-1.5"
                  onClick={() => void logResult(entry, r, { kidName: kid, dish })}
                >
                  <Icon className={cn("h-4 w-4", RESULT_TONE[r])} aria-hidden="true" />
                  {t(`home.today.result.${r}`, { defaultValue: r })}
                </Button>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={() => openQuickLog({ entryId: entry.id })}
            >
              <NotebookPen className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("home.today.addNote", { defaultValue: "Add note" })}
            </Button>
          </div>
        </li>,
      );
    }
  }

  // 2. Try-bite due today.
  if (tryBites.length > 0) {
    const names = tryBites.map((d) =>
      t("home.today.tryBiteItem", {
        defaultValue: "{{food}} for {{kid}}",
        food: dishLabel(d, recipeById, foodById),
        kid: kidName(d.kidId),
      }),
    );
    rows.push(
      <li key="try-bite" className="py-2">
        <Link
          to={`/dashboard/planner?date=${todayKey}&slot=try_bite`}
          className="flex min-h-11 items-center gap-3 text-sm"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-try-bite" aria-hidden="true" />
          <span className="flex-1">
            {t("home.today.tryBiteDue", { defaultValue: "Try-bite due: {{items}}", items: names.join(", ") })}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      </li>,
    );
  }

  // 3. Groceries for the week.
  if (groceryPreview.toAdd > 0 || leftToBuy > 0) {
    rows.push(
      <li key="grocery" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {groceryPreview.toAdd > 0 && (
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onPushGroceries}>
            {t("home.today.addWeek", {
              defaultValue: "Add {{count}} items for this week",
              count: groceryPreview.toAdd,
            })}
          </Button>
        )}
        {leftToBuy > 0 && (
          <Link
            to="/dashboard/grocery"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("home.today.leftToBuy", { defaultValue: "{{count}} left to buy", count: leftToBuy })}
          </Link>
        )}
      </li>,
    );
  }

  return (
    <section aria-labelledby="home-today-heading" className="px-1">
      <h2 id="home-today-heading" className="text-base font-semibold">
        {t("home.today.title", { defaultValue: "Today" })}
      </h2>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {t("home.today.caughtUp", { defaultValue: "All caught up" })}
        </p>
      ) : (
        <ul className="divide-y">{rows.slice(0, MAX_ROWS)}</ul>
      )}
    </section>
  );
});
