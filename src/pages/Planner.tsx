import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useFoods, useGrocery, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { toInsertablePlanEntry, type SlotTarget } from "@/contexts/PlanContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { FoodSelectorDialog } from "@/components/FoodSelectorDialog";
import { MobileMealPlanner } from "@/components/meal-planner/MobileMealPlanner";
import { FamilyWeekGrid } from "@/components/meal-planner/FamilyWeekGrid";
import { TryBiteStrip } from "@/components/meal-planner/TryBiteStrip";
import { buildWeekPlan } from "@/lib/mealPlanner";
import {
  Calendar,
  Sparkles,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShoppingCart,
  Copy,
  LayoutTemplate,
} from "lucide-react";
import { toast } from "sonner";
import type { Food, Kid, MealSlot, PlanEntry } from "@/types";
import { MissingIngredientsDialog } from "@/components/MissingIngredientsDialog";
import { computeRecipeShortfall, type Shortfall } from "@/lib/recipeShortfall";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { format, startOfWeek, addWeeks, subWeeks, addDays, isSameDay } from "date-fns";
import { calculateAge } from "@/lib/utils";
import { addIsoDays, parseIsoDate } from "@/lib/date-utils";
import { useWeekStartsOn } from "@/hooks/useWeekStartsOn";
import { allergenCopyKind, dropAllergenEntries, manualAddPrompt } from "@/lib/planAllergenGuard";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePlanToGrocery, type PlanToGroceryWindow } from "@/hooks/usePlanToGrocery";
import { useDefaultGroceryListId } from "@/hooks/useDefaultGroceryListId";
import { logger } from "@/lib/logger";
import { VarietyFatigueBanner } from "@/components/VarietyFatigueBanner";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import "@/i18n/appLocale";

// US-541: lazy-load the GSAP planner so gsap + gsap/Draggable are code-split
// into their own chunk instead of statically bloating the Planner bundle.
const GSAPCalendarMealPlanner = lazy(() =>
  import("@/components/GSAPCalendarMealPlanner").then((m) => ({ default: m.GSAPCalendarMealPlanner })),
);
const PlannerTemplatesController = lazy(() =>
  import("@/components/meal-planner/PlannerTemplatesController").then((m) => ({
    default: m.PlannerTemplatesController,
  })),
);

const MEAL_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner", "snack1", "snack2", "try_bite"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type BusyOp = "build" | "ai" | "clear" | "copy";
type MealOutcome = "ate" | "tasted" | "refused";

/**
 * The ai-meal-plan reply, validated at the boundary. The function maps model
 * output back to food ids; a slot the model named something unknown for is
 * simply absent, and anything else malformed is refused rather than written.
 */
const aiPlanSchema = z.object({
  plan: z.array(
    z.object({
      date: z.string(),
      meals: z.record(z.string().nullable().optional()),
    }),
  ),
});

/** Only what supabase/functions/ai-meal-plan/index.ts reads from each object. */
function aiKidPayload(kid: Kid) {
  return {
    id: kid.id,
    name: kid.name,
    age: calculateAge(kid.date_of_birth) ?? kid.age,
    allergens: kid.allergens ?? [],
    favorite_foods: kid.favorite_foods ?? [],
  };
}

function aiFoodPayload(f: Food) {
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    quantity: f.quantity ?? null,
    unit: f.unit ?? null,
    is_safe: f.is_safe,
    is_try_bite: f.is_try_bite,
    allergens: f.allergens ?? [],
  };
}

function inWeek(date: string, weekStart: string): boolean {
  const d = date.slice(0, 10);
  return d >= weekStart && d <= addIsoDays(weekStart, 6);
}

function parseWeekParam(value: string | null): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const d = parseIsoDate(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DEEP_LINK_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner", "snack1", "snack2", "try_bite"];

function parseSlotParam(value: string | null): MealSlot | null {
  return DEEP_LINK_SLOTS.find((s) => s === value) ?? null;
}

interface DeepLinkTarget {
  date: string;
  slot: MealSlot | null;
}

// The mobile planner shows one day at a time behind a WeekStrip tab and has
// no data-cell-* hooks, so a deep link there selects the day's tab and then
// the slot's card. These ids and the card order come from MobileMealPlanner.
const MOBILE_TAB_PREFIX = "planner-day";
const MOBILE_PANEL_ID = "planner-day-panel";

/** Finds the element a ?date=&slot= deep link should land on, or null if it is not rendered yet. */
function findDeepLinkCell(target: DeepLinkTarget, weekStartIso: string): HTMLElement | null {
  const cellSelector = target.slot
    ? `[data-cell-date="${target.date}"][data-cell-slot="${target.slot}"]`
    : `[data-cell-date="${target.date}"][data-cell-slot]`;
  const cell = document.querySelector<HTMLElement>(cellSelector);
  if (cell) return cell;

  const panel = document.getElementById(MOBILE_PANEL_ID);
  if (!panel) return null;
  const dayIndex = Math.round(
    (parseIsoDate(target.date).getTime() - parseIsoDate(weekStartIso).getTime()) / 86_400_000,
  );
  if (dayIndex < 0 || dayIndex > 6) return null;
  const tab = document.getElementById(`${MOBILE_TAB_PREFIX}-${dayIndex}`);
  if (!tab) return null;
  if (tab.getAttribute("aria-selected") !== "true") {
    // Selecting the day re-renders the panel; the caller looks again then.
    tab.click();
    return null;
  }
  const cards = panel.querySelectorAll<HTMLElement>(":scope > section");
  const slotIndex = target.slot ? DEEP_LINK_SLOTS.indexOf(target.slot) : 0;
  return cards[slotIndex] ?? panel;
}

type RangeFormatter = Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string };

interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Allergen prompts make Cancel the default and the write the secondary choice. */
  cautious?: boolean;
  resolve: (ok: boolean) => void;
}

interface KidChooserRequest {
  op: "build" | "ai";
  selected: string[];
}

export default function Planner() {
  const { t, i18n } = useTranslation();
  const { foods, updateFood } = useFoods();
  const { kids, activeKidId, setActiveKid } = useKids();
  const { recipes } = useRecipes();
  const {
    planEntries,
    updatePlanEntry,
    addPlanEntry,
    addPlanEntries,
    copyWeekPlan,
    deleteWeekPlan,
    deletePlanEntries,
    movePlanEntries,
    replaceSlot,
    replaceWeekPlan,
    scheduleRecipe,
  } = usePlan();
  const { addGroceryItemsMerged, deleteGroceryItems } = useGrocery();
  const planToGrocery = usePlanToGrocery();
  const defaultListId = useDefaultGroceryListId();

  const isMobile = useMediaQuery("(max-width: 1023px)");

  // --- Week in view, persisted in ?week=YYYY-MM-DD -------------------------
  const [searchParams, setSearchParams] = useSearchParams();
  const weekParam = searchParams.get("week");
  // ?date=YYYY-MM-DD&slot=dinner deep links (TodayTasks, QuickActionsFab,
  // TonightHero, Dashboard, OnboardingProgressBar, Meal Builder). ?week wins
  // when both are present; otherwise the week is the one holding ?date.
  const dateParam = searchParams.get("date");
  const slotParam = searchParams.get("slot");
  // Item 3: Monday unless this user chose Sunday. Plan rows keep their dates;
  // only the seven-day window moves, so a ?week= saved under the other start
  // opens on the week that contains that day.
  const weekStartsOn = useWeekStartsOn();
  const currentWeekStart = useMemo(
    () =>
      startOfWeek(parseWeekParam(weekParam) ?? parseWeekParam(dateParam) ?? new Date(), { weekStartsOn }),
    [weekParam, dateParam, weekStartsOn],
  );
  const weekStartIso = format(currentWeekStart, "yyyy-MM-dd");
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn });
  const isThisWeek = isSameDay(currentWeekStart, thisWeekStart);

  const setCurrentWeekStart = useCallback(
    (d: Date) => {
      const iso = format(startOfWeek(d, { weekStartsOn }), "yyyy-MM-dd");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("week", iso);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, weekStartsOn],
  );

  // Capture the deep link once, then take date/slot out of the URL so a
  // reload or a later week change does not jump back to it. ?week is set to
  // the week on screen, so dropping ?date does not move the view.
  const [deepLinkTarget, setDeepLinkTarget] = useState<DeepLinkTarget | null>(null);
  useEffect(() => {
    if (dateParam === null && slotParam === null) return;
    const valid = parseWeekParam(dateParam) !== null;
    if (valid && dateParam) setDeepLinkTarget({ date: dateParam, slot: parseSlotParam(slotParam) });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("date");
        next.delete("slot");
        if (valid && !next.get("week")) next.set("week", weekStartIso);
        return next;
      },
      { replace: true },
    );
  }, [dateParam, slotParam, weekStartIso, setSearchParams]);

  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!deepLinkTarget) return;
    const target = deepLinkTarget;
    const land = (): boolean => {
      const el = findDeepLinkCell(target, weekStartIso);
      if (!el) return false;
      // Grid cells are plain role="cell" divs; -1 makes them focusable without
      // adding them to the tab order.
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.scrollIntoView?.({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
      setDeepLinkTarget(null);
      return true;
    };
    if (land()) return;
    // The per-kid grid is lazy, so the cell may arrive a few renders later.
    const observer = new MutationObserver(() => {
      if (land()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
    const giveUp = window.setTimeout(() => {
      observer.disconnect();
      setDeepLinkTarget(null);
    }, 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(giveUp);
    };
  }, [deepLinkTarget, weekStartIso, reduceMotion]);

  const [busyOp, setBusyOp] = useState<BusyOp | null>(null);
  const busyRef = useRef<BusyOp | null>(null);
  const [status, setStatus] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [foodSelectorOpen, setFoodSelectorOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    slot: MealSlot;
    kidId: string;
  } | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [kidChooser, setKidChooser] = useState<KidChooserRequest | null>(null);

  // US-284: missing-ingredient prompt state.
  const [missingDialogOpen, setMissingDialogOpen] = useState(false);
  const [missingShortfalls, setMissingShortfalls] = useState<Shortfall[]>([]);
  const [pendingRecipeForMissing, setPendingRecipeForMissing] = useState<
    { id: string; name: string } | null
  >(null);

  const activeKid = kids.find((k) => k.id === activeKidId);
  // A stale activeKidId (a deleted child, another household's id left in
  // storage) is family mode, never a crash on activeKid!.
  const familyMode = activeKidId === null || !activeKid;

  useEffect(() => {
    if (activeKidId && kids.length > 0 && !kids.some((k) => k.id === activeKidId)) {
      setActiveKid(null);
    }
  }, [activeKidId, kids, setActiveKid]);

  // Handlers handed to the grids read these, so they can stay stable across
  // every plan change instead of re-rendering both grids on each keystroke.
  const planEntriesRef = useRef(planEntries);
  planEntriesRef.current = planEntries;
  const foodsRef = useRef(foods);
  foodsRef.current = foods;
  const kidsRef = useRef(kids);
  kidsRef.current = kids;
  const recipesRef = useRef(recipes);
  recipesRef.current = recipes;
  const activeKidRef = useRef(activeKid);
  activeKidRef.current = activeKid;

  // --- Formatting helpers --------------------------------------------------
  const lang = i18n.language || "en";
  const dayName = useCallback(
    (iso: string) => new Intl.DateTimeFormat(lang, { weekday: "long" }).format(parseIsoDate(iso)),
    [lang],
  );
  const slotName = useCallback((slot: MealSlot) => t(`planner.slots.${slot}`), [t]);
  const formatRange = useCallback(
    (startIso: string) => {
      const fmt = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }) as RangeFormatter;
      const a = parseIsoDate(startIso);
      const b = addDays(a, 6);
      return fmt.formatRange ? fmt.formatRange(a, b) : `${fmt.format(a)} - ${fmt.format(b)}`;
    },
    [lang],
  );
  const listNames = useCallback(
    (names: string[]) => {
      const ListFormat = (Intl as unknown as {
        ListFormat?: new (l: string, o: { type: string }) => { format: (x: string[]) => string };
      }).ListFormat;
      return ListFormat ? new ListFormat(lang, { type: "conjunction" }).format(names) : names.join(", ");
    },
    [lang],
  );
  const foodName = useCallback((id: string) => foodsRef.current.find((f) => f.id === id)?.name ?? "", []);
  const kidName = useCallback((id: string) => kidsRef.current.find((k) => k.id === id)?.name ?? "", []);

  /** Announce an action result to screen readers (and only results). */
  const announce = useCallback((msg: string) => setStatus(msg), []);

  // --- Confirm plumbing ----------------------------------------------------
  const askConfirm = useCallback(
    (req: Omit<ConfirmRequest, "resolve">) =>
      new Promise<boolean>((resolve) => setConfirmRequest({ ...req, resolve })),
    [],
  );
  const settleConfirm = useCallback((ok: boolean) => {
    setConfirmRequest((cur) => {
      cur?.resolve(ok);
      return null;
    });
  }, []);

  /**
   * Allergen guard. Every path that puts a food on a child's plan comes through
   * here. A match asks first, with Cancel as the default; nothing is written
   * unless the parent picks "Add anyway". Uses findAllergenConflicts (via
   * manualAddPrompt), the same matcher as the grid badges, so families and
   * food names count. A severe allergy names the child and the allergen in
   * the title and on the button. An allergy with no recorded severity gets the
   * same severe confirm, worded as "severity not recorded" (item 3a).
   */
  const guardAllergen = useCallback(
    async (targetKids: Kid[], foodIds: string[]): Promise<boolean> => {
      const foodById = new Map(foodsRef.current.map((f) => [f.id, f]));
      const prompt = manualAddPrompt(targetKids, foodIds, foodById);
      if (!prompt) return true;
      const lines = prompt.conflicts.map((c) => {
        const vars = { food: c.food.name, allergen: c.allergen, name: c.kid.name };
        switch (allergenCopyKind(c)) {
          case "severe":
            return t("planner.allergenSafety.severeLine", {
              defaultValue: "{{food}} contains {{allergen}}. {{name}} has a severe {{allergen}} allergy.",
              ...vars,
            });
          case "severeUnrated":
            return t("planner.allergenSafety.unratedLine", {
              defaultValue:
                "{{food}} contains {{allergen}}. {{name}} has a {{allergen}} allergy with no severity recorded, so it is treated as severe.",
              ...vars,
            });
          default:
            return t("planner.confirm.allergenLine", vars);
        }
      });
      const lead = prompt.lead;
      return askConfirm({
        title: lead
          ? allergenCopyKind(lead) === "severeUnrated"
            ? t("planner.allergenSafety.unratedTitle", {
                defaultValue: "{{allergen}} allergy (severity not recorded, treated as severe): {{name}}",
                allergen: lead.allergen,
                name: lead.kid.name,
              })
            : t("planner.allergenSafety.severeTitle", {
                defaultValue: "Severe {{allergen}} allergy: {{name}}",
                allergen: lead.allergen,
                name: lead.kid.name,
              })
          : t("planner.confirm.allergenTitle"),
        body: (
          <span className="block space-y-1">
            {[...new Set(lines)].map((l) => (
              <span key={l} className="block">{l}</span>
            ))}
          </span>
        ),
        confirmLabel: lead
          ? t("planner.allergenSafety.severeConfirm", {
              defaultValue: "Add it for {{name}} anyway",
              name: lead.kid.name,
            })
          : t("planner.actions.addAnyway"),
        cautious: true,
      });
    },
    [askConfirm, t],
  );

  const kidsById = useCallback(
    (ids: string[]) => ids.map((id) => kidsRef.current.find((k) => k.id === id)).filter((k): k is Kid => !!k),
    [],
  );

  // --- Busy guard ----------------------------------------------------------
  const runBusy = useCallback(async (op: BusyOp, fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = op;
    setBusyOp(op);
    try {
      await fn();
    } finally {
      busyRef.current = null;
      setBusyOp(null);
    }
  }, []);
  const busy = busyOp !== null;

  // --- Grocery bridge (C5) -------------------------------------------------
  const weekWindow = useMemo(() => ({ from: weekStartIso, to: addIsoDays(weekStartIso, 6) }), [weekStartIso]);
  const weekEntries = useMemo(
    () =>
      planEntries.filter(
        (e) => inWeek(e.date, weekStartIso) && (familyMode || e.kid_id === activeKid?.id),
      ),
    [planEntries, weekStartIso, familyMode, activeKid?.id],
  );
  const { preview: previewGrocery, push: pushGrocery } = planToGrocery;
  const groceryPreview = useMemo(
    () => previewGrocery(weekEntries, weekWindow),
    [previewGrocery, weekEntries, weekWindow],
  );
  const toAddCount = groceryPreview.toAdd;

  const pushEntriesToGrocery = useCallback(
    async (entries: PlanEntry[], window: PlanToGroceryWindow) => {
      const res = await pushGrocery(entries, window, { mode: "additive" });
      if (res.added > 0) {
        const msg = t("planner.toasts.pushedToList", { count: res.added });
        announce(msg);
        toast.success(msg, {
          action: {
            label: t("planner.actions.undo"),
            onClick: () => deleteGroceryItems(res.insertedIds),
          },
        });
      } else {
        toast.info(t("planner.toasts.listAlreadyCovered"));
      }
    },
    [pushGrocery, deleteGroceryItems, announce, t],
  );

  const handlePushWeekToGrocery = useCallback(() => {
    void pushEntriesToGrocery(weekEntries, weekWindow);
  }, [pushEntriesToGrocery, weekEntries, weekWindow]);

  // --- Missing ingredients (US-284) ----------------------------------------
  const openMissingIngredientsForRecipe = useCallback(
    (recipeId: string) => {
      const recipe = recipesRef.current.find((r) => r.id === recipeId);
      if (!recipe) return;
      if ((recipe.recipe_ingredients ?? []).length === 0) return;
      const shortfalls = computeRecipeShortfall(recipe, foodsRef.current);
      if (shortfalls.length === 0) {
        toast.success(t("planner.toasts.haveEverything"));
        return;
      }
      setPendingRecipeForMissing({ id: recipe.id, name: recipe.name });
      setMissingShortfalls(shortfalls);
      setMissingDialogOpen(true);
    },
    [t],
  );

  const handleConfirmMissingIngredients = useCallback(
    (selected: Shortfall[]) => {
      if (!pendingRecipeForMissing || selected.length === 0) return;
      // Stack rather than skip: a second recipe asking for "ground beef" bumps
      // the existing line's quantity (unit-aware) instead of being dropped.
      const touched = addGroceryItemsMerged(
        selected.map((s) => ({
          name: s.ingredient.name.trim(),
          quantity: s.needed > 0 ? s.needed : 1,
          unit: s.neededUnit ?? s.ingredient.unit ?? "",
          category: s.matchedFood?.category,
          added_via: "recipe",
          source_recipe_id: pendingRecipeForMissing.id,
        })),
        { defaultListId },
      );
      if (touched > 0) toast.success(t("planner.toasts.groceryAdded", { count: touched }));
    },
    [addGroceryItemsMerged, pendingRecipeForMissing, defaultListId, t],
  );

  const handleMissingOpenChange = useCallback((open: boolean) => {
    setMissingDialogOpen(open);
    if (!open) {
      setPendingRecipeForMissing(null);
      setMissingShortfalls([]);
    }
  }, []);

  // --- Undo helpers ---------------------------------------------------------
  const restoreRows = useCallback(
    async (removed: PlanEntry[], insertedIds: string[]) => {
      if (insertedIds.length > 0) {
        const del = await deletePlanEntries(insertedIds);
        if (del.error) return;
      }
      // Re-added with result, notes and amount_eaten as they were.
      const { error } = await addPlanEntries(removed.map(toInsertablePlanEntry));
      if (!error) {
        const msg = t("planner.toasts.undone");
        announce(msg);
        toast.success(msg);
      }
    },
    [deletePlanEntries, addPlanEntries, announce, t],
  );

  // --- Destructive confirms -------------------------------------------------
  const weekCounts = useCallback((kidIds: string[], weekStart: string) => {
    const rows = planEntriesRef.current.filter((e) => kidIds.includes(e.kid_id) && inWeek(e.date, weekStart));
    return { count: rows.length, logged: rows.filter((e) => e.result != null).length };
  }, []);

  /** Skipped when the week is empty; otherwise names what is about to go. */
  const confirmReplaceWeek = useCallback(
    async (kidIds: string[], kind: "replace" | "clear" = "replace") => {
      const { count, logged } = weekCounts(kidIds, weekStartIso);
      if (count === 0) return true;
      const name = listNames(kidsById(kidIds).map((k) => k.name));
      return askConfirm({
        title: t(kind === "clear" ? "planner.confirm.clearTitle" : "planner.confirm.replaceTitle"),
        body: (
          <>
            {t(kind === "clear" ? "planner.confirm.clearBody" : "planner.confirm.replaceBody", { count, name })}
            {logged > 0 && <> {t("planner.confirm.loggedSuffix", { count: logged })}</>}
          </>
        ),
        confirmLabel: t(kind === "clear" ? "planner.actions.clear" : "planner.actions.replace"),
      });
    },
    [weekCounts, weekStartIso, listNames, kidsById, askConfirm, t],
  );

  const resolveTargetKids = useCallback(
    (kidId: unknown): string[] => {
      if (typeof kidId === "string" && kidId) return [kidId];
      const active = activeKidRef.current;
      if (active) return [active.id];
      return kidsRef.current.map((k) => k.id);
    },
    [],
  );

  // --- Generation -----------------------------------------------------------
  /** Summarise a per-kid replace, with Undo and the grocery follow-up. */
  const reportWeekReplace = useCallback(
    (
      kind: "build" | "ai",
      okKids: string[],
      failedKids: string[],
      removed: PlanEntry[],
      insertedIds: string[],
    ) => {
      if (okKids.length === 0) return;
      const names = listNames(okKids.map(kidName));
      const range = formatRange(weekStartIso);
      const msg =
        failedKids.length > 0
          ? t("planner.toasts.weekPartial", { ok: names, failed: listNames(failedKids.map(kidName)) })
          : t(kind === "ai" ? "planner.toasts.weekGenerated" : "planner.toasts.weekBuilt", { names, range });
      announce(msg);

      const window = { from: weekStartIso, to: addIsoDays(weekStartIso, 6) };
      const after = planEntriesRef.current.filter(
        (e) => okKids.includes(e.kid_id) && inWeek(e.date, weekStartIso),
      );
      const n = previewGrocery(after, window).toAdd;
      const undo = {
        label: t("planner.actions.undo"),
        onClick: () => void restoreRows(removed, insertedIds),
      };
      if (n > 0) {
        toast.success(msg, {
          action: {
            label: t("planner.actions.addItemsToList", { count: n }),
            onClick: () => void pushEntriesToGrocery(
              planEntriesRef.current.filter((e) => okKids.includes(e.kid_id) && inWeek(e.date, weekStartIso)),
              window,
            ),
          },
          cancel: undo,
        });
      } else {
        toast.success(msg, { action: undo });
      }
    },
    [listNames, kidName, formatRange, weekStartIso, announce, previewGrocery, restoreRows, pushEntriesToGrocery, t],
  );

  const runBuildWeek = useCallback(
    async (kidIds: string[]) => {
      const targets = kidsById(kidIds);
      if (targets.length === 0) {
        toast.error(t("planner.toasts.selectChild"));
        return;
      }
      if (!(await confirmReplaceWeek(kidIds))) return;
      await runBusy("build", async () => {
        const ok: string[] = [];
        const failed: string[] = [];
        const removed: PlanEntry[] = [];
        const inserted: string[] = [];
        for (const kid of targets) {
          let plan: Omit<PlanEntry, "id">[];
          try {
            // US-715: build the week IN VIEW and persist it.
            plan = buildWeekPlan(kid, foodsRef.current, planEntriesRef.current, currentWeekStart);
          } catch (error) {
            failed.push(kid.id);
            toast.error(error instanceof Error ? error.message : t("planner.errors.generic"));
            continue;
          }
          const res = await replaceWeekPlan(weekStartIso, kid.id, plan);
          if (res.error) {
            failed.push(kid.id);
            continue;
          }
          ok.push(kid.id);
          removed.push(...res.removed);
          inserted.push(...res.insertedIds);
        }
        reportWeekReplace("build", ok, failed, removed, inserted);
      });
    },
    [kidsById, confirmReplaceWeek, runBusy, replaceWeekPlan, weekStartIso, currentWeekStart, reportWeekReplace, t],
  );

  /** One kid's AI week: fetch, validate, keep only what fits the week. */
  const fetchAiWeek = useCallback(
    async (kid: Kid): Promise<Omit<PlanEntry, "id">[] | "unavailable" | "bad"> => {
      const { data, error } = await invokeEdgeFunction("ai-meal-plan", {
        body: {
          kid: aiKidPayload(kid),
          foods: foodsRef.current.map(aiFoodPayload),
          recipes: recipesRef.current.map((r) => ({ name: r.name, food_ids: r.food_ids })),
          days: 7,
          // US-715: generate for the week on screen.
          startDate: weekStartIso,
        },
      });
      if (error || !data || (typeof data === "object" && data !== null && "error" in data && data.error)) {
        logger.error("[AI Meal Plan] unavailable", { hasError: !!error, hasData: !!data });
        return "unavailable";
      }
      const parsed = aiPlanSchema.safeParse(data);
      if (!parsed.success) {
        logger.error("[AI Meal Plan] invalid shape", { issues: parsed.error.issues.length });
        return "bad";
      }
      const known = new Set(foodsRef.current.map((f) => f.id));
      const generated: Omit<PlanEntry, "id">[] = [];
      for (const day of parsed.data.plan) {
        if (!ISO_DATE.test(day.date) || !inWeek(day.date, weekStartIso)) continue;
        for (const [slot, foodId] of Object.entries(day.meals)) {
          if (!foodId || !(MEAL_SLOTS as readonly string[]).includes(slot) || !known.has(foodId)) continue;
          generated.push({ kid_id: kid.id, date: day.date, meal_slot: slot as MealSlot, food_id: foodId, result: null });
        }
      }
      // Item 29: the edge function filters allergens too, but the client is
      // the last stop before the write, and an older deployment or a reply
      // naming a sibling's food must not put this child's allergen on the plan.
      const foodById = new Map(foodsRef.current.map((f) => [f.id, f]));
      const { kept: entries, dropped } = dropAllergenEntries(generated, [kid], foodById);
      if (dropped.length > 0) {
        toast.warning(
          t("planner.allergenSafety.aiDropped", {
            defaultValue: "Left out {{foods}}: {{name}} is allergic.",
            foods: [...new Set(dropped.map((c) => c.food.name))].join(", "),
            name: kid.name,
          }),
        );
      }
      logger.info("[AI Meal Plan] response", { days: parsed.data.plan.length, kept: entries.length, dropped: dropped.length });
      return entries.length > 0 ? entries : "bad";
    },
    [weekStartIso, t],
  );

  const runAiWeek = useCallback(
    async (kidIds: string[]) => {
      const targets = kidsById(kidIds);
      if (targets.length === 0) {
        toast.error(t("planner.toasts.selectChild"));
        return;
      }
      if (!(await confirmReplaceWeek(kidIds))) return;
      await runBusy("ai", async () => {
        const ok: string[] = [];
        const failed: string[] = [];
        const removed: PlanEntry[] = [];
        const inserted: string[] = [];
        let problem: "unavailable" | "bad" | null = null;
        for (const kid of targets) {
          let next: Awaited<ReturnType<typeof fetchAiWeek>>;
          try {
            next = await fetchAiWeek(kid);
          } catch (error) {
            logger.error("[AI Meal Plan] request failed", error instanceof Error ? error.message : "unknown");
            next = "unavailable";
          }
          if (typeof next === "string") {
            // Nothing valid came back: the week is left exactly as it was.
            problem = problem ?? next;
            failed.push(kid.id);
            continue;
          }
          const res = await replaceWeekPlan(weekStartIso, kid.id, next);
          if (res.error) {
            failed.push(kid.id);
            continue;
          }
          ok.push(kid.id);
          removed.push(...res.removed);
          inserted.push(...res.insertedIds);
        }
        if (problem) {
          toast.error(t(problem === "bad" ? "planner.errors.aiBadResponse" : "planner.errors.aiUnavailable"));
        }
        reportWeekReplace("ai", ok, failed, removed, inserted);
      });
    },
    [kidsById, confirmReplaceWeek, runBusy, fetchAiWeek, replaceWeekPlan, weekStartIso, reportWeekReplace, t],
  );

  const handleBuildWeek = useCallback(() => {
    if (busyRef.current) return;
    const active = activeKidRef.current;
    if (!active) {
      setKidChooser({ op: "build", selected: kidsRef.current.map((k) => k.id) });
      return;
    }
    void runBuildWeek([active.id]);
  }, [runBuildWeek]);

  const handleAIMealPlan = useCallback(() => {
    if (busyRef.current) return;
    const active = activeKidRef.current;
    if (!active) {
      setKidChooser({ op: "ai", selected: kidsRef.current.map((k) => k.id) });
      return;
    }
    void runAiWeek([active.id]);
  }, [runAiWeek]);

  const confirmKidChooser = useCallback(() => {
    const req = kidChooser;
    setKidChooser(null);
    if (!req || req.selected.length === 0) return;
    void (req.op === "ai" ? runAiWeek(req.selected) : runBuildWeek(req.selected));
  }, [kidChooser, runAiWeek, runBuildWeek]);

  // --- Week ops -------------------------------------------------------------
  const handleClearWeek = useCallback(
    async (kidId?: unknown) => {
      if (busyRef.current) return;
      const kidIds = resolveTargetKids(kidId);
      const { count } = weekCounts(kidIds, weekStartIso);
      if (count === 0) {
        toast.info(t("planner.toasts.nothingToClear"));
        return;
      }
      if (!(await confirmReplaceWeek(kidIds, "clear"))) return;
      await runBusy("clear", async () => {
        const removed: PlanEntry[] = [];
        for (const id of kidIds) {
          const res = await deleteWeekPlan(weekStartIso, id);
          if (!res.error) removed.push(...res.removed);
        }
        if (removed.length === 0) return;
        const msg = t("planner.toasts.weekCleared", { count: removed.length, range: formatRange(weekStartIso) });
        announce(msg);
        toast.success(msg, {
          action: { label: t("planner.actions.undo"), onClick: () => void restoreRows(removed, []) },
        });
      });
    },
    [resolveTargetKids, weekCounts, weekStartIso, confirmReplaceWeek, runBusy, deleteWeekPlan, formatRange, announce, restoreRows, t],
  );

  const copyWeekInto = useCallback(
    async (fromIso: string, toIso: string, kidIds: string[], navigateAfter: boolean) => {
      const source = planEntriesRef.current.filter((e) => kidIds.includes(e.kid_id) && inWeek(e.date, fromIso));
      if (source.length === 0) {
        toast.info(t("planner.toasts.nothingToCopy"));
        return;
      }
      const dest = weekCounts(kidIds, toIso);
      if (dest.count > 0) {
        const ok = await askConfirm({
          title: t("planner.confirm.copyTitle"),
          body: t("planner.confirm.copyBody", {
            count: dest.count,
            range: formatRange(toIso),
            name: listNames(kidsById(kidIds).map((k) => k.name)),
          }),
          confirmLabel: t("planner.actions.copy"),
        });
        if (!ok) return;
      }
      await runBusy("copy", async () => {
        let copied = 0;
        let skipped = 0;
        let failed = false;
        const insertedIds: string[] = [];
        for (const id of kidIds) {
          const res = await copyWeekPlan(fromIso, toIso, id);
          if (res.error) {
            failed = true;
            continue;
          }
          copied += res.copied;
          skipped += res.skipped;
          insertedIds.push(...res.insertedIds);
        }
        if (failed && insertedIds.length === 0) return;
        if (navigateAfter && !failed) setCurrentWeekStart(parseIsoDate(toIso));
        const msg = t("planner.toasts.weekCopied", { count: copied, range: formatRange(toIso) });
        announce(msg);
        toast.success(msg, {
          description: skipped > 0 ? t("planner.toasts.copySkipped", { count: skipped }) : undefined,
          action:
            insertedIds.length > 0
              ? { label: t("planner.actions.undo"), onClick: () => void deletePlanEntries(insertedIds) }
              : undefined,
        });
      });
    },
    [weekCounts, askConfirm, formatRange, listNames, kidsById, runBusy, copyWeekPlan, setCurrentWeekStart, announce, deletePlanEntries, t],
  );

  const handleCopyWeek = useCallback(
    (toDate: string, kidId?: unknown) => {
      if (busyRef.current || !ISO_DATE.test(toDate)) return;
      void copyWeekInto(weekStartIso, toDate, resolveTargetKids(kidId), true);
    },
    [copyWeekInto, weekStartIso, resolveTargetKids],
  );

  const lastWeekIso = addIsoDays(weekStartIso, -7);
  const handleCopyLastWeek = useCallback(() => {
    const active = activeKidRef.current;
    if (busyRef.current || !active) return;
    void copyWeekInto(lastWeekIso, weekStartIso, [active.id], false);
  }, [copyWeekInto, lastWeekIso, weekStartIso]);

  // --- Entry ops (C2 / C3) --------------------------------------------------
  const describeEntries = useCallback(
    (entries: PlanEntry[]) => {
      const first = entries[0];
      const recipe = first?.recipe_id ? recipesRef.current.find((r) => r.id === first.recipe_id) : undefined;
      const sameRecipe = recipe && entries.every((e) => e.recipe_id === recipe.id);
      return sameRecipe ? recipe.name : listNames(entries.map((e) => foodName(e.food_id)).filter(Boolean));
    },
    [listNames, foodName],
  );

  const handleDeleteEntries = useCallback(
    async (ids: string[]) => {
      const entries = planEntriesRef.current.filter((e) => ids.includes(e.id));
      const { error, removed } = await deletePlanEntries(ids);
      if (error || entries.length === 0) return;
      const msg = t("planner.toasts.removed", {
        food: describeEntries(entries),
        day: dayName(entries[0].date),
        slot: slotName(entries[0].meal_slot),
      });
      announce(msg);
      toast.success(msg, {
        action: { label: t("planner.actions.undo"), onClick: () => void restoreRows(removed, []) },
      });
    },
    [deletePlanEntries, describeEntries, dayName, slotName, announce, restoreRows, t],
  );

  const handleMoveEntries = useCallback(
    async (ids: string[], date: string, slot: MealSlot) => {
      const entries = planEntriesRef.current.filter((e) => ids.includes(e.id));
      if (entries.length === 0) return;
      const { error } = await movePlanEntries(ids, { date, meal_slot: slot });
      if (error) return;
      // Group by where each came from, so Undo puts every row back.
      const origins = new Map<string, { date: string; meal_slot: MealSlot; ids: string[] }>();
      for (const e of entries) {
        const k = `${e.date}|${e.meal_slot}`;
        const o = origins.get(k) ?? { date: e.date, meal_slot: e.meal_slot, ids: [] };
        o.ids.push(e.id);
        origins.set(k, o);
      }
      const msg = t("planner.toasts.moved", { food: describeEntries(entries), day: dayName(date), slot: slotName(slot) });
      announce(msg);
      toast.success(msg, {
        action: {
          label: t("planner.actions.undo"),
          onClick: () => {
            for (const o of origins.values()) void movePlanEntries(o.ids, { date: o.date, meal_slot: o.meal_slot });
          },
        },
      });
    },
    [movePlanEntries, describeEntries, dayName, slotName, announce, t],
  );

  const handleSelectRecipeForKids = useCallback(
    async (recipeId: string, date: string, slot: MealSlot, kidIds: string[]) => {
      const recipe = recipesRef.current.find((r) => r.id === recipeId);
      if (!recipe || recipe.food_ids.length === 0) return;
      const targets = kidsById(kidIds);
      if (targets.length === 0) return;
      if (!(await guardAllergen(targets, recipe.food_ids))) return;

      const res = await scheduleRecipe(recipe.id, date, slot, targets.map((k) => k.id));
      const s = res.succeeded.length;
      const f = res.failed.length;
      if (s === 0) {
        toast.error(t("planner.toasts.recipeFailed", { name: recipe.name }));
        return;
      }
      const msg =
        f > 0
          ? t("planner.toasts.recipePartial", {
              name: recipe.name,
              succeeded: listNames(res.succeeded.map(kidName)),
              failed: listNames(res.failed.map(kidName)),
            })
          : t("planner.toasts.recipeScheduled", { name: recipe.name, count: s });
      announce(msg);
      if (f > 0) toast.warning(msg);
      else toast.success(msg);
      // US-284: one prompt for the recipe, not one per child.
      openMissingIngredientsForRecipe(recipe.id);
    },
    [kidsById, guardAllergen, scheduleRecipe, listNames, kidName, announce, openMissingIngredientsForRecipe, t],
  );

  const handleReplaceSlot = useCallback(
    async (kidIds: string[], date: string, slot: MealSlot, target: SlotTarget) => {
      const targets = kidsById(kidIds);
      if (targets.length === 0) return;
      const foodIds =
        "foodId" in target
          ? [target.foodId]
          : recipesRef.current.find((r) => r.id === target.recipeId)?.food_ids ?? [];
      if (!(await guardAllergen(targets, foodIds))) return;
      const { error } = await replaceSlot(targets.map((k) => k.id), date, slot, target);
      if (error) return;
      const msg = t("planner.toasts.slotReplaced", { day: dayName(date), slot: slotName(slot) });
      announce(msg);
      toast.success(msg);
      if ("recipeId" in target) openMissingIngredientsForRecipe(target.recipeId);
    },
    [kidsById, guardAllergen, replaceSlot, dayName, slotName, announce, openMissingIngredientsForRecipe, t],
  );

  const handleReplaceRecipeInSlot = useCallback(
    async (kidId: string, date: string, slot: MealSlot, oldRecipeId: string, newRecipeId: string) => {
      const recipe = recipesRef.current.find((r) => r.id === newRecipeId);
      const targets = kidsById([kidId]);
      if (!recipe || targets.length === 0) return;
      if (!(await guardAllergen(targets, recipe.food_ids))) return;
      const old = planEntriesRef.current.filter(
        (e) => e.kid_id === kidId && e.date === date && e.meal_slot === slot && e.recipe_id === oldRecipeId,
      );
      const del = await deletePlanEntries(old.map((e) => e.id));
      if (del.error) return;
      const res = await scheduleRecipe(newRecipeId, date, slot, [kidId]);
      if (res.succeeded.length === 0) {
        // Put the old dish back rather than leave the slot empty.
        if (del.removed.length > 0) await addPlanEntries(del.removed.map(toInsertablePlanEntry));
        toast.error(t("planner.toasts.recipeFailed", { name: recipe.name }));
        return;
      }
      const msg = t("planner.toasts.recipeReplaced", { name: recipe.name });
      announce(msg);
      toast.success(msg);
      openMissingIngredientsForRecipe(newRecipeId);
    },
    [kidsById, guardAllergen, deletePlanEntries, scheduleRecipe, addPlanEntries, announce, openMissingIngredientsForRecipe, t],
  );

  const handleMarkResult = useCallback(
    async (entry: PlanEntry, result: MealOutcome, attemptId?: string) => {
      const current = planEntriesRef.current.find((e) => e.id === entry.id) ?? entry;
      const previous = current.result;
      const updates: Partial<PlanEntry> = { result };
      if (attemptId) updates.food_attempt_id = attemptId;

      const { error } = await updatePlanEntry(entry.id, updates);
      if (error) return;

      // A NULL -> result mark wrote an attempt through the trigger; move the
      // ladder rung for it now, the same lazy path performQuickLog uses. A
      // ladder tap (attemptId) already moved it.
      if (!attemptId && previous == null) {
        void import("@/hooks/useFoodLadder")
          .then((m) => m.syncLadderAfterPlanResult(entry.id))
          .catch((syncError: unknown) => logger.warn("Ladder sync after a planner result failed:", syncError));
      }

      // Deduct once, on the way INTO "ate". Re-tapping "ate" or flipping
      // tasted -> refused must not eat the pantry a second time.
      if (result === "ate" && previous !== "ate") {
        const food = foodsRef.current.find((f) => f.id === entry.food_id);
        if (food && (food.quantity ?? 0) > 0) {
          const { error: rpcError } = await supabase.rpc("deduct_food_quantity", {
            _food_id: entry.food_id,
            _amount: 1,
          });
          if (rpcError) {
            logger.error("Error deducting quantity:", rpcError);
            toast.error(t("planner.toasts.inventoryFailed"));
          } else {
            const quantity = Math.max(0, (food.quantity ?? 0) - 1);
            updateFood(entry.food_id, { quantity });
            if (quantity === 0) {
              toast.info(t("planner.toasts.outOfStock", { name: food.name }), {
                action: {
                  label: t("planner.actions.addToGroceryList"),
                  onClick: () => {
                    const n = addGroceryItemsMerged(
                      [{ name: food.name, quantity: 1, unit: food.unit ?? "", category: food.category, added_via: "planner" }],
                      { defaultListId },
                    );
                    if (n > 0) toast.success(t("planner.toasts.groceryAdded", { count: n }));
                  },
                },
              });
            }
          }
        }
      }

      if (!attemptId) {
        const msg = t("planner.toasts.marked", { result: t(`planner.results.${result}`) });
        announce(msg);
        toast.success(msg);
      }
    },
    [updatePlanEntry, updateFood, addGroceryItemsMerged, defaultListId, announce, t],
  );

  const handleUpdateEntry = useCallback(
    (entryId: string, updates: Partial<PlanEntry>) => {
      void updatePlanEntry(entryId, updates);
    },
    [updatePlanEntry],
  );

  const addFoodForKid = useCallback(
    async (kidId: string, date: string, slot: MealSlot, foodId: string) => {
      const targets = kidsById([kidId]);
      if (targets.length === 0) {
        toast.error(t("planner.toasts.childNotFound"));
        return;
      }
      if (!(await guardAllergen(targets, [foodId]))) return;
      const { error } = await addPlanEntry({ kid_id: kidId, date, meal_slot: slot, food_id: foodId, result: null });
      if (error) return;
      const msg = t("planner.toasts.mealAdded", { food: foodName(foodId), day: dayName(date), slot: slotName(slot) });
      announce(msg);
      toast.success(msg);
    },
    [kidsById, guardAllergen, addPlanEntry, foodName, dayName, slotName, announce, t],
  );

  // Mobile handler (accepts kidId directly)
  const handleMobileAddEntry = useCallback(
    (kidId: string, date: string, slot: MealSlot, foodId: string) => {
      void addFoodForKid(kidId, date, slot, foodId);
    },
    [addFoodForKid],
  );

  // Desktop drag handler, one per grid so family mode adds to the right child.
  const addEntryByKid = useMemo(() => {
    const map = new Map<string, (date: string, slot: MealSlot, foodId: string) => void>();
    for (const k of kids) map.set(k.id, (date, slot, foodId) => void addFoodForKid(k.id, date, slot, foodId));
    return map;
  }, [kids, addFoodForKid]);

  const handleOpenFoodSelector = useCallback(
    (date: string, slot: MealSlot, kidId?: string) => {
      const targetKidId = kidId || activeKidRef.current?.id;
      if (!targetKidId) {
        toast.error(t("planner.toasts.selectChild"));
        return;
      }
      setSelectedSlot({ date, slot, kidId: targetKidId });
      setFoodSelectorOpen(true);
    },
    [t],
  );

  const handleSelectFood = useCallback(
    (foodId: string) => {
      if (!selectedSlot) return;
      void addFoodForKid(selectedSlot.kidId, selectedSlot.date, selectedSlot.slot, foodId);
    },
    [selectedSlot, addFoodForKid],
  );

  const handleSelectRecipe = useCallback(
    (recipeId: string) => {
      if (!selectedSlot) return;
      void handleSelectRecipeForKids(recipeId, selectedSlot.date, selectedSlot.slot, [selectedSlot.kidId]);
    },
    [selectedSlot, handleSelectRecipeForKids],
  );

  const handleCopyToChild = useCallback(
    async (entry: PlanEntry, targetKidId: string) => {
      const target = kidsById([targetKidId]);
      if (target.length === 0) return;
      const source = entry.recipe_id
        ? planEntriesRef.current.filter(
            (e) =>
              e.recipe_id === entry.recipe_id &&
              e.date === entry.date &&
              e.meal_slot === entry.meal_slot &&
              e.kid_id === entry.kid_id,
          )
        : [entry];
      if (!(await guardAllergen(target, source.map((e) => e.food_id)))) return;

      const taken = new Set(
        planEntriesRef.current
          .filter((e) => e.kid_id === targetKidId && e.date === entry.date && e.meal_slot === entry.meal_slot)
          .map((e) => e.food_id),
      );
      const batch = source
        .filter((e) => !taken.has(e.food_id))
        .map((e) => ({
          kid_id: targetKidId,
          date: e.date,
          meal_slot: e.meal_slot,
          food_id: e.food_id,
          recipe_id: e.recipe_id ?? null,
          is_primary_dish: e.is_primary_dish ?? false,
          result: null,
        }));
      const name = target[0].name;
      if (batch.length === 0) {
        toast.info(t("planner.toasts.alreadyPlanned", { name }));
        return;
      }
      const { error } = await addPlanEntries(batch);
      if (error) return;
      const msg = t("planner.toasts.copiedToChild", { name });
      announce(msg);
      toast.success(msg);
    },
    [kidsById, guardAllergen, addPlanEntries, announce, t],
  );

  // --- Navigation -------------------------------------------------------------
  const handlePreviousWeek = useCallback(
    () => setCurrentWeekStart(subWeeks(currentWeekStart, 1)),
    [setCurrentWeekStart, currentWeekStart],
  );
  const handleNextWeek = useCallback(
    () => setCurrentWeekStart(addWeeks(currentWeekStart, 1)),
    [setCurrentWeekStart, currentWeekStart],
  );
  const handleThisWeek = useCallback(() => setCurrentWeekStart(new Date()), [setCurrentWeekStart]);
  const handleTemplateApplied = useCallback(
    (startDate: string) => {
      if (ISO_DATE.test(startDate)) setCurrentWeekStart(parseIsoDate(startDate));
    },
    [setCurrentWeekStart],
  );
  // The controller holds the picked template between the gallery closing and
  // the apply dialog opening, so once mounted it stays mounted.
  const [templatesMounted, setTemplatesMounted] = useState(false);
  const openSaveTemplate = useCallback(() => {
    setTemplatesMounted(true);
    setShowSaveTemplate(true);
  }, []);
  const openTemplateGallery = useCallback(() => {
    setTemplatesMounted(true);
    setShowTemplateGallery(true);
  }, []);

  // --- Derived view state -------------------------------------------------------
  const weekRange = formatRange(weekStartIso);
  const activeWeekCount = activeKid
    ? planEntries.filter((e) => e.kid_id === activeKid.id && inWeek(e.date, weekStartIso)).length
    : 0;
  const lastWeekCount = activeKid
    ? planEntries.filter((e) => e.kid_id === activeKid.id && inWeek(e.date, lastWeekIso)).length
    : 0;

  const plannerHelmet = (
    <Helmet>
      <title>{t("planner.metaTitle")}</title>
      <meta name="description" content={t("planner.metaDescription")} />
      <meta name="robots" content="noindex" />
    </Helmet>
  );

  const statusNode = (
    <div role="status" aria-live="polite" className="sr-only">
      {status}
    </div>
  );

  if (kids.length === 0) {
    return (
      <div className="min-h-screen pb-20 bg-background">
        {plannerHelmet}
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <h1 className="text-xl font-semibold mb-2">{t("planner.empty.noKidsTitle")}</h1>
              <p className="text-muted-foreground mb-6">{t("planner.empty.noKidsBody")}</p>
              <Button asChild>
                <Link to="/dashboard/kids">{t("planner.empty.noKidsCta")}</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const addWeekToListButton = (
    <Button
      variant="outline"
      size={isMobile ? "sm" : "lg"}
      onClick={handlePushWeekToGrocery}
      disabled={toAddCount === 0}
      className="min-h-[44px]"
    >
      <ShoppingCart className="h-4 w-4 mr-2" aria-hidden="true" />
      {toAddCount > 0
        ? t("planner.actions.addWeekToList", { count: toAddCount })
        : t("planner.actions.addWeekToListNone")}
    </Button>
  );

  const emptyWeekPanel =
    activeKid && activeWeekCount === 0 ? (
      <Card className="p-6 mb-4">
        <h2 className="text-lg font-semibold mb-1">{t("planner.empty.weekTitle", { name: activeKid.name })}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t("planner.empty.weekBody")}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleBuildWeek} disabled={busy} className="min-h-[44px]">
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("planner.actions.quickBuild")}
          </Button>
          <Button variant="outline" onClick={handleAIMealPlan} disabled={busy} className="min-h-[44px]">
            <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("planner.actions.generateWithAi")}
          </Button>
          {lastWeekCount > 0 && (
            <Button variant="outline" onClick={handleCopyLastWeek} disabled={busy} className="min-h-[44px]">
              <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("planner.actions.copyLastWeek", { count: lastWeekCount })}
            </Button>
          )}
          <Button variant="outline" onClick={openTemplateGallery} disabled={busy} className="min-h-[44px]">
            <LayoutTemplate className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("planner.actions.useTemplate")}
          </Button>
        </div>
      </Card>
    ) : null;

  // Item 4: this week's try bites, per kid, with this month's exposures.
  const tryBiteStrip = (
    <TryBiteStrip
      weekStartIso={weekStartIso}
      planEntries={planEntries}
      foods={foods}
      kids={kids}
      activeKidId={familyMode ? null : activeKidId}
      onOpenKid={setActiveKid}
    />
  );

  const overlays = (
    <>
      {foodSelectorOpen && (
        <FoodSelectorDialog
          open={foodSelectorOpen}
          onOpenChange={setFoodSelectorOpen}
          foods={foods}
          recipes={recipes}
          slot={selectedSlot?.slot || null}
          date={selectedSlot?.date || null}
          onSelectFood={handleSelectFood}
          onSelectRecipe={handleSelectRecipe}
        />
      )}

      {/* US-284: missing-ingredient prompt after a recipe is added to a slot */}
      {pendingRecipeForMissing && (
        <MissingIngredientsDialog
          open={missingDialogOpen}
          onOpenChange={handleMissingOpenChange}
          recipeName={pendingRecipeForMissing.name}
          shortfalls={missingShortfalls}
          onConfirm={handleConfirmMissingIngredients}
        />
      )}

      <Suspense fallback={null}>
        {templatesMounted && (
          <PlannerTemplatesController
            kids={kids}
            activeKidId={activeKid ? activeKid.id : null}
            weekStart={currentWeekStart}
            saveOpen={showSaveTemplate}
            onSaveOpenChange={setShowSaveTemplate}
            galleryOpen={showTemplateGallery}
            onGalleryOpenChange={setShowTemplateGallery}
            onApplied={handleTemplateApplied}
          />
        )}
      </Suspense>

      <AlertDialog open={confirmRequest !== null} onOpenChange={(open) => !open && settleConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmRequest?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmRequest?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settleConfirm(false)}>
              {t("planner.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settleConfirm(true)}
              className={confirmRequest?.cautious ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : undefined}
            >
              {confirmRequest?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={kidChooser !== null} onOpenChange={(open) => !open && setKidChooser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("planner.confirm.chooseKidsTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("planner.confirm.chooseKidsBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {kids.map((k) => {
              const checked = kidChooser?.selected.includes(k.id) ?? false;
              return (
                <div key={k.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`planner-kid-${k.id}`}
                    checked={checked}
                    onCheckedChange={(v) =>
                      setKidChooser((cur) =>
                        cur
                          ? {
                              ...cur,
                              selected: v === true
                                ? [...new Set([...cur.selected, k.id])]
                                : cur.selected.filter((id) => id !== k.id),
                            }
                          : cur,
                      )
                    }
                  />
                  <Label htmlFor={`planner-kid-${k.id}`}>{k.name}</Label>
                </div>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("planner.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmKidChooser} disabled={(kidChooser?.selected.length ?? 0) === 0}>
              {kidChooser?.op === "ai" ? t("planner.actions.generate") : t("planner.actions.build")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // --- Mobile layout ---
  if (isMobile) {
    return (
      <div className="min-h-screen pb-20 bg-background">
        {plannerHelmet}
        {statusNode}
        <div className="px-3 pt-4 pb-2">
          <VarietyFatigueBanner surface="planner-mobile" />
          <div className="flex items-center justify-between mb-1 gap-2">
            <h1 className="text-xl font-bold text-foreground">{t("planner.titleMobile")}</h1>
            {activeKid && <span className="text-sm font-medium text-primary">{activeKid.name}</span>}
          </div>
          <div className="mb-2">{addWeekToListButton}</div>
          {emptyWeekPanel}
          {tryBiteStrip}

          <div aria-busy={busy}>
            <MobileMealPlanner
              weekStart={currentWeekStart}
              planEntries={planEntries}
              foods={foods}
              recipes={recipes}
              kids={kids}
              activeKidId={activeKid ? activeKid.id : null}
              isGeneratingPlan={busy}
              onAddEntry={handleMobileAddEntry}
              onUpdateEntry={handleUpdateEntry}
              onSelectRecipeForKids={handleSelectRecipeForKids}
              onDeleteEntries={handleDeleteEntries}
              onReplaceSlot={handleReplaceSlot}
              onPushWeekToGrocery={handlePushWeekToGrocery}
              onMarkResult={handleMarkResult}
              onBuildWeek={handleBuildWeek}
              onAIGenerate={handleAIMealPlan}
              onPreviousWeek={handlePreviousWeek}
              onNextWeek={handleNextWeek}
              onThisWeek={handleThisWeek}
              onCopyWeek={handleCopyWeek}
              onClearWeek={handleClearWeek}
              onSaveTemplate={openSaveTemplate}
              onOpenTemplateGallery={openTemplateGallery}
            />
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  const gridFallback = (
    <div className="py-8 flex justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );

  const renderGrid = (kid: Kid) => {
    const age = calculateAge(kid.date_of_birth) ?? kid.age;
    return (
      <Suspense fallback={gridFallback}>
        <GSAPCalendarMealPlanner
          weekStart={currentWeekStart}
          planEntries={planEntries}
          foods={foods}
          recipes={recipes}
          kids={kids}
          kidId={kid.id}
          kidName={kid.name}
          kidAge={age ?? undefined}
          kidWeight={kid.weight_kg ? Number(kid.weight_kg) : undefined}
          onUpdateEntry={handleUpdateEntry}
          onAddEntry={addEntryByKid.get(kid.id)}
          onOpenFoodSelector={handleOpenFoodSelector}
          onCopyToChild={handleCopyToChild}
          onCopyWeek={handleCopyWeek}
          onClearWeek={handleClearWeek}
          onOpenMissingForRecipe={openMissingIngredientsForRecipe}
          onDeleteEntries={handleDeleteEntries}
          onMarkResult={handleMarkResult}
          onMoveEntries={handleMoveEntries}
          onPushWeekToGrocery={handlePushWeekToGrocery}
          onReplaceRecipeInSlot={handleReplaceRecipeInSlot}
          onOpenSaveTemplate={openSaveTemplate}
          onOpenTemplateGallery={openTemplateGallery}
        />
      </Suspense>
    );
  };

  // --- Desktop layout ---
  return (
    <div className="min-h-screen pb-20 bg-background">
      {plannerHelmet}
      {statusNode}
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <VarietyFatigueBanner surface="planner-desktop" />
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                {t("planner.title")}
                {activeKid && <span className="text-primary"> - {activeKid.name}</span>}
              </h1>
              <p className="text-muted-foreground">{t("planner.subtitle")}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleAIMealPlan} size="lg" disabled={busy}>
                {busyOp === "ai" ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" aria-hidden="true" />
                    {t("planner.actions.generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" aria-hidden="true" />
                    {t("planner.actions.aiGenerate")}
                  </>
                )}
              </Button>
              <Button onClick={handleBuildWeek} variant="outline" size="lg" disabled={busy}>
                {busyOp === "build" ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-5 w-5 mr-2" aria-hidden="true" />
                )}
                {t("planner.actions.quickBuild")}
              </Button>
              {addWeekToListButton}
            </div>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handlePreviousWeek} aria-label={t("planner.week.previous")}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div className="text-center min-w-[200px]">
                  <div className="font-semibold flex items-center justify-center gap-2">
                    {weekRange}
                    {isThisWeek && <Badge variant="secondary">{t("planner.week.thisWeekBadge")}</Badge>}
                  </div>
                </div>
                <Button variant="outline" size="icon" onClick={handleNextWeek} aria-label={t("planner.week.next")}>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {!isThisWeek && (
                <Button variant="outline" onClick={handleThisWeek} className="min-h-[44px]">
                  <Calendar className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("planner.week.thisWeek")}
                </Button>
              )}
            </div>
          </Card>
        </div>

        {tryBiteStrip}

        <div aria-busy={busy}>
          {familyMode ? (
            // Item 2: one grid for the family, a dish per day and slot with
            // each kid's line under it, instead of one grid per child.
            <FamilyWeekGrid
              weekStart={currentWeekStart}
              planEntries={planEntries}
              foods={foods}
              recipes={recipes}
              kids={kids}
              onAddEntry={handleMobileAddEntry}
              onSelectRecipeForKids={handleSelectRecipeForKids}
              onReplaceSlot={handleReplaceSlot}
              onDeleteEntries={handleDeleteEntries}
              onMoveEntries={handleMoveEntries}
              onMarkResult={handleMarkResult}
              onViewKid={setActiveKid}
              onCopyWeek={handleCopyWeek}
              onClearWeek={handleClearWeek}
              onOpenSaveTemplate={openSaveTemplate}
              onOpenTemplateGallery={openTemplateGallery}
              onOpenMissingForRecipe={openMissingIngredientsForRecipe}
            />
          ) : (
            <>
              {emptyWeekPanel}
              {renderGrid(activeKid)}
            </>
          )}
        </div>

        {overlays}
      </div>
    </div>
  );
}
