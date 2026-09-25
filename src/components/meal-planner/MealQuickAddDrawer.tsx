import { useState, useMemo, useCallback, useEffect, useId, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Food, Recipe, MealSlot, Kid, PlanEntry } from "@/types";
import {
  Search,
  ChefHat,
  Apple,
  AlertTriangle,
  Users,
  X,
  Check,
  ArrowRightLeft,
  Clock,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  buildResultIndex,
  getKidFoodFit,
  getKidRecipeFit,
  isFitSeverityRecorded,
  isSevereFit,
  summarizeKidFits as summarize,
  fitGroup as groupOf,
  type FitGroup,
  type ItemFit,
  type ResultIndex,
} from "@/lib/kidFit";
import { topSiblingMeals, type SolverResult } from "@/lib/siblingMealFinder";
import type { FamilyTarget } from "@/lib/familySlot";
import "@/i18n/appLocale";

export interface MealQuickAddContext {
  date: string;
  slot: MealSlot;
  /** If set, only this kid. If not, a family action over `kidIds` (or every kid). */
  kidId?: string;
  /** Kids a family action applies to. Defaults to every kid. */
  kidIds?: string[];
  /** The dish the family is eating, for "Eat with family" and its label. */
  familyTarget?: FamilyTarget;
  mode: "add" | "change" | "substitute";
}

interface MealQuickAddDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: MealQuickAddContext | null;
  foods: Food[];
  recipes: Recipe[];
  kids: Kid[];
  /** Plan history: drives try counts, "last time" and the Recent row. */
  planEntries?: PlanEntry[];
  onSelectFood: (foodId: string, context: MealQuickAddContext, kidIds: string[]) => void;
  /** Called once for the whole set of kids, never once per kid. */
  onSelectRecipeForKids: (recipeId: string, context: MealQuickAddContext, kidIds: string[]) => void;
  onEatWithFamily: (context: MealQuickAddContext) => void;
}

const SLOT_DEFAULT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack1: "Snack 1",
  snack2: "Snack 2",
  try_bite: "Try Bite",
};

const EMPTY_ENTRIES: PlanEntry[] = [];

type Tab = "foods" | "recipes";
type Group = FitGroup;

const ORDINAL_SUFFIX: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };

export function MealQuickAddDrawer({
  open,
  onOpenChange,
  context,
  foods,
  recipes,
  kids,
  planEntries = EMPTY_ENTRIES,
  onSelectFood,
  onSelectRecipeForKids,
  onEatWithFamily,
}: MealQuickAddDrawerProps) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const pressSoft = reduceMotion ? "" : "transition-transform active:scale-[0.98]";
  const uid = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("foods");
  /** An item with an allergen hit waits here for a second, deliberate tap. */
  const [pending, setPending] = useState<{ kind: "food" | "recipe"; id: string } | null>(null);

  const isTryBite = context?.slot === "try_bite";

  // A reopened drawer starts clean: the last search and tab belonged to a
  // different slot.
  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setActiveTab("foods");
    setPending(null);
  }, [open, context]);

  const kid = context?.kidId ? kids.find((k) => k.id === context.kidId) ?? null : null;
  const slotLabel = context
    ? t(`planner.mobile.slot.${context.slot}`, { defaultValue: SLOT_DEFAULT_LABELS[context.slot] })
    : "";

  const targetKids = useMemo<Kid[]>(() => {
    if (!context) return [];
    if (context.kidId) return kids.filter((k) => k.id === context.kidId);
    if (context.kidIds) return kids.filter((k) => context.kidIds!.includes(k.id));
    return kids;
  }, [context, kids]);
  const isFamilyAction = !context?.kidId && targetKids.length > 1;

  // Intl.ListFormat is outside this project's TS lib target, so "A, B and C"
  // is assembled here with a translatable conjunction.
  const names = useCallback(
    (ks: Kid[]) => {
      const list = ks.map((k) => k.name);
      if (list.length <= 1) return list[0] ?? "";
      const and = t("planner.mobile.drawer.and", { defaultValue: "and" });
      return `${list.slice(0, -1).join(", ")} ${and} ${list[list.length - 1]}`;
    },
    [t],
  );

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  // History as of the day being planned, one index per target kid.
  const indexes = useMemo(() => {
    const map = new Map<string, ResultIndex>();
    if (!open || !context) return map;
    for (const k of targetKids) map.set(k.id, buildResultIndex(planEntries, k.id, context.date));
    return map;
  }, [open, context, targetKids, planEntries]);

  const scoreFood = useCallback(
    (food: Food): ItemFit =>
      summarize(
        targetKids.map((k) => ({ kid: k, fit: getKidFoodFit(k, food, indexes.get(k.id) ?? new Map()) })),
      ),
    [targetKids, indexes],
  );
  const scoreRecipe = useCallback(
    (recipe: Recipe): ItemFit =>
      summarize(
        targetKids.map((k) => ({
          kid: k,
          fit: getKidRecipeFit(k, recipe, foodById, indexes.get(k.id) ?? new Map()),
        })),
      ),
    [targetKids, foodById, indexes],
  );

  // Scored once per open, not per keystroke.
  const foodFits = useMemo(() => {
    const map = new Map<string, ItemFit>();
    if (!open) return map;
    for (const f of foods) map.set(f.id, scoreFood(f));
    return map;
  }, [open, foods, scoreFood]);
  const recipeFits = useMemo(() => {
    const map = new Map<string, ItemFit>();
    if (!open || isTryBite) return map;
    for (const r of recipes) map.set(r.id, scoreRecipe(r));
    return map;
  }, [open, isTryBite, recipes, scoreRecipe]);

  const title = useMemo(() => {
    if (!context) return t("planner.mobile.drawer.addMeal", { defaultValue: "Add Meal" });
    if (context.mode === "substitute" && kid) {
      return t("planner.mobile.drawer.kidSlot", { defaultValue: "{{name}}'s {{slot}}", name: kid.name, slot: slotLabel });
    }
    if (context.mode === "change") {
      return t("planner.mobile.drawer.change", { defaultValue: "Change {{slot}}", slot: slotLabel });
    }
    return t("planner.mobile.drawer.add", { defaultValue: "Add {{slot}}", slot: slotLabel });
  }, [context, kid, slotLabel, t]);

  const description = useMemo(() => {
    if (!context) return "";
    if (context.mode === "substitute" && kid) {
      return t("planner.mobile.drawer.substituteHint", {
        defaultValue: "Choose a different meal for {{name}}",
        name: kid.name,
      });
    }
    if (isFamilyAction) {
      return t("planner.mobile.drawer.familyHint", {
        defaultValue: "For {{names}}",
        names: names(targetKids),
      });
    }
    return isTryBite
      ? t("planner.mobile.drawer.tryBiteHint", { defaultValue: "Pick a try-bite food" })
      : t("planner.mobile.drawer.pickHint", { defaultValue: "Choose a food or recipe" });
  }, [context, kid, isTryBite, isFamilyAction, names, targetKids, t]);

  const query = searchQuery.trim().toLowerCase();
  const tab: Tab = isTryBite ? "foods" : activeTab;

  // Safe for this kid first, then what they are working on, then the rest.
  // Nothing is hidden: a food the household has not flagged still belongs
  // somewhere, and a category the list never heard of lands in Other.
  const groupedFoods = useMemo(() => {
    const groups: Record<Group, { food: Food; fit: ItemFit }[]> = { safe: [], trying: [], other: [] };
    for (const food of foods) {
      if (query && !food.name.toLowerCase().includes(query)) continue;
      const fit = foodFits.get(food.id);
      if (!fit) continue;
      groups[groupOf(fit)].push({ food, fit });
    }
    const byName = (a: { food: Food }, b: { food: Food }) => a.food.name.localeCompare(b.food.name);
    groups.safe.sort((a, b) => b.fit.goToKids.length - a.fit.goToKids.length || byName(a, b));
    // Exposure count, most first: the food a kid is three tries into is the
    // one to keep going with.
    groups.trying.sort((a, b) => b.fit.tries - a.fit.tries || byName(a, b));
    groups.other.sort(
      (a, b) =>
        Number(a.fit.allergenKids.length > 0) - Number(b.fit.allergenKids.length > 0) ||
        (isTryBite ? b.fit.tries - a.fit.tries : 0) ||
        byName(a, b),
    );
    return groups;
  }, [foods, foodFits, query, isTryBite]);

  const groupOrder: Group[] = isTryBite ? ["trying", "other", "safe"] : ["safe", "trying", "other"];
  const totalFoods = groupedFoods.safe.length + groupedFoods.trying.length + groupedFoods.other.length;

  const filteredRecipes = useMemo(() => {
    if (isTryBite) return [];
    const list = recipes.filter((r) => !query || r.name.toLowerCase().includes(query));
    return list.sort((a, b) => {
      const fa = recipeFits.get(a.id);
      const fb = recipeFits.get(b.id);
      const ra = fa ? (fa.allergenKids.length > 0 ? 2 : fa.safeForAll ? 0 : 1) : 1;
      const rb = fb ? (fb.allergenKids.length > 0 ? 2 : fb.safeForAll ? 0 : 1) : 1;
      return ra - rb || a.name.localeCompare(b.name);
    });
  }, [recipes, query, isTryBite, recipeFits]);

  const showFamilyExtras =
    open && !!context && isFamilyAction && !isTryBite && (context.mode === "add" || context.mode === "change");

  // "Works for everyone": the sibling solver's top three, run once per open.
  const targetKey = targetKids.map((k) => k.id).join(",");
  const siblingPicks = useMemo<SolverResult[]>(() => {
    if (!showFamilyExtras || recipes.length === 0) return [];
    try {
      return topSiblingMeals(
        { recipes, foods, kids, selectedKidIds: targetKey ? targetKey.split(",") : [], history: [] },
        3,
      ).slice(0, 3);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed per open and target, not per realtime tick
  }, [showFamilyExtras, context?.date, context?.slot, targetKey]);

  const recentRecipes = useMemo<Recipe[]>(() => {
    if (!open || !context || isTryBite) return [];
    const targetIds = new Set(targetKids.map((k) => k.id));
    const rows = planEntries
      .filter((e) => e.meal_slot === context.slot && e.recipe_id && targetIds.has(e.kid_id))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const out: Recipe[] = [];
    const seen = new Set<string>();
    for (const e of rows) {
      const id = e.recipe_id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const r = recipeById.get(id);
      if (r) out.push(r);
      if (out.length === 5) break;
    }
    return out;
  }, [open, context, isTryBite, targetKids, planEntries, recipeById]);

  const close = useCallback(() => {
    onOpenChange(false);
    setSearchQuery("");
    setPending(null);
  }, [onOpenChange]);

  const commit = useCallback(
    (kind: "food" | "recipe", id: string, kidIds: string[]) => {
      if (!context || kidIds.length === 0) return;
      if (kind === "food") onSelectFood(id, context, kidIds);
      else onSelectRecipeForKids(id, context, kidIds);
      close();
    },
    [context, onSelectFood, onSelectRecipeForKids, close],
  );

  const handleTap = useCallback(
    (kind: "food" | "recipe", id: string, fit: ItemFit | undefined) => {
      const allIds = targetKids.map((k) => k.id);
      if (fit && fit.allergenKids.length > 0) {
        setPending((p) => (p && p.kind === kind && p.id === id ? null : { kind, id }));
        return;
      }
      commit(kind, id, allIds);
    },
    [targetKids, commit],
  );

  const handleEatWithFamily = useCallback(() => {
    if (!context) return;
    onEatWithFamily(context);
    close();
  }, [context, onEatWithFamily, close]);

  const familyTargetName = context?.familyTarget
    ? context.familyTarget.kind === "recipe"
      ? recipeById.get(context.familyTarget.id)?.name
      : foodById.get(context.familyTarget.id)?.name
    : undefined;

  const ordinalRules = useMemo(
    () => new Intl.PluralRules(i18n.language || undefined, { type: "ordinal" }),
    [i18n.language],
  );
  const tryLine = (fit: ItemFit): string | null => {
    if (isFamilyAction && fit.tries === 0) return null;
    const n = fit.tries + 1;
    const ordinal = `${n}${ORDINAL_SUFFIX[ordinalRules.select(n)] ?? "th"}`;
    const nth = t("planner.mobile.drawer.nthTry", { defaultValue: "{{ordinal}} try", ordinal });
    if (!fit.lastResult) return nth;
    const last = t(`planner.mobile.drawer.last.${fit.lastResult}`, {
      defaultValue:
        fit.lastResult === "ate"
          ? "ate it last time"
          : fit.lastResult === "tasted"
            ? "tasted last time"
            : "refused last time",
    });
    return `${nth}, ${last}`;
  };

  const allergenText = (fit: ItemFit): string | null => {
    if (fit.allergenKids.length === 0) return null;
    // One line per allergen, naming every kid it affects.
    // A severe allergy gets its own line, so the confirm names the child and
    // the allergen as severe before "Add anyway" (item 29).
    // An allergy with no recorded severity is treated as severe, and its line
    // says the severity was not recorded rather than calling it severe.
    const byAllergen = new Map<string, Kid[]>();
    const severeByAllergen = new Map<string, Kid[]>();
    const unratedByAllergen = new Map<string, Kid[]>();
    for (const h of fit.allergenKids) {
      const a = h.fit.allergen as string;
      const bucket = !isSevereFit(h.fit)
        ? byAllergen
        : isFitSeverityRecorded(h.fit)
          ? severeByAllergen
          : unratedByAllergen;
      bucket.set(a, [...(bucket.get(a) ?? []), h.kid]);
    }
    const severeLines = [...severeByAllergen].map(([allergen, ks]) =>
      t("planner.allergenSafety.drawerSevere", {
        defaultValue: "Contains {{allergen}} - severe allergy: {{names}}",
        allergen,
        names: names(ks),
      }),
    );
    const unratedLines = [...unratedByAllergen].map(([allergen, ks]) =>
      t("planner.allergenSafety.drawerUnrated", {
        defaultValue: "Contains {{allergen}} - allergy, severity not recorded (treated as severe): {{names}}",
        allergen,
        names: names(ks),
      }),
    );
    return [...severeLines, ...unratedLines, ...[...byAllergen]
      .map(([allergen, ks]) =>
        t("planner.mobile.drawer.allergenHit", {
          defaultValue: "Contains {{allergen}} - {{names}} {{verb}} allergic",
          allergen,
          names: names(ks),
          verb:
            ks.length === 1
              ? t("planner.mobile.drawer.is", { defaultValue: "is" })
              : t("planner.mobile.drawer.are", { defaultValue: "are" }),
        }),
      )].join("; ");
  };

  const renderSignals = (fit: ItemFit, showTries: boolean) => {
    const allergen = allergenText(fit);
    const tries = showTries ? tryLine(fit) : null;
    return (
      <>
        {allergen && (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {allergen}
          </span>
        )}
        {fit.dislikeKids.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            {t("planner.mobile.drawer.dislikes", {
              defaultValue: "Disliked by {{names}}",
              names: names(fit.dislikeKids),
            })}
          </span>
        )}
        {tries && <span className="text-xs text-muted-foreground">{tries}</span>}
      </>
    );
  };

  const renderGoTo = (fit: ItemFit) =>
    fit.goToKids.length > 0 ? (
      <Badge variant="secondary" className="text-xs px-1.5 py-0 shrink-0 gap-0.5">
        <Star className="h-3 w-3" aria-hidden="true" />
        {isFamilyAction
          ? t("planner.mobile.drawer.goToFor", {
              defaultValue: "Go-to for {{names}}",
              names: names(fit.goToKids),
            })
          : t("planner.mobile.drawer.goTo", { defaultValue: "Go-to" })}
      </Badge>
    ) : null;

  const renderConfirm = (kind: "food" | "recipe", id: string, fit: ItemFit) => {
    if (!pending || pending.kind !== kind || pending.id !== id) return null;
    const blocked = new Set(fit.allergenKids.map((h) => h.kid.id));
    const others = targetKids.filter((k) => !blocked.has(k.id));
    return (
      <div className="flex flex-wrap gap-2 px-1 pt-2 pb-1" role="group" aria-label={allergenText(fit) ?? undefined}>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => commit(kind, id, targetKids.map((k) => k.id))}
        >
          {t("planner.mobile.drawer.addAnyway", { defaultValue: "Add anyway" })}
        </Button>
        {isFamilyAction && others.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => commit(kind, id, others.map((k) => k.id))}>
            {t("planner.mobile.drawer.addExcept", {
              defaultValue: "Add for everyone except {{names}}",
              names: names(fit.allergenKids.map((h) => h.kid)),
            })}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
          {t("planner.mobile.drawer.cancel", { defaultValue: "Cancel" })}
        </Button>
      </div>
    );
  };

  const groupTitle = (g: Group): string => {
    if (g === "safe") {
      return isFamilyAction
        ? t("planner.mobile.drawer.safeForEveryone", { defaultValue: "Safe for everyone" })
        : t("planner.mobile.drawer.safeFor", {
            defaultValue: "Safe for {{name}}",
            name: targetKids[0]?.name ?? "",
          });
    }
    if (g === "trying") return t("planner.mobile.drawer.trying", { defaultValue: "Trying" });
    return t("planner.mobile.drawer.other", { defaultValue: "Other" });
  };

  const renderRecipeRow = (recipe: Recipe) => {
    const fit = recipeFits.get(recipe.id);
    const unlinked = (recipe.food_ids ?? []).length === 0;
    return (
      <div key={recipe.id}>
        <button
          type="button"
          onClick={() => handleTap("recipe", recipe.id, fit)}
          disabled={unlinked}
          aria-expanded={fit && fit.allergenKids.length > 0 ? pending?.id === recipe.id : undefined}
          className={cn(
            "w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-background hover:bg-muted text-left",
            pressSoft,
            unlinked && "opacity-60",
          )}
        >
          <span className="flex items-start gap-2 min-w-0">
            <ChefHat className="h-4 w-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex flex-col gap-0.5">
              <span className="font-medium text-sm text-foreground truncate">{recipe.name}</span>
              {unlinked ? (
                <span className="text-xs text-muted-foreground">
                  {t("planner.mobile.drawer.noPantryFoods", { defaultValue: "No pantry foods linked" })}
                </span>
              ) : (
                recipe.description && (
                  <span className="text-xs text-muted-foreground truncate">{recipe.description}</span>
                )
              )}
              {fit && renderSignals(fit, false)}
            </span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {fit && renderGoTo(fit)}
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {t("planner.mobile.drawer.items", {
                defaultValue: "{{count}} items",
                count: recipe.food_ids?.length ?? 0,
              })}
            </Badge>
          </span>
        </button>
        {fit && renderConfirm("recipe", recipe.id, fit)}
      </div>
    );
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "foods" ? "recipes" : "foods";
    setActiveTab(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  const tabButton = (value: Tab, label: string, icon: typeof Apple) => {
    const TabIcon = icon;
    return (
    <button
      type="button"
      role="tab"
      id={`${uid}-tab-${value}`}
      aria-selected={tab === value}
      aria-controls={`${uid}-panel`}
      tabIndex={tab === value ? 0 : -1}
      onClick={() => setActiveTab(value)}
      onKeyDown={onTabKey}
      className={cn(
        "flex-1 min-h-11 px-3 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tab === value ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      <TabIcon className="h-4 w-4 inline mr-1.5" aria-hidden="true" />
      {label}
    </button>
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-lg">{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>

        <div className="px-4 space-y-3 flex-1 overflow-hidden flex flex-col">
          {context?.mode === "substitute" && context.familyTarget && familyTargetName && (
            <button
              type="button"
              onClick={handleEatWithFamily}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl border border-success bg-success/10 hover:bg-success/20",
                pressSoft,
              )}
            >
              <Users className="h-5 w-5 text-success shrink-0" aria-hidden="true" />
              <span className="text-left">
                <span className="block font-semibold text-sm text-foreground">
                  {t("planner.mobile.drawer.eatWithFamily", { defaultValue: "Eat with family" })}
                </span>
                <span className="block text-xs text-foreground">
                  {t("planner.mobile.drawer.eatWithFamilyHint", {
                    defaultValue: "Have {{name}} like everyone else",
                    name: familyTargetName,
                  })}
                </span>
              </span>
            </button>
          )}

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder={
                tab === "recipes"
                  ? t("planner.mobile.drawer.searchRecipes", { defaultValue: "Search recipes..." })
                  : t("planner.mobile.drawer.searchFoods", { defaultValue: "Search foods..." })
              }
              aria-label={
                tab === "recipes"
                  ? t("planner.mobile.drawer.searchRecipes", { defaultValue: "Search recipes..." })
                  : t("planner.mobile.drawer.searchFoods", { defaultValue: "Search foods..." })
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-11 h-11 rounded-xl"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label={t("planner.mobile.drawer.clearSearch", { defaultValue: "Clear the search box" })}
                onClick={() => setSearchQuery("")}
                className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            )}
          </div>

          {!isTryBite && (
            <div
              role="tablist"
              aria-label={t("planner.mobile.drawer.kind", { defaultValue: "Foods or recipes" })}
              className="flex gap-1 p-1 bg-muted rounded-xl"
            >
              {tabButton("foods", t("planner.mobile.drawer.foods", { defaultValue: "Foods" }), Apple)}
              {tabButton("recipes", t("planner.mobile.drawer.recipes", { defaultValue: "Recipes" }), ChefHat)}
            </div>
          )}

          <ScrollArea className="flex-1 -mx-4 px-4 pb-[env(safe-area-inset-bottom)]">
            <div className="pb-6 space-y-4">
              {!query && siblingPicks.length > 0 && (
                <section aria-labelledby={`${uid}-works`}>
                  <h3 id={`${uid}-works`} className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                    {t("planner.mobile.drawer.worksForEveryone", { defaultValue: "Works for everyone" })}
                  </h3>
                  <div className="space-y-1">
                    {siblingPicks.map((pick) => {
                      const recipe = recipeById.get(pick.recipeId);
                      if (!recipe) return null;
                      const fit = recipeFits.get(recipe.id);
                      return (
                        <div key={pick.recipeId}>
                          <button
                            type="button"
                            onClick={() => handleTap("recipe", recipe.id, fit)}
                            disabled={(recipe.food_ids ?? []).length === 0}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-card hover:bg-muted text-left",
                              pressSoft,
                            )}
                          >
                            <span className="font-medium text-sm text-foreground truncate">{pick.recipeName}</span>
                            <span className="flex items-center gap-2 shrink-0">
                              {pick.perKidSatisfaction.map((k) => {
                                const needsSwap =
                                  k.hardViolations.length > 0 ||
                                  pick.swaps.some((s) => s.kidId === k.kidId) ||
                                  pick.splitPlates.some((s) => s.kidId === k.kidId);
                                return (
                                  <span
                                    key={k.kidId}
                                    className="inline-flex items-center gap-0.5 text-xs text-foreground"
                                    aria-label={
                                      needsSwap
                                        ? t("planner.mobile.drawer.needsSwap", {
                                            defaultValue: "{{name}} needs a swap",
                                            name: k.kidName,
                                          })
                                        : t("planner.mobile.drawer.works", {
                                            defaultValue: "Works for {{name}}",
                                            name: k.kidName,
                                          })
                                    }
                                  >
                                    {needsSwap ? (
                                      <ArrowRightLeft className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                                    )}
                                    <span aria-hidden="true">{k.kidName.slice(0, 1)}</span>
                                  </span>
                                );
                              })}
                            </span>
                          </button>
                          {fit && renderConfirm("recipe", recipe.id, fit)}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {!query && recentRecipes.length > 0 && (
                <section aria-labelledby={`${uid}-recent`}>
                  <h3
                    id={`${uid}-recent`}
                    className="flex items-center gap-1 text-xs font-semibold text-muted-foreground mb-2 px-1"
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("planner.mobile.drawer.recent", { defaultValue: "Recent" })}
                  </h3>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {recentRecipes.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleTap("recipe", r.id, recipeFits.get(r.id))}
                        disabled={(r.food_ids ?? []).length === 0}
                        className={cn(
                          "shrink-0 min-h-11 px-3 rounded-full border border-border bg-background hover:bg-muted text-sm text-foreground",
                          pressSoft,
                        )}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                  {recentRecipes.map((r) => {
                    const fit = recipeFits.get(r.id);
                    return fit ? <div key={r.id}>{renderConfirm("recipe", r.id, fit)}</div> : null;
                  })}
                </section>
              )}

              <div
                role={isTryBite ? undefined : "tabpanel"}
                id={`${uid}-panel`}
                aria-labelledby={isTryBite ? undefined : `${uid}-tab-${tab}`}
                className="space-y-4"
              >
                {tab === "foods" ? (
                  totalFoods === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="font-medium">
                        {t("planner.mobile.drawer.noFoods", { defaultValue: "No foods found" })}
                      </p>
                      <p className="text-sm mt-1">
                        {query
                          ? t("planner.mobile.drawer.tryDifferent", { defaultValue: "Try a different search" })
                          : t("planner.mobile.drawer.addFoodsHint", { defaultValue: "Add foods in your pantry" })}
                      </p>
                    </div>
                  ) : (
                    groupOrder.map((g) => {
                      const rows = groupedFoods[g];
                      if (rows.length === 0) return null;
                      return (
                        <section key={g} aria-labelledby={`${uid}-g-${g}`}>
                          <h3 id={`${uid}-g-${g}`} className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                            {groupTitle(g)}
                          </h3>
                          <div className="space-y-1">
                            {rows.map(({ food, fit }) => {
                              const qty = food.quantity ?? 0;
                              const hasAllergen = fit.allergenKids.length > 0;
                              return (
                                <div key={food.id}>
                                  <button
                                    type="button"
                                    onClick={() => handleTap("food", food.id, fit)}
                                    aria-expanded={hasAllergen ? pending?.id === food.id : undefined}
                                    className={cn(
                                      "w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-background hover:bg-muted text-left",
                                      pressSoft,
                                    )}
                                  >
                                    <span className="min-w-0 flex flex-col gap-0.5">
                                      <span className="font-medium text-sm text-foreground truncate">
                                        {food.name}
                                      </span>
                                      {renderSignals(fit, g === "trying" || isTryBite)}
                                    </span>
                                    <span className="flex items-center gap-1.5 shrink-0">
                                      {renderGoTo(fit)}
                                      {qty <= 0 ? (
                                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                                          {t("planner.mobile.drawer.toBuy", { defaultValue: "To buy" })}
                                        </Badge>
                                      ) : (
                                        <span className="text-xs text-muted-foreground tabular-nums">{qty}</span>
                                      )}
                                    </span>
                                  </button>
                                  {renderConfirm("food", food.id, fit)}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })
                  )
                ) : filteredRecipes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="font-medium">
                      {t("planner.mobile.drawer.noRecipes", { defaultValue: "No recipes found" })}
                    </p>
                    <p className="text-sm mt-1">
                      {query
                        ? t("planner.mobile.drawer.tryDifferent", { defaultValue: "Try a different search" })
                        : t("planner.mobile.drawer.createRecipes", { defaultValue: "Create recipes to use them here" })}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">{filteredRecipes.map(renderRecipeRow)}</div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
