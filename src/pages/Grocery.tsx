import { lazy, Suspense, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { separateMeasureNotes, type GroceryAddInput } from "@/lib/groceryMerge";
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from "@/lib/foodSafetyDefault";
import { useTranslation } from "react-i18next";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Helmet } from "react-helmet-async";
import { useFoods, useGrocery, useKids, usePlan, useRecipes, useInventory } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { MovementItem, PurchasableGroceryItem } from "@/lib/movementBuilders";
import { countMissingForRecipe } from "@/lib/recipeShortfall";
import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { EditGroceryItemDialog } from "@/components/EditGroceryItemDialog";
import { SmartRestockSuggestions, type RestockAddSource } from "@/components/SmartRestockSuggestions";
import { GroceryListSelector } from "@/components/GroceryListSelector";
import { CreateGroceryListDialog } from "@/components/CreateGroceryListDialog";
import { ManageGroceryListsDialog } from "@/components/ManageGroceryListsDialog";
import { GroceryRow } from "@/components/grocery/GroceryRow";
import { GroceryGroupHeader } from "@/components/grocery/GroceryGroupHeader";
import { GroceryQuickAdd } from "@/components/grocery/GroceryQuickAdd";
import { CheckoutBar } from "@/components/grocery/CheckoutBar";
import { PlanSyncBanner } from "@/components/grocery/PlanSyncBanner";
import { StorePicker } from "@/components/grocery/StorePicker";
import { PlaceInAisleChips } from "@/components/grocery/PlaceInAisleChips";
import { useStoreLayouts } from "@/hooks/useStoreLayouts";
import { useGroceryLists } from "@/hooks/useGroceryLists";
import type { StoreLayoutRow } from "@/lib/storeLayouts";
import { aislePosition, isUnplaced as isUnplacedAisle, sortAisleGroupNames } from "@/lib/storeWalkOrder";
import { startOfWeek, endOfWeek, toISODate } from "@/lib/date-utils";
import {
  ShoppingCart, Printer, Download, Plus, Share2, FileText,
  Store, Barcode, RefreshCw, ChevronDown, MoreHorizontal, PackageCheck,
  ShoppingBag, CloudOff, CalendarDays, ClipboardPaste, Loader2, Check,
} from "lucide-react";
import { toast } from "sonner";
import type { Food, GroceryItem } from "@/types";
import {
  categoryLabel,
  filterItemsByList,
  splitByChecked,
  computeProgressPercent,
  milestoneKey,
  groupItems,
  flattenGroupedRows,
  buildFoodByDisplayNameIndex,
  buildGroceryKidIndex,
  groceryKidKey,
  initialExpandedGroups,
  reconcileExpandedGroups,
  orderGroupNames,
  slugifyGroupId,
  stepQuantity,
  withLingering,
} from "@/lib/groceryData";
import { buildResultIndex, getKidFoodFit, summarizeKidFits, type ItemFit, type ResultIndex } from "@/lib/kidFit";
import { resolveFood, type EffectiveFood } from "@/lib/effectiveFood";
import { toCsv, downloadCsv } from "@/lib/csvExport";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHousehold } from "@/hooks/useHousehold";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { usePendingGroceryIds } from "@/hooks/usePendingGroceryIds";
import { usePlanToGrocery, type PlanToGroceryOptions, type PlanToGroceryResult } from "@/hooks/usePlanToGrocery";
import "@/i18n/appLocale";

// Mounted only while open (US perf pass): none of these is on the path to the
// first painted row, and together they are most of the page's JavaScript.
const AddGroceryItemDialog = lazy(() =>
  import("@/components/AddGroceryItemDialog").then((m) => ({ default: m.AddGroceryItemDialog })),
);
const ImportRecipeToGroceryDialog = lazy(() =>
  import("@/components/ImportRecipeToGroceryDialog").then((m) => ({ default: m.ImportRecipeToGroceryDialog })),
);
const ScanReceiptDialog = lazy(() =>
  import("@/components/ScanReceiptDialog").then((m) => ({ default: m.ScanReceiptDialog })),
);
const CreateStoreLayoutDialog = lazy(() =>
  import("@/components/CreateStoreLayoutDialog").then((m) => ({ default: m.CreateStoreLayoutDialog })),
);
const ManageStoreLayoutsDialog = lazy(() =>
  import("@/components/ManageStoreLayoutsDialog").then((m) => ({ default: m.ManageStoreLayoutsDialog })),
);
const ManageStoreAislesDialog = lazy(() =>
  import("@/components/ManageStoreAislesDialog").then((m) => ({ default: m.ManageStoreAislesDialog })),
);

// Grocery data derivations (labels, grouping, split, progress, flatten) live in
// src/lib/groceryData.ts (unit-tested) so they're separated from this JSX and
// the heavy list subtree can memoize on stable outputs (US-553 AC2).

/** How long a just-checked row stays crossed out in place before it moves. */
const LINGER_MS = 2000;
/** Screen-reader announcements coalesce over a burst of check-offs. */
const ANNOUNCE_DEBOUNCE_MS = 800;
/** Virtualize above 60 rows, go back to plain rendering below 40. */
const VIRTUAL_ENTER = 60;
const VIRTUAL_LEAVE = 40;

/** Units match case-insensitively; an absent unit only matches an absent one. */
function unitsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** A deleted/checked-out row as it was, for an Undo that restores it exactly. */
const snapshot = (item: GroceryItem): GroceryItem => ({ ...item });

interface RowMeta {
  fit?: ItemFit;
  forKidNames?: string[];
  addedByName?: string;
  pending: boolean;
  measureNote?: string;
}

export default function Grocery() {
  const { t } = useTranslation();
  const { foods, addFood, updateFood, catalogById } = useFoods();
  // US-672: with writes on, checkout appends purchase movements and the pantry
  // is credited by the ledger rather than by the per-item toggle.
  const { ledgerWritesEnabled, recordPurchases, recordPurchaseReversal } = useInventory();
  const { kids, activeKidId } = useKids();
  const { planEntries } = usePlan();
  const {
    groceryItems, groceryHydrated,
    toggleGroceryItem, updateGroceryItem, deleteGroceryItem, deleteGroceryItems,
    mergeGroceryItems, restoreGroceryItems,
  } = useGrocery();
  const { recipes } = useRecipes();
  // The session AuthContext already resolved. The page used to run its own
  // getUser() + get_user_household_id pair, which failed offline and took
  // Add down with it, although nothing about adding a row needs the network.
  const { userId, householdId } = useAuth();
  const { members } = useHousehold();
  const reducedMotion = useReducedMotion();
  const { ids: pendingIds, count: pendingCount } = usePendingGroceryIds(userId);

  const [groupBy, setGroupBy] = useState<"category" | "aisle">("aisle");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showScanReceipt, setShowScanReceipt] = useState(false);
  const [showImportRecipeDialog, setShowImportRecipeDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);
  // The lists, the selection (remembered per user) and the default. US-714:
  // the default list owns the rows whose grocery_list_id is null.
  const groceryLists = useGroceryLists(userId, householdId);
  const { selectedListId, setSelectedListId, defaultListId } = groceryLists;
  const [showCreateListDialog, setShowCreateListDialog] = useState(false);
  const [showManageListsDialog, setShowManageListsDialog] = useState(false);

  // Store layouts: the list's chosen store (grocery_lists.store_layout_id, the
  // field iOS reads too) and its walk order.
  const storeLayouts = useStoreLayouts(householdId, selectedListId);
  const [showCreateStoreDialog, setShowCreateStoreDialog] = useState(false);
  const [showManageStoresDialog, setShowManageStoresDialog] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreLayoutRow | null>(null);
  const [managingAislesStore, setManagingAislesStore] = useState<StoreLayoutRow | null>(null);

  // Purchased section: null means "follow the default", which is open when
  // there is nothing left to buy and closed otherwise.
  const [purchasedOpenPref, setPurchasedOpenPref] = useState<boolean | null>(null);

  // Checkout re-entry guard. The ref short-circuits a second click in the same
  // tick; the state drives the disabled/aria-busy CTA.
  const checkingOutRef = useRef(false);
  const [checkingOut, setCheckingOut] = useState(false);

  // Just-checked rows stay in place for LINGER_MS (id -> checked-at).
  const [recentlyChecked, setRecentlyChecked] = useState<ReadonlyMap<string, number>>(() => new Map());

  // The one live region on the page.
  const [announcement, setAnnouncement] = useState("");
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clipboard fallback: shown when the browser refuses the write.
  const [copyFallback, setCopyFallback] = useState<string | null>(null);

  // Print expands every aisle, whatever the fold on screen.
  const [printing, setPrinting] = useState(false);

  // US-712: there is deliberately no mount-time cleanup of checked rows.
  // Checked rows live in the Purchased section until the explicit checkout
  // below, which is the only path that removes them.

  const isFamilyMode = !activeKidId;

  // Filter grocery items by selected list
  const filteredGroceryItems = useMemo(
    () => filterItemsByList(groceryItems, selectedListId, defaultListId),
    [groceryItems, selectedListId, defaultListId]
  );

  // Split into active (unchecked) and purchased (checked) items
  const { active: activeItems, purchased: purchasedItems } = useMemo(
    () => splitByChecked(filteredGroceryItems),
    [filteredGroceryItems]
  );

  /**
   * US-820: which rows are a second MEASURE rather than a duplicate. Computed
   * over the ACTIVE rows only: a purchased row is not something the shopper
   * is about to delete by mistake.
   */
  const measureNotes = useMemo(() => separateMeasureNotes(activeItems), [activeItems]);

  // Progress calculation
  const totalItems = filteredGroceryItems.length;
  const purchasedCount = purchasedItems.length;
  const leftCount = activeItems.length;
  const progressPercent = useMemo(
    () => computeProgressPercent(totalItems, purchasedCount),
    [totalItems, purchasedCount]
  );

  // US-713: the days a sync shops for. The Grocery page has no week picker, so
  // the visible week is the current one.
  const shoppingWindow = useMemo(() => {
    const now = new Date();
    return { from: toISODate(startOfWeek(now)), to: toISODate(endOfWeek(now)) };
  }, []);

  // US-795: match a grocery row back to a pantry food by resolved or raw name.
  const foodByDisplayName = useMemo(
    () => buildFoodByDisplayNameIndex(foods, catalogById),
    [foods, catalogById]
  );
  const findFoodByDisplayName = useCallback(
    (name: string): Food | undefined => foodByDisplayName.get(name.toLowerCase()),
    [foodByDisplayName]
  );

  const effectiveFoodById = useMemo(() => {
    const map: Record<string, EffectiveFood> = {};
    for (const food of foods) {
      const catalog = food.canonical_id ? catalogById[food.canonical_id] : null;
      map[food.id] = resolveFood(food, catalog);
    }
    return map;
  }, [foods, catalogById]);

  // Which kid each row is for, from every in-window plan entry.
  const kidIndex = useMemo(
    () => buildGroceryKidIndex(planEntries, foods, effectiveFoodById, shoppingWindow),
    [planEntries, foods, effectiveFoodById, shoppingWindow]
  );
  const kidById = useMemo(() => new Map(kids.map((k) => [k.id, k])), [kids]);
  const resultIndexByKid = useMemo(() => {
    const map = new Map<string, ResultIndex>();
    for (const kid of kids) map.set(kid.id, buildResultIndex(planEntries, kid.id));
    return map;
  }, [kids, planEntries]);
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      const name = m.profiles?.full_name?.trim();
      if (name) map.set(m.user_id, name.split(/\s+/)[0]);
    }
    return map;
  }, [members]);
  const sharedHousehold = members.length > 1;

  // Refs the stable row handlers read, so GroceryRow's memo holds across
  // renders instead of every row re-rendering on every list change.
  const itemsRef = useRef(groceryItems);
  itemsRef.current = groceryItems;
  const recentlyCheckedRef = useRef(recentlyChecked);
  recentlyCheckedRef.current = recentlyChecked;

  // ─── Plan to grocery ───────────────────────────────────────────────────
  // One options object for both preview and push, so the number on the banner
  // is the number the Add button writes.
  const { preview: previewPlan, push: pushPlanToGrocery } = usePlanToGrocery();
  const planOpts = useMemo<PlanToGroceryOptions>(
    () => ({
      kidIds: isFamilyMode || !activeKidId ? undefined : [activeKidId],
      selectedListId,
      defaultListId,
    }),
    [isFamilyMode, activeKidId, selectedListId, defaultListId]
  );
  const planPreview = useMemo(
    () => previewPlan(planEntries, shoppingWindow, planOpts),
    // groceryItems: preview reads the list through a ref, so a list change
    // has to recompute it even though previewPlan's identity holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewPlan, planEntries, shoppingWindow, planOpts, groceryItems]
  );

  /** Undo a push: delete what it inserted, restore what it retired, revert bumps. */
  const undoPlanPush = useCallback((result: PlanToGroceryResult) => {
    deleteGroceryItems(result.insertedIds);
    if (result.retiredRows.length > 0) restoreGroceryItems(result.retiredRows);
    for (const bump of result.bumps) updateGroceryItem(bump.id, bump.prev);
  }, [deleteGroceryItems, restoreGroceryItems, updateGroceryItem]);

  const runPlanPush = useCallback((mode: "additive" | "replace") => {
    if (planEntries.length === 0) {
      toast.info(t("grocery.planSync.noPlanTitle", { defaultValue: "No meal plan found" }), {
        description: t("grocery.planSync.noPlanBody", {
          defaultValue: "Create a meal plan first to generate a grocery list",
        }),
      });
      return;
    }
    const result = pushPlanToGrocery(planEntries, shoppingWindow, { ...planOpts, mode });
    if (result.added === 0 && result.retired === 0) {
      toast.info(t("grocery.planSync.upToDateTitle", { defaultValue: "Already up to date" }));
      return;
    }
    const title = result.added > 0
      ? t("grocery.planSync.addedTitle", {
          defaultValue: "Added {{count}} item from meal plan",
          defaultValue_other: "Added {{count}} items from meal plan",
          count: result.added,
        })
      : t("grocery.plan.removed", {
          defaultValue: "Removed {{count}} no longer planned",
          count: result.retired,
        });
    toast.success(title, {
      description: result.added > 0 && result.retired > 0
        ? t("grocery.planSync.addedRetiredBody", {
            defaultValue: "Removed {{retired}} no longer planned, kept {{kept}}",
            retired: result.retired,
            kept: result.kept,
          })
        : undefined,
      action: {
        label: t("grocery.undo", { defaultValue: "Undo" }),
        onClick: () => undoPlanPush(result),
      },
    });
  }, [planEntries, shoppingWindow, planOpts, pushPlanToGrocery, undoPlanPush, t]);

  const handleAddFromPlan = useCallback(() => runPlanPush("additive"), [runPlanPush]);
  const handleReplaceFromPlan = useCallback(() => runPlanPush("replace"), [runPlanPush]);

  // ─── Adds ──────────────────────────────────────────────────────────────
  /** Every add path funnels here: stamped for the list on screen, merged. */
  const addToList = useCallback((items: GroceryAddInput[]) => {
    return mergeGroceryItems(
      items.map((i) => ({ ...i, grocery_list_id: selectedListId ?? undefined, added_via: i.added_via ?? "manual" })),
      { defaultListId },
    );
  }, [mergeGroceryItems, selectedListId, defaultListId]);

  const handleRestockAdd = useCallback((items: GroceryAddInput[], source: RestockAddSource) => {
    const result = mergeGroceryItems(
      items.map((i) => ({ ...i, grocery_list_id: selectedListId ?? undefined })),
      { defaultListId },
    );
    if (result.touched === 0) return;
    const title = t("grocery.restock.added", {
      defaultValue: "Added {{count}} restock item",
      defaultValue_other: "Added {{count}} restock items",
      count: result.touched,
    });
    toast.success(title, {
      // An automatic add nobody tapped for has to say what it put on the list.
      description: source === "auto"
        ? t("grocery.restock.addedNames", {
            defaultValue: "Running low: {{names}}",
            names: items.map((i) => i.name).join(", "),
          })
        : undefined,
      action: {
        label: t("grocery.undo", { defaultValue: "Undo" }),
        onClick: () => {
          deleteGroceryItems(result.insertedIds);
          for (const bump of result.bumps) updateGroceryItem(bump.id, bump.prev);
        },
      },
    });
  }, [mergeGroceryItems, selectedListId, defaultListId, deleteGroceryItems, updateGroceryItem, t]);

  // ─── Pantry crediting (legacy mode) ────────────────────────────────────
  /**
   * Credit one bought row to the pantry the legacy way. Quantity is added only
   * when the units agree; "2 lb" onto a food counted in "bags" is not a sum,
   * and the food's own unit is never overwritten. Returns what happened.
   */
  const creditRow = useCallback(async (item: GroceryItem): Promise<"credited" | "unitDiffers" | "blocked"> => {
    const existingFood = findFoodByDisplayName(item.name);
    if (existingFood) {
      if (!unitsMatch(existingFood.unit, item.unit)) return "unitDiffers";
      updateFood(existingFood.id, { quantity: (existingFood.quantity || 0) + item.quantity });
      return "credited";
    }
    const added = await addFood({
      name: item.name,
      category: item.category,
      // US-803: buying a food is not the same as a child accepting it.
      is_safe: ACQUIRED_FOOD_IS_SAFE,
      is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
      aisle: item.aisle,
      quantity: item.quantity,
      unit: item.unit,
    });
    return added ? "credited" : "blocked";
  }, [findFoodByDisplayName, updateFood, addFood]);

  const uncreditRow = useCallback((item: GroceryItem) => {
    const food = findFoodByDisplayName(item.name);
    if (!food || !food.quantity || !unitsMatch(food.unit, item.unit)) return;
    updateFood(food.id, { quantity: Math.max(0, food.quantity - item.quantity) });
  }, [findFoodByDisplayName, updateFood]);

  // ─── Check-off ─────────────────────────────────────────────────────────
  const announce = useCallback((text: string) => {
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnouncement(text), ANNOUNCE_DEBOUNCE_MS);
  }, []);
  useEffect(() => () => {
    if (announceTimer.current) clearTimeout(announceTimer.current);
  }, []);

  const leftCountRef = useRef(leftCount);
  leftCountRef.current = leftCount;

  const handleToggleItem = useCallback(async (itemId: string) => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    toggleGroceryItem(itemId);

    if (!item.checked) {
      setRecentlyChecked((prev) => new Map(prev).set(itemId, Date.now()));
      announce(t("grocery.row.checkedAnnounce", {
        defaultValue: "{{name}} checked off, {{left}} left",
        name: item.name,
        left: Math.max(0, leftCountRef.current - 1),
      }));

      // US-672 criterion 3: with the ledger on, checking off is just marking
      // it bought; checkout credits the pantry once.
      if (ledgerWritesEnabled) return;
      const outcome = await creditRow(item);
      if (outcome === "blocked") {
        // The plan limit stopped the pantry add. The row stays checked so the
        // shop can go on; this is the only check-off that says anything.
        toast.info(t("grocery.checkout.pantryFull", {
          defaultValue: "Pantry full on your plan, {{name}} not added",
          name: item.name,
        }));
      }
    } else {
      setRecentlyChecked((prev) => {
        if (!prev.has(itemId)) return prev;
        const next = new Map(prev);
        next.delete(itemId);
        return next;
      });
      // Nothing to take back when nothing was credited yet.
      if (ledgerWritesEnabled) return;
      uncreditRow(item);
    }
  }, [toggleGroceryItem, announce, t, ledgerWritesEnabled, creditRow, uncreditRow]);

  // Flush lingering rows. 0ms under reduced motion: nothing animates, so
  // nothing needs to wait.
  const lingerMs = reducedMotion ? 0 : LINGER_MS;
  useEffect(() => {
    if (recentlyChecked.size === 0) return;
    const oldest = Math.min(...recentlyChecked.values());
    const wait = Math.max(0, oldest + lingerMs - Date.now());
    const timer = setTimeout(() => {
      setRecentlyChecked((prev) => {
        const now = Date.now();
        const next = new Map([...prev].filter(([, ts]) => now - ts < lingerMs));
        return next.size === prev.size ? prev : next;
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [recentlyChecked, lingerMs]);

  const handleDeleteItem = useCallback((itemId: string) => {
    const item = itemsRef.current.find(i => i.id === itemId);
    deleteGroceryItem(itemId);
    if (!item) return;
    const saved = snapshot(item);
    toast.success(t("grocery.removed", { defaultValue: "Removed {{name}}", name: item.name }), {
      action: {
        label: t("grocery.undo", { defaultValue: "Undo" }),
        // Same id, every field, checked state included.
        onClick: () => restoreGroceryItems([saved]),
      },
    });
  }, [deleteGroceryItem, restoreGroceryItems, t]);

  // Stable row handlers (GroceryRow is memoized).
  const toggleRef = useRef(handleToggleItem);
  toggleRef.current = handleToggleItem;
  const deleteRef = useRef(handleDeleteItem);
  deleteRef.current = handleDeleteItem;
  const onRowToggle = useCallback((item: GroceryItem) => { void toggleRef.current(item.id); }, []);
  const onRowOpen = useCallback((item: GroceryItem) => setEditingItem(item), []);
  const onRowDelete = useCallback((item: GroceryItem) => deleteRef.current(item.id), []);
  const onRowQuantityStep = useCallback((item: GroceryItem, delta: number) => {
    const current = itemsRef.current.find((i) => i.id === item.id);
    if (!current) return;
    updateGroceryItem(item.id, { quantity: stepQuantity(current.quantity, delta) });
  }, [updateGroceryItem]);

  // ─── Checkout ──────────────────────────────────────────────────────────
  // US-282, amended by US-672. Two shapes, chosen by the writes flag.
  //
  //   flag OFF  each check-off already credited the pantry, so checkout only
  //             clears the bought rows of THIS list.
  //   flag ON   one purchase movement per checked row, appended here. A
  //             failed append changes nothing: rows stay checked and on the
  //             list. Rows the ledger could not take fall back to the legacy
  //             credit, and nothing claims the pantry was credited until it was.
  const purchasedRef = useRef(purchasedItems);
  purchasedRef.current = purchasedItems;

  const handleDoneShopping = useCallback(async () => {
    if (checkingOutRef.current) return;
    const rows = purchasedRef.current.map(snapshot);
    if (rows.length === 0) return;
    checkingOutRef.current = true;
    setCheckingOut(true);
    try {
      let recordedIds: string[] = [];
      const fallbackCredited: GroceryItem[] = [];
      let unitDiffers = 0;
      let blocked = 0;

      if (ledgerWritesEnabled) {
        const result = await recordPurchases(
          rows as unknown as PurchasableGroceryItem[],
          foods as unknown as MovementItem[],
          findFoodByDisplayName,
        );
        if (result.reason === "the append failed") {
          toast.error(t("grocery.checkout.failed", {
            defaultValue: "Couldn't record this shop. Your items are still checked, try again.",
          }));
          return;
        }
        for (const failure of result.skipped) {
          logger.warn("US-672: grocery row not recorded as a purchase movement", {
            reason: failure.reason,
            groceryItemId: failure.groceryItemId,
          });
        }
        recordedIds = result.recordedRowIds;
        const recorded = new Set(recordedIds);
        for (const row of rows.filter((r) => !recorded.has(r.id))) {
          const outcome = await creditRow(row);
          if (outcome === "credited") fallbackCredited.push(row);
          else if (outcome === "unitDiffers") unitDiffers++;
          else blocked++;
        }
      }

      // US-292: plan entries whose missing-ingredient badge this shop cleared.
      const credited = ledgerWritesEnabled
        ? rows.filter((r) => recordedIds.includes(r.id) || fallbackCredited.includes(r))
        : rows;
      const preFoods = foods.map(f => ({ ...f }));
      for (const item of credited) {
        const food = findFoodByDisplayName(item.name);
        const target = food && preFoods.find(f => f.id === food.id);
        if (target) target.quantity = Math.max(0, (target.quantity ?? 0) - (item.quantity ?? 1));
      }
      const recipeIdsInPlan = new Set(planEntries.filter(p => p.recipe_id).map(p => p.recipe_id!));
      let plan_entries_cleared = 0;
      for (const recipeId of recipeIdsInPlan) {
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) continue;
        if (countMissingForRecipe(recipe, preFoods) > 0 && countMissingForRecipe(recipe, foods) === 0) {
          plan_entries_cleared++;
        }
      }
      if (plan_entries_cleared > 0) {
        analytics.trackEvent("missing_flags_cleared_after_pantry_move", {
          plan_entries_cleared,
          items_moved: credited.length,
        });
      }

      // Only the rows of the list on screen. clearCheckedGroceryItems swept
      // every checked row in the household, including another list's cart.
      deleteGroceryItems(rows.map((r) => r.id));
      setPurchasedOpenPref(null);

      const undo = () => {
        if (ledgerWritesEnabled) {
          const recordedSet = new Set(recordedIds);
          const recordedRows = rows.filter((r) => recordedSet.has(r.id));
          if (recordedRows.length > 0) {
            void recordPurchaseReversal(
              recordedRows as unknown as PurchasableGroceryItem[],
              foods as unknown as MovementItem[],
              findFoodByDisplayName,
            );
          }
          fallbackCredited.forEach(uncreditRow);
        }
        // Back as they were, checked: in legacy mode the pantry still holds
        // them, so a checked row is the true state.
        restoreGroceryItems(rows.map((r) => ({ ...r, checked: true })));
      };

      const notes: string[] = [];
      if (unitDiffers > 0) {
        notes.push(t("grocery.checkout.unitDiffers", {
          defaultValue: "{{count}} not added to the pantry: unit differs",
          count: unitDiffers,
        }));
      }
      if (blocked > 0) {
        notes.push(t("grocery.checkout.blocked", {
          defaultValue: "{{count}} not added: pantry full on your plan",
          count: blocked,
        }));
      }
      const description = notes.length > 0 ? notes.join(". ") : undefined;
      const action = { label: t("grocery.undo", { defaultValue: "Undo" }), onClick: undo };

      if (ledgerWritesEnabled) {
        const creditedCount = recordedIds.length + fallbackCredited.length;
        if (creditedCount > 0) {
          toast.success(t("grocery.checkout.recorded", {
            defaultValue: "Added {{count}} item to your pantry",
            defaultValue_other: "Added {{count}} items to your pantry",
            count: creditedCount,
          }), { description, action });
        } else {
          toast.info(t("grocery.checkout.cleared", {
            defaultValue: "Cleared {{count}} bought item",
            defaultValue_other: "Cleared {{count}} bought items",
            count: rows.length,
          }), { description, action });
        }
      } else {
        toast.success(t("grocery.checkout.cleared", {
          defaultValue: "Cleared {{count}} bought item",
          defaultValue_other: "Cleared {{count}} bought items",
          count: rows.length,
        }), { description, action });
      }
    } catch (error) {
      logger.error("Grocery checkout failed:", error);
      toast.error(t("grocery.checkout.failed", {
        defaultValue: "Couldn't record this shop. Your items are still checked, try again.",
      }));
    } finally {
      checkingOutRef.current = false;
      setCheckingOut(false);
    }
  }, [
    ledgerWritesEnabled, recordPurchases, recordPurchaseReversal, foods, findFoodByDisplayName,
    creditRow, uncreditRow, planEntries, recipes, deleteGroceryItems, restoreGroceryItems, t,
  ]);

  // ─── Grouping, order, fold ─────────────────────────────────────────────
  // Lingering rows stay among the active ones, crossed out, where they were.
  const lingerIds = useMemo(() => new Set(recentlyChecked.keys()), [recentlyChecked]);
  const { active: shownActive, purchased: shownPurchased } = useMemo(
    () => withLingering(activeItems, purchasedItems, lingerIds, filteredGroceryItems),
    [activeItems, purchasedItems, lingerIds, filteredGroceryItems]
  );

  // Every row shows whichever kid is selected elsewhere in the app. Filtering
  // to one kid's planned foods hid hand-added rows (milk, nappies) with no
  // way back from this page, and left a blank list while the progress bar
  // still counted them. Who a row is for is on the row instead.
  const visibleActive = shownActive;

  const activeItemsByGroup = useMemo(
    () => groupItems(visibleActive, groupBy),
    [visibleActive, groupBy]
  );

  const groupNames = useMemo(
    () => Object.keys(activeItemsByGroup).filter((g) => activeItemsByGroup[g].length > 0),
    [activeItemsByGroup]
  );
  const groupOrder = useMemo(
    () => groupBy === "aisle"
      ? sortAisleGroupNames(groupNames, storeLayouts.walkContext)
      : orderGroupNames(groupNames, groupBy),
    [groupBy, groupNames, storeLayouts.walkContext]
  );

  /*
    US-767: at phone width the aisles fold, and the one the shopper is working
    through stays open. Reconciled whenever the grouping changes, so checking
    the last item off an aisle does not slam shut one the shopper opened.
  */
  const isPhoneWidth = useIsMobile();
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() =>
    initialExpandedGroups(groupOrder, isPhoneWidth, groupOrder)
  );
  // Keyed on the NAMES, not the array: groupItems returns a fresh object every
  // render, so an effect depending on the array identity re-runs every time.
  const groupKey = groupOrder.join('\u0000');
  useEffect(() => {
    setExpandedGroups((prev) =>
      reconcileExpandedGroups(prev, groupKey ? groupKey.split('\u0000') : [], isPhoneWidth)
    );
  }, [groupKey, isPhoneWidth]);

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Print: every group open while the dialog is up.
  useEffect(() => {
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const collapsible = isPhoneWidth && !printing;
  const renderExpanded = useMemo<ReadonlySet<string>>(
    () => (collapsible ? expandedGroups : new Set(groupOrder)),
    [collapsible, expandedGroups, groupOrder]
  );

  // ─── Per-row meta ──────────────────────────────────────────────────────
  const rowMeta = useMemo(() => {
    const map = new Map<string, RowMeta>();
    for (const item of visibleActive) {
      const kidIds = kidIndex.get(groceryKidKey(item.name)) ?? [];
      const forKids = kidIds.map((id) => kidById.get(id)).filter((k): k is NonNullable<typeof k> => !!k);
      // Nobody planned it: every kid in the house still eats from the fridge,
      // so the allergen check runs against all of them.
      const checkKids = forKids.length > 0 ? forKids : kids;
      const food = findFoodByDisplayName(item.name);
      const fit = food && checkKids.length > 0
        ? summarizeKidFits(checkKids.map((kid) => ({
            kid,
            fit: getKidFoodFit(kid, food, resultIndexByKid.get(kid.id) ?? planEntries),
          })))
        : undefined;
      const adder = item.added_by_user_id;
      const addedByName = sharedHousehold && adder && adder !== userId ? memberNameById.get(adder) : undefined;
      const notes = measureNotes.get(item.id);
      map.set(item.id, {
        fit,
        forKidNames: forKids.length > 0 ? forKids.map((k) => k.name) : undefined,
        addedByName,
        pending: pendingIds.has(item.id),
        measureNote: notes && notes.length > 0 ? notes.join(", ") : undefined,
      });
    }
    return map;
  }, [
    visibleActive, kidIndex, kidById, kids, findFoodByDisplayName, resultIndexByKid, planEntries,
    sharedHousehold, userId, memberNameById, measureNotes, pendingIds,
  ]);

  /** A group with no home in this store: Uncategorized, or an aisle it lacks. */
  const isUnplaced = useCallback(
    (group: string) => groupBy === "aisle" && isUnplacedAisle(group, storeLayouts.walkContext),
    [groupBy, storeLayouts.walkContext]
  );
  /** Aisle number and "3 of 12" place for a group header, when the store knows it. */
  const headerPlace = useCallback((group: string) => {
    if (groupBy !== "aisle") return { aisleNumber: null, position: undefined, total: undefined };
    const place = aislePosition(group, storeLayouts.walkContext);
    return place
      ? { aisleNumber: place.aisleNumber, position: place.index + 1, total: place.total }
      : { aisleNumber: null, position: undefined, total: undefined };
  }, [groupBy, storeLayouts.walkContext]);

  const { rememberAisle } = storeLayouts;
  const onPlaceInAisle = useCallback((item: GroceryItem, aisleName: string, aisleId: string) => {
    updateGroceryItem(item.id, { aisle: aisleName });
    rememberAisle(item.name, aisleId);
  }, [updateGroceryItem, rememberAisle]);
  // "Not here" is remembered per store by the chips themselves; this hides
  // the prompt for the rest of the visit even before storage answers.
  const [placePromptOff, setPlacePromptOff] = useState(false);

  // ─── Virtualization ────────────────────────────────────────────────────
  // With hysteresis: a list hovering around one threshold would otherwise
  // swap renderers on every check-off.
  const [virtualOn, setVirtualOn] = useState(false);
  const nextVirtual = virtualOn ? visibleActive.length >= VIRTUAL_LEAVE : visibleActive.length > VIRTUAL_ENTER;
  if (nextVirtual !== virtualOn) setVirtualOn(nextVirtual);
  const useVirtualGrocery = nextVirtual;

  const flattenedRows = useMemo(
    () => (useVirtualGrocery ? flattenGroupedRows(activeItemsByGroup, { expanded: renderExpanded, order: groupOrder }) : []),
    [useVirtualGrocery, activeItemsByGroup, renderExpanded, groupOrder]
  );

  const listRef = useRef<HTMLDivElement>(null);
  const groceryVirtualizer = useWindowVirtualizer({
    count: flattenedRows.length,
    // US-636: first-paint guess only; rows report their real height back.
    estimateSize: (index) => (flattenedRows[index]?.type === "header" ? 44 : 60),
    overscan: 10,
    enabled: useVirtualGrocery,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  // ─── Exports ───────────────────────────────────────────────────────────
  const today = () => new Date().toISOString().split("T")[0];

  const copyText = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      logger.warn("Clipboard write refused; showing the text to copy by hand", error);
      setCopyFallback(text);
      return false;
    }
  }, []);

  const listAsText = useCallback(() => {
    const groups = groupOrder
      .filter((g) => (activeItemsByGroup[g] ?? []).length > 0)
      .map((g) => [
        `${g}:`,
        ...activeItemsByGroup[g].map((item) => `  - ${item.name} (${item.quantity} ${item.unit})`.trimEnd()),
        "",
      ].join("\n"));
    return [
      t("grocery.export.textTitle", { defaultValue: "Grocery List" }),
      t("grocery.export.textSubtitle", {
        defaultValue: "{{date}} - {{count}} item",
        defaultValue_other: "{{date}} - {{count}} items",
        date: new Date().toLocaleDateString(),
        count: activeItems.length,
      }),
      "",
      ...groups,
    ].join("\n");
  }, [groupOrder, activeItemsByGroup, activeItems.length, t]);

  const handleExportText = useCallback(async () => {
    if (await copyText(listAsText())) {
      toast.success(t("grocery.export.copied", { defaultValue: "List copied" }));
    }
  }, [copyText, listAsText, t]);

  const handleExportCSV = useCallback(() => {
    const csv = toCsv(activeItems, [
      { header: t("grocery.export.csv.category", { defaultValue: "Category" }), value: (i) => categoryLabel(i.category) },
      { header: t("grocery.export.csv.item", { defaultValue: "Item" }), value: (i) => i.name },
      { header: t("grocery.export.csv.quantity", { defaultValue: "Quantity" }), value: (i) => i.quantity },
      { header: t("grocery.export.csv.unit", { defaultValue: "Unit" }), value: (i) => i.unit },
      { header: t("grocery.export.csv.aisle", { defaultValue: "Aisle" }), value: (i) => i.aisle ?? "" },
      { header: t("grocery.export.csv.status", { defaultValue: "Status" }), value: () => t("grocery.export.csv.toBuy", { defaultValue: "To buy" }) },
    ]);
    if (downloadCsv(`grocery-list-${today()}.csv`, csv)) {
      toast.success(t("grocery.export.csvDone", { defaultValue: "CSV exported" }));
    }
  }, [activeItems, t]);

  const handleExportAnyList = useCallback(() => {
    const csv = toCsv(activeItems, [
      { header: t("grocery.export.csv.item", { defaultValue: "Item" }), value: (i) => i.name },
      { header: t("grocery.export.csv.quantity", { defaultValue: "Quantity" }), value: (i) => `${i.quantity} ${i.unit}`.trim() },
      { header: t("grocery.export.csv.aisle", { defaultValue: "Aisle" }), value: (i) => i.aisle || categoryLabel(i.category) },
    ]);
    if (downloadCsv(`anylist-${today()}.csv`, csv)) {
      toast.success(t("grocery.export.anyListDone", { defaultValue: "AnyList file exported" }));
    }
  }, [activeItems, t]);

  const handleShare = useCallback(async () => {
    const text = activeItems.map((item) => `${item.name} (${item.quantity} ${item.unit})`.trimEnd()).join("\n");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: t("grocery.export.textTitle", { defaultValue: "Grocery List" }), text });
      } catch (error) {
        // Cancelling the share sheet is not a failure, and neither is any
        // other refusal worth a clipboard write the parent did not ask for.
        if ((error as Error).name !== "AbortError") logger.warn("Share failed", error);
      }
      return;
    }
    if (await copyText(text)) toast.success(t("grocery.export.copied", { defaultValue: "List copied" }));
  }, [activeItems, copyText, t]);

  const handlePrint = useCallback(() => {
    // Expand before the print snapshot is taken; beforeprint alone can land
    // after some browsers have laid the page out.
    setPrinting(true);
    setTimeout(() => window.print(), 0);
  }, []);

  // ─── Derived view state ────────────────────────────────────────────────
  const hasItems = totalItems > 0;
  const isEmpty = activeItems.length === 0 && purchasedItems.length === 0;
  const showLoading = isEmpty && !groceryHydrated;
  const allBought = activeItems.length === 0 && purchasedItems.length > 0;
  const purchasedOpen = purchasedOpenPref ?? activeItems.length === 0;
  const milestone = milestoneKey(progressPercent);
  const checkoutLabel = ledgerWritesEnabled
    ? t("grocery.checkout.ctaLedger", { defaultValue: "Finish shopping ({{count}})", count: purchasedCount })
    : t("grocery.checkout.ctaLegacy", { defaultValue: "Clear {{count}} bought", count: purchasedCount });
  const aisleOptions = useMemo(
    () => [...new Set(groceryItems.map((i) => i.aisle).filter((a): a is string => !!a))].sort(),
    [groceryItems]
  );
  const toAdd = planPreview.toAdd;
  const selectedListName = groceryLists.lists.find((l) => l.id === selectedListId)?.name ?? null;

  const renderRow = (item: GroceryItem) => {
    const meta = rowMeta.get(item.id);
    return (
      <GroceryRow
        item={item}
        checked={item.checked}
        measureNote={meta?.measureNote}
        fit={meta?.fit}
        forKidNames={meta?.forKidNames}
        addedByName={meta?.addedByName}
        pending={meta?.pending}
        compact={isPhoneWidth}
        onToggle={onRowToggle}
        onOpen={onRowOpen}
        onQuantityStep={onRowQuantityStep}
        onDelete={onRowDelete}
      />
    );
  };

  // One question at a time: the first unchecked row in a group the store has
  // no place for. Answering it files the row, and the next one comes up.
  const renderPlaceChips = (group: string, items: GroceryItem[]) => {
    if (placePromptOff || !isUnplaced(group) || storeLayouts.aisles.length === 0) return null;
    const item = items.find((i) => !i.checked);
    if (!item) return null;
    return (
      <div className="border-b border-border px-4 py-2 print:hidden">
        <p className="mb-1 text-xs text-muted-foreground">
          {t("grocery.placeCaption", { defaultValue: "Where is {{name}} in this store?", name: item.name })}
        </p>
        <PlaceInAisleChips
          aisles={storeLayouts.aisles}
          onPick={(aisleName, aisleId) => onPlaceInAisle(item, aisleName, aisleId)}
          onDismiss={() => setPlacePromptOff(true)}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 bg-background">
      <Helmet>
        <title>Grocery List - EatPal</title>
        <meta name="description" content="Manage your grocery shopping list with smart suggestions and store organization" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto px-4 py-4 md:py-6 max-w-3xl">

        {/* ─── Header ─── */}
        <div className="mb-2 flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl bg-primary/10 items-center justify-center shrink-0",
              hasItems ? "hidden md:flex" : "flex",
            )}
          >
            <ShoppingCart className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className={cn("font-bold tracking-tight", hasItems ? "text-lg md:text-2xl" : "text-2xl")}>
              {t("grocery.title")}
            </h1>
            <p className={cn("text-sm text-muted-foreground", hasItems && "hidden md:block")}>
              {selectedListName
                ? t("grocery.subtitleList", {
                    defaultValue: "{{name}} - {{count}} item",
                    defaultValue_other: "{{name}} - {{count}} items",
                    name: selectedListName,
                    count: totalItems,
                  })
                : t("grocery.subtitleCount", {
                    defaultValue: "{{count}} item on this list",
                    defaultValue_other: "{{count}} items on this list",
                    count: totalItems,
                  })}
            </p>
          </div>
        </div>

        {/*
          One sticky toolbar: list picker (with its "N left" line), Add, and
          the overflow menu. US-767's two-row bar was 120px pinned; this is one
          48px row. top-14 sits under Dashboard's fixed mobile nav (pt-14).
          md:static above 768px, where there is room for the list to scroll by.
          The 2px progress bar rides its bottom edge.
        */}
        <div
          role="toolbar"
          aria-label={t("grocery.toolbar.label", { defaultValue: "Grocery list tools" })}
          className="sticky top-14 z-30 -mx-4 mb-2 flex items-center gap-2 bg-background px-4 py-1 border-b border-border md:relative md:z-auto md:top-auto md:mx-0 md:px-0 print:hidden"
        >
          <div className="min-w-0 flex-1">
            {userId ? (
              <GroceryListSelector
                lists={groceryLists.lists}
                selectedListId={selectedListId}
                loading={groceryLists.loading}
                error={groceryLists.error}
                onRetry={() => void groceryLists.refresh()}
                onListChange={setSelectedListId}
                onCreateNew={() => setShowCreateListDialog(true)}
                onManageLists={() => setShowManageListsDialog(true)}
                summary={hasItems
                  ? t("grocery.toolbar.left", {
                      defaultValue: "{{left}} left of {{total}}",
                      left: leftCount,
                      total: totalItems,
                    })
                  : undefined}
              />
            ) : (
              // Same height as the picker, so the toolbar does not jump when
              // the session resolves.
              <Skeleton className="h-12 w-full" data-testid="grocery-list-picker-skeleton" />
            )}
          </div>

          {/* Add works without a session: the grocery context queues it. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-11 shrink-0 px-4">
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                {t("grocery.toolbar.add", { defaultValue: "Add" })}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.addItem", { defaultValue: "Add an item" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowImportRecipeDialog(true)}>
                <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.fromRecipe", { defaultValue: "From a recipe" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowScanReceipt(true)}>
                <Barcode className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.scanReceipt", { defaultValue: "Scan a receipt" })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label={t("grocery.toolbar.more", { defaultValue: "More options" })}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={handleAddFromPlan}>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.syncPlan", { defaultValue: "Add this week's plan" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReplaceFromPlan}>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.removeUnplanned", { defaultValue: "Remove meals no longer planned" })}
              </DropdownMenuItem>
              {userId && (
                <DropdownMenuItem onClick={() => setShowManageStoresDialog(true)}>
                  <Store className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("grocery.menu.stores", { defaultValue: "Store layouts" })}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportText}>
                <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.copyText", { defaultValue: "Copy as text" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.share", { defaultValue: "Share" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.exportCsv", { defaultValue: "Export CSV" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportAnyList}>
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.exportAnyList", { defaultValue: "Export for AnyList" })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("grocery.menu.print", { defaultValue: "Print list" })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {hasItems && (
            <Progress
              value={progressPercent}
              className="absolute inset-x-0 bottom-0 h-0.5 rounded-none bg-transparent"
              aria-label={t("grocery.progress.label", {
                defaultValue: "Shopping progress: {{done}} of {{total}} bought",
                done: purchasedCount,
                total: totalItems,
              })}
            />
          )}
        </div>

        {/* The one live region: a debounced line per check-off. */}
        <div role="status" className="sr-only">{announcement}</div>

        {pendingCount > 0 && (
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground print:hidden">
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            {t("grocery.offline.pending", {
              defaultValue: "{{count}} change waiting for signal",
              defaultValue_other: "{{count}} changes waiting for signal",
              count: pendingCount,
            })}
          </p>
        )}

        <div className="print:hidden">
          <GroceryQuickAdd onAdd={addToList} />
        </div>

        {!isEmpty && (
          <PlanSyncBanner toAdd={toAdd} alreadyHave={planPreview.alreadyHave} onAdd={handleAddFromPlan} />
        )}

        {userId && (
          <div className="mb-3 print:hidden">
            <SmartRestockSuggestions
              userId={userId}
              kidId={activeKidId || undefined}
              onAddItems={handleRestockAdd}
            />
          </div>
        )}

        {/* ─── Loading / Empty ─── */}
        {showLoading ? (
          <div className="space-y-2" aria-hidden="true" data-testid="grocery-loading">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : isEmpty ? (
          <Card className="p-8 text-center">
            <div className="max-w-sm mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                {t("grocery.empty.title", { defaultValue: "Your list is empty" })}
              </h2>
              <p className="text-muted-foreground mb-6">
                {toAdd > 0
                  ? t("grocery.plan.cta", {
                      defaultValue: "This week's plan needs {{count}} thing",
                      defaultValue_other: "This week's plan needs {{count}} things",
                      count: toAdd,
                    })
                  : t("grocery.empty.body", {
                      defaultValue: "Plan the week and the list writes itself, or add what you need.",
                    })}
              </p>
              <div className="flex flex-col gap-2">
                {toAdd > 0 ? (
                  <Button onClick={handleAddFromPlan} className="h-11">
                    <CalendarDays className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    {t("grocery.empty.addPlan", {
                      defaultValue: "Add {{count}} from this week's plan",
                      count: toAdd,
                    })}
                  </Button>
                ) : (
                  <Button asChild className="h-11">
                    <Link to="/dashboard/planner">
                      <CalendarDays className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      {t("grocery.empty.planWeek", { defaultValue: "Plan this week" })}
                    </Link>
                  </Button>
                )}
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button variant="outline" className="h-11 flex-1" onClick={() => setShowImportRecipeDialog(true)}>
                    <FileText className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    {t("grocery.empty.fromRecipe", { defaultValue: "Add from a recipe" })}
                  </Button>
                  <Button variant="outline" className="h-11 flex-1" onClick={() => setShowAddDialog(true)}>
                    <ClipboardPaste className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    {t("grocery.empty.pasteList", { defaultValue: "Paste a list" })}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <>
            {/* ─── Grouping + store ─── */}
            {visibleActive.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
                {/*
                  US-778: a group of toggle buttons, not Tabs: nothing here is
                  a tab panel, and Tabs' aria-controls pointed at none.
                */}
                <div
                  role="group"
                  aria-label={t("grocery.groupBy.label", { defaultValue: "Group items by" })}
                  className="grid h-11 w-full max-w-[16rem] grid-cols-2 items-center rounded-md bg-muted p-1 text-muted-foreground"
                >
                  {([
                    ["aisle", t("grocery.groupBy.aisle", { defaultValue: "By aisle" })],
                    ["category", t("grocery.groupBy.category", { defaultValue: "By category" })],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={groupBy === value}
                      onClick={() => setGroupBy(value)}
                      className={cn(
                        "inline-flex h-full items-center justify-center whitespace-nowrap rounded-sm px-3 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        groupBy === value && "bg-background text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {groupBy === "aisle" && userId && (
                  <StorePicker
                    stores={storeLayouts.stores}
                    selectedId={storeLayouts.selectedStore?.id ?? null}
                    onChange={(id) => void storeLayouts.setSelectedStoreId(id)}
                  />
                )}
              </div>
            )}

            {/* ─── Active Shopping Items ─── */}
            {visibleActive.length > 0 ? (
              useVirtualGrocery ? (
                <section
                  aria-label={t("grocery.list.label", { defaultValue: "Shopping list" })}
                  id="grocery-list-items"
                  ref={listRef}
                  className="mb-4 rounded-xl border border-border overflow-hidden"
                >
                  <div style={{ height: `${groceryVirtualizer.getTotalSize()}px`, position: "relative" }}>
                    {groceryVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = flattenedRows[virtualRow.index];
                      if (!row) return null;
                      const style = {
                        position: "absolute" as const,
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start - groceryVirtualizer.options.scrollMargin}px)`,
                      };
                      if (row.type === "header") {
                        return (
                          <div key={`header-${row.group}`} data-index={virtualRow.index} ref={groceryVirtualizer.measureElement} style={style} className="bg-muted">
                            <GroceryGroupHeader
                              id="grocery-list-items"
                              label={row.group}
                              count={row.count}
                              expanded={renderExpanded.has(row.group)}
                              collapsible={collapsible}
                              onToggle={() => toggleGroup(row.group)}
                              {...headerPlace(row.group)}
                            />
                          </div>
                        );
                      }
                      return (
                        <div key={row.item.id} data-index={virtualRow.index} ref={groceryVirtualizer.measureElement} style={style}>
                          {renderRow(row.item)}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <section
                  aria-label={t("grocery.list.label", { defaultValue: "Shopping list" })}
                  className="mb-4 space-y-3"
                >
                  {groupOrder.map((group) => {
                    const items = activeItemsByGroup[group] ?? [];
                    if (items.length === 0) return null;
                    const panelId = `grocery-group-${slugifyGroupId(group)}`;
                    const isOpen = renderExpanded.has(group);
                    return (
                      <div key={group} className="rounded-xl border border-border overflow-hidden">
                        <div className="bg-muted">
                          <GroceryGroupHeader
                            id={panelId}
                            label={group}
                            count={items.length}
                            expanded={isOpen}
                            collapsible={collapsible}
                            onToggle={() => toggleGroup(group)}
                            {...headerPlace(group)}
                          />
                        </div>
                        {/*
                          Mounted and hidden rather than removed: aria-controls
                          has to name an element that exists (US-778).
                        */}
                        <div id={panelId} hidden={!isOpen}>
                          {items.map((item) => (
                            <div key={item.id}>{renderRow(item)}</div>
                          ))}
                          {renderPlaceChips(group, items)}
                        </div>
                      </div>
                    );
                  })}
                </section>
              )
            ) : allBought ? (
              <Card className="p-6 text-center mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <PackageCheck className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <h2 className="text-lg font-semibold mb-1">
                  {milestone ? t(milestone) : t("grocery.progress.done", { defaultValue: "Everything is in the cart" })}
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {ledgerWritesEnabled
                    ? t("grocery.purchased.allLedger", { defaultValue: "Finish shopping to add it all to your pantry." })
                    : t("grocery.purchased.allLegacy", { defaultValue: "It's in your pantry. Clear the bought items when you're ready." })}
                </p>
                <Button onClick={handleDoneShopping} className="h-11" disabled={checkingOut} aria-busy={checkingOut}>
                  {checkingOut
                    ? <Loader2 className="h-4 w-4 mr-1.5 motion-safe:animate-spin" aria-hidden="true" />
                    : <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />}
                  {checkoutLabel}
                </Button>
              </Card>
            ) : null}

            {/* ─── Purchased ─── */}
            {shownPurchased.length > 0 && (
              <Collapsible open={purchasedOpen} onOpenChange={setPurchasedOpenPref}>
                <div className="rounded-xl border border-dashed border-border overflow-hidden">
                  <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2 px-4 text-left">
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-muted-foreground", !purchasedOpen && "-rotate-90")}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-muted-foreground">
                      {ledgerWritesEnabled
                        ? t("grocery.purchased.headerLedger", {
                            defaultValue: "Purchased - {{count}} - goes to pantry at checkout",
                            count: shownPurchased.length,
                          })
                        : t("grocery.purchased.headerLegacy", {
                            defaultValue: "Purchased - in pantry",
                          })}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border">
                      {shownPurchased.map((item) => (
                        <div key={item.id}>
                          <GroceryRow
                            item={item}
                            checked
                            compact
                            onToggle={onRowToggle}
                            onOpen={onRowOpen}
                          />
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {purchasedCount > 0 && activeItems.length > 0 && (
              <CheckoutBar
                done={purchasedCount}
                total={totalItems}
                ctaLabel={checkoutLabel}
                busy={checkingOut}
                onCheckout={handleDoneShopping}
              />
            )}
          </>
        )}
      </div>

      {/* ─── Dialogs ─── */}
      <Suspense fallback={null}>
        {showAddDialog && (
          <AddGroceryItemDialog
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
            onAddItems={addToList}
            selectedListId={selectedListId}
          />
        )}
        {showImportRecipeDialog && (
          <ImportRecipeToGroceryDialog
            open={showImportRecipeDialog}
            onOpenChange={setShowImportRecipeDialog}
            onImport={addToList}
          />
        )}
        {showScanReceipt && (
          <ScanReceiptDialog open={showScanReceipt} onClose={() => setShowScanReceipt(false)} />
        )}
        {userId && showCreateStoreDialog && (
          <CreateStoreLayoutDialog
            open={showCreateStoreDialog}
            onOpenChange={(open) => {
              setShowCreateStoreDialog(open);
              if (!open) setEditingStore(null);
            }}
            userId={userId}
            householdId={householdId}
            editStore={editingStore}
            onStoreCreated={(store, created) => {
              setEditingStore(null);
              setShowCreateStoreDialog(false);
              void storeLayouts.refresh();
              if (created) {
                // A new store is for the list on screen, and it has no aisles
                // yet: straight to the aisles dialog.
                void storeLayouts.setSelectedStoreId(store.id);
                setManagingAislesStore(store);
              }
            }}
          />
        )}
        {userId && showManageStoresDialog && (
          <ManageStoreLayoutsDialog
            open={showManageStoresDialog}
            onOpenChange={setShowManageStoresDialog}
            userId={userId}
            householdId={householdId}
            onStoresChanged={() => void storeLayouts.refresh()}
            onCreateStore={() => {
              setEditingStore(null);
              setShowManageStoresDialog(false);
              setShowCreateStoreDialog(true);
            }}
            onEditStore={(store) => {
              setEditingStore(store);
              setShowManageStoresDialog(false);
              setShowCreateStoreDialog(true);
            }}
            onManageAisles={(store) => {
              setManagingAislesStore(store);
              setShowManageStoresDialog(false);
            }}
          />
        )}
        {managingAislesStore && (
          <ManageStoreAislesDialog
            open
            onOpenChange={(open) => {
              if (!open) {
                setManagingAislesStore(null);
                setShowManageStoresDialog(true);
              }
            }}
            storeLayout={managingAislesStore}
            onAislesChanged={() => void storeLayouts.refresh()}
          />
        )}
      </Suspense>

      <EditGroceryItemDialog
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
        item={editingItem}
        onSave={(id, updates) => updateGroceryItem(id, updates)}
        aisleOptions={aisleOptions}
      />

      {userId && (
        <>
          <CreateGroceryListDialog
            open={showCreateListDialog}
            onOpenChange={setShowCreateListDialog}
            userId={userId}
            householdId={householdId}
            onCreated={(row) => {
              groceryLists.upsertLocal(row);
              setSelectedListId(row.id);
              setShowCreateListDialog(false);
            }}
          />
          <ManageGroceryListsDialog
            open={showManageListsDialog}
            onOpenChange={setShowManageListsDialog}
            userId={userId}
            householdId={householdId}
            currentListId={selectedListId}
            refresh={groceryLists.refresh}
            removeLocal={groceryLists.removeLocal}
            onListDeleted={(deletedId) => {
              // The server cascade already took the rows; drop the local copies.
              const gone = itemsRef.current.filter((i) => i.grocery_list_id === deletedId).map((i) => i.id);
              if (gone.length > 0) deleteGroceryItems(gone);
            }}
          />
        </>
      )}

      {/* Clipboard refused: the text, selectable, to copy by hand. */}
      <Dialog open={copyFallback !== null} onOpenChange={(open) => !open && setCopyFallback(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("grocery.export.copyFallbackTitle", { defaultValue: "Copy your list" })}</DialogTitle>
            <DialogDescription>
              {t("grocery.export.copyFallbackBody", {
                defaultValue: "This browser didn't let us copy. Select the text below and copy it.",
              })}
            </DialogDescription>
          </DialogHeader>
          <textarea
            readOnly
            value={copyFallback ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            className="h-48 w-full rounded-md border border-input bg-background p-2 text-sm"
            aria-label={t("grocery.export.copyFallbackTitle", { defaultValue: "Copy your list" })}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
