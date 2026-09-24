import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  lazy,
  Suspense,
  memo,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
// CSS animations used instead of framer-motion for list rendering performance
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useFoods, useGrocery, useKids, usePlan, useInventory } from "@/contexts/AppContext";
import { FoodCard } from "@/components/FoodCard";
import type { FoodIdentification } from "@/components/ImageFoodCapture";
import type { BarcodePantryAdd } from "@/components/admin/BarcodeScannerDialog";
import "@/i18n/appLocale";

// Every dialog is lazy and mounted only while open: none of them is part of
// the first paint, and the barcode scanner pulls in html5-qrcode.
const loadAddFoodDialog = () => import("@/components/AddFoodDialog");
const loadBarcodeScanner = () => import("@/components/admin/BarcodeScannerDialog");
const loadReceiptScanner = () => import("@/components/ScanReceiptDialog");
const AddFoodDialog = lazy(() => loadAddFoodDialog().then((m) => ({ default: m.AddFoodDialog })));
const BarcodeScannerDialog = lazy(() => loadBarcodeScanner().then((m) => ({ default: m.BarcodeScannerDialog })));
const ScanReceiptDialog = lazy(() => loadReceiptScanner().then((m) => ({ default: m.ScanReceiptDialog })));
const ImageFoodCapture = lazy(() =>
  import("@/components/ImageFoodCapture").then((m) => ({ default: m.ImageFoodCapture }))
);
const ImportCsvDialog = lazy(() =>
  import("@/components/ImportCsvDialog").then((m) => ({ default: m.ImportCsvDialog }))
);
const PantryStarterSheet = lazy(() =>
  import("@/components/pantry/PantryStarterSheet").then((m) => ({ default: m.PantryStarterSheet }))
);
const PantryWasteSheet = lazy(() =>
  import("@/components/pantry/PantryWasteSheet").then((m) => ({ default: m.PantryWasteSheet }))
);
import { PantryCategorySection } from "@/components/pantry/PantryCategorySection";
import { PantryListItem } from "@/components/pantry/PantryListItem";
import { PantryQuickAdd } from "@/components/pantry/PantryQuickAdd";
import { PantryCaptureMenu } from "@/components/pantry/PantryCaptureMenu";
import { PantryStockStrip } from "@/components/pantry/PantryStockStrip";
import { PantryKidLens } from "@/components/pantry/PantryKidLens";
import { parsePantryQuickAddLine, type PantryQuickAddParse } from "@/lib/pantryQuickAddParser";
import {
  PANTRY_DISPLAY_ORDER,
  getCategoryConfig,
  type SortOption,
  type ViewMode,
} from "@/components/pantry/pantryConstants";
import {
  computeCategoryCounts,
  computeStockBuckets,
  computeSafeRunningLow,
  filterAndSortFoods,
  filterByFit,
  groupFoodsByCategory,
  type FitFilter,
  type StockFilter,
} from "@/lib/pantryData";
import { buildResultIndex, getKidFoodFit, summarizeKidFits, type ItemFit } from "@/lib/kidFit";
import { findExistingFood } from "@/lib/findExistingFood";
import { buildOnListKeySet, isOnList, pantryToGroceryInput } from "@/lib/pantryGrocery";
import type { GroceryAddInput } from "@/lib/groceryMerge";
import { buildRestockIndex, forecastForFood, normalizeProductName } from "@/lib/depletionForecastWiring";
import { useDefaultGroceryListId } from "@/hooks/useDefaultGroceryListId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Sparkles,
  Download,
  ScanBarcode,
  Receipt,
  Utensils,
  LayoutGrid,
  List,
  ArrowUpDown,
  X,
  Loader2,
  Check,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import type { Food, FoodCategory, Kid } from "@/types";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { toast } from "sonner";
import { STARTER_OFFER_MAX_FOODS } from "@/lib/pantryStarter";
import { initialPantryView } from "@/lib/pantrySwipe";
import { pricePairOrNull, priceUnitFits } from "@/lib/money";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { haptic } from "@/lib/haptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { logger } from "@/lib/logger";
import type { MovementItem, MovementRefType } from "@/lib/movementBuilders";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { getStorage } from "@/lib/platform";
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from "@/lib/foodSafetyDefault";

interface FoodSuggestion {
  name: string;
  category: FoodCategory;
  reason: string;
}

interface SuggestFoodsResponse {
  suggestions?: FoodSuggestion[];
  error?: string;
}

/** What a top-up is attributed to in the ledger, when anything. */
interface TopUpRef {
  refType: MovementRefType;
  refId: string;
}

/** Virtualize the flat list above 60 rows, go back to plain rendering below 40 (as Grocery). */
const VIRTUAL_ENTER = 60;
const VIRTUAL_LEAVE = 40;
const PAGE_SIZE = 50;
/** The AI request carries at most this many foods. */
const AI_FOOD_CAP = 200;

/** Stored for the All kids choice, so it is told apart from never having chosen. */
const ALL_KIDS = "__all__";

const SORT_OPTIONS: readonly SortOption[] = ["name", "low-stock", "category", "recent"];
const VIEW_MODES: readonly ViewMode[] = ["grid", "list"];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Units match case-insensitively (as Grocery's pantry crediting). A food with
 * no unit of its own takes whatever was typed: it is a bare count either way.
 */
function unitsMatch(foodUnit: string | null | undefined, typed: string | null | undefined): boolean {
  const own = (foodUnit ?? "").trim().toLowerCase();
  return own === "" || own === (typed ?? "").trim().toLowerCase();
}

type PlatformStorage = Awaited<ReturnType<typeof getStorage>>;

/**
 * Keys are written as literals at each call so the US-835 sign-out sweep
 * (signOutScrub.test.ts) can read and classify them.
 */
async function readStored(read: (storage: PlatformStorage) => Promise<string | null>): Promise<string | null> {
  try {
    return await read(await getStorage());
  } catch {
    return null;
  }
}

function writeStored(write: (storage: PlatformStorage) => Promise<void>): void {
  void (async () => {
    try {
      await write(await getStorage());
    } catch {
      // A private window or blocked storage: the choice just is not remembered.
    }
  })();
}

/** The fields the suggestion model reads, not the whole profile. */
function projectChildProfile(kid: Kid) {
  return {
    age: kid.age,
    allergens: kid.allergens,
    pickiness_level: kid.pickiness_level,
    texture_preferences: kid.texture_preferences,
    texture_dislikes: kid.texture_dislikes,
    flavor_preferences: kid.flavor_preferences,
    always_eats_foods: kid.always_eats_foods,
    disliked_foods: kid.disliked_foods,
  };
}

export default function Pantry() {
  const { t, i18n } = useTranslation();
  const {
    foods,
    addFood,
    addFoods,
    updateFood,
    deleteFood,
    refreshFoods,
    catalogById,
    foodsHydrated,
  } = useFoods();
  const { planEntries } = usePlan();
  const { kids, activeKidId } = useKids();
  const { groceryItems, mergeGroceryItems, deleteGroceryItems, updateGroceryItem } = useGrocery();
  const defaultListId = useDefaultGroceryListId();
  // US-671: the flag decides whether pantry numbers come from the ledger.
  const {
    ledgerReadsEnabled,
    ledgerQuantityOf,
    ledgerWritesEnabled,
    recordPantryCorrection,
    recordWaste,
    recordRestock,
  } = useInventory();
  const isMobile = useIsMobile();

  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const fmt = useCallback((n: number) => numberFormat.format(n), [numberFormat]);

  // Handlers read the latest foods through this, so `foods` stays out of
  // their deps and the memoized cards are not re-rendered on every change.
  const foodsRef = useRef(foods);
  foodsRef.current = foods;

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFood, setEditFood] = useState<Food | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [addedSuggestions, setAddedSuggestions] = useState<Set<string>>(() => new Set());
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);
  const [receiptScanOpen, setReceiptScanOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [starterOpen, setStarterOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // View states
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  // Item 21: null until this viewer picks; a phone then opens in list view.
  const [viewChoice, setViewChoice] = useState<ViewMode | null>(null);
  const viewMode = initialPantryView(viewChoice, isMobile);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );
  // undefined: this viewer never picked, so the lens follows the active kid.
  const [lensChoice, setLensChoice] = useState<string | null | undefined>(undefined);
  const [fitFilter, setFitFilter] = useState<FitFilter>("all");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // A server answer, or a cache that already had rows, ends the skeleton. An
  // empty pantry that has been loaded is the empty state, not a spinner.
  const isInitialLoading = !foodsHydrated && foods.length === 0;

  // Remembered per viewer: the lens, the view and the sort.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [lens, view, sort] = await Promise.all([
        readStored((storage) => storage.getItem("eatpal.pantry.lensKid")),
        readStored((storage) => storage.getItem("eatpal.pantry.viewMode")),
        readStored((storage) => storage.getItem("eatpal.pantry.sortBy")),
      ]);
      if (cancelled) return;
      if (lens) setLensChoice(lens === ALL_KIDS ? null : lens);
      if (view && (VIEW_MODES as readonly string[]).includes(view)) setViewChoice(view as ViewMode);
      if (sort && (SORT_OPTIONS as readonly string[]).includes(sort)) setSortBy(sort as SortOption);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lensKidId: string | null = useMemo(() => {
    if (lensChoice === null) return null;
    if (lensChoice !== undefined && kids.some((k) => k.id === lensChoice)) return lensChoice;
    return activeKidId && kids.some((k) => k.id === activeKidId) ? activeKidId : null;
  }, [lensChoice, kids, activeKidId]);
  const lensKid = useMemo(
    () => (lensKidId ? kids.find((k) => k.id === lensKidId) ?? null : null),
    [kids, lensKidId]
  );

  const handleLensSelect = useCallback((kidId: string | null) => {
    setLensChoice(kidId);
    writeStored((storage) => storage.setItem("eatpal.pantry.lensKid", kidId ?? ALL_KIDS));
  }, []);
  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewChoice(mode);
    writeStored((storage) => storage.setItem("eatpal.pantry.viewMode", mode));
  }, []);
  const handleSortBy = useCallback((value: string) => {
    if (!(SORT_OPTIONS as readonly string[]).includes(value)) return;
    setSortBy(value as SortOption);
    writeStored((storage) => storage.setItem("eatpal.pantry.sortBy", value));
  }, []);

  // Pull-to-refresh. The page scrolls the window, not this container.
  const { pullToRefreshRef, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      haptic.light();
      const result = refreshFoods ? await refreshFoods() : { ok: true };
      if (!result.ok) {
        haptic.error();
        toast.error(t("pantry.refresh.failed"));
        return;
      }
      // No success toast: the list updating is the feedback.
      haptic.success();
    },
    enabled: isMobile,
    getScrollTop: () => window.scrollY,
  });

  // === DERIVED DATA ===
  // Pure derivations live in src/lib/pantryData.ts (unit-tested).

  // US-671: with the flag OFF this returns `foods` BY REFERENCE; with it on,
  // every quantity on this page reads the ledger balance instead.
  const pantryFoods = useMemo(() => {
    if (!ledgerReadsEnabled) return foods;
    return foods.map((food) => {
      const fromLedger = ledgerQuantityOf(food);
      return fromLedger === null ? food : { ...food, quantity: fromLedger };
    });
  }, [foods, ledgerReadsEnabled, ledgerQuantityOf]);

  const categoryCounts = useMemo(() => computeCategoryCounts(pantryFoods), [pantryFoods]);
  const categoriesInUse = useMemo(
    () => PANTRY_DISPLAY_ORDER.filter((c) => (categoryCounts[c] ?? 0) > 0).length,
    [categoryCounts]
  );

  // A category that empties (its last food deleted) would otherwise leave the
  // page filtered on a pill that is no longer shown.
  useEffect(() => {
    if (categoryFilter !== "all" && (categoryCounts[categoryFilter] ?? 0) === 0) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categoryCounts]);

  // --- Kid fit -------------------------------------------------------------
  const targetKids = useMemo(
    () => (lensKidId ? kids.filter((k) => k.id === lensKidId) : kids),
    [kids, lensKidId]
  );
  const resultIndexByKid = useMemo(
    () => new Map(kids.map((k) => [k.id, buildResultIndex(planEntries, k.id)])),
    [kids, planEntries]
  );
  // Fits are cached per food object: an edit to one food replaces only that
  // object, so only that food is scored again. The cache resets when the
  // kids in view or their history change.
  const fitCacheRef = useRef<{
    kids: Kid[];
    index: Map<string, ReturnType<typeof buildResultIndex>>;
    cache: WeakMap<Food, ItemFit>;
  } | null>(null);
  const fitByFoodId = useMemo(() => {
    const map = new Map<string, ItemFit>();
    if (targetKids.length === 0) return map;
    const held = fitCacheRef.current;
    if (!held || held.kids !== targetKids || held.index !== resultIndexByKid) {
      fitCacheRef.current = { kids: targetKids, index: resultIndexByKid, cache: new WeakMap() };
    }
    const fitCache = (fitCacheRef.current as NonNullable<typeof fitCacheRef.current>).cache;
    for (const food of pantryFoods) {
      if (!food) continue;
      let fit = fitCache.get(food);
      if (!fit) {
        fit = summarizeKidFits(
          targetKids.map((kid) => ({
            kid,
            fit: getKidFoodFit(kid, food, resultIndexByKid.get(kid.id) ?? planEntries),
          })),
          { unchecked: food.allergens == null ? 1 : 0 }
        );
        fitCache.set(food, fit);
      }
      map.set(food.id, fit);
    }
    return map;
  }, [pantryFoods, targetKids, resultIndexByKid, planEntries]);

  // --- Stock and forecast --------------------------------------------------
  const restockIndex = useMemo(() => buildRestockIndex(groceryItems), [groceryItems]);
  const forecastDays = useMemo(() => {
    const days = new Map<string, number>();
    for (const food of pantryFoods) {
      if (!food) continue;
      const forecast = forecastForFood(food, restockIndex);
      if (forecast && (forecast.confidence === "medium" || forecast.confidence === "high")) {
        days.set(food.id, forecast.daysToDepletion);
      }
    }
    return days;
  }, [pantryFoods, restockIndex]);

  const isTracked = useCallback(
    (food: Food) =>
      ledgerQuantityOf(food) != null ||
      (restockIndex.get(normalizeProductName(food.name))?.length ?? 0) > 0,
    [ledgerQuantityOf, restockIndex]
  );
  const stockBuckets = useMemo(
    () => computeStockBuckets(pantryFoods, { isTracked }),
    [pantryFoods, isTracked]
  );

  const onListKeys = useMemo(() => buildOnListKeySet(groceryItems), [groceryItems]);

  // --- Filtering -------------------------------------------------------------
  const processedFoods = useMemo(
    () =>
      filterByFit(
        filterAndSortFoods(pantryFoods, {
          search: debouncedSearchQuery,
          category: categoryFilter,
          stock: stockFilter,
          sortBy,
        }),
        fitByFoodId,
        fitFilter
      ),
    [pantryFoods, debouncedSearchQuery, categoryFilter, stockFilter, sortBy, fitByFoodId, fitFilter]
  );

  const safeRunningLow = useMemo(
    () => computeSafeRunningLow(processedFoods, fitByFoodId, forecastDays, { isTracked }),
    [processedFoods, fitByFoodId, forecastDays, isTracked]
  );

  const soonest = useMemo(() => {
    let best: { name: string; days: number } | undefined;
    for (const food of pantryFoods) {
      const days = food ? forecastDays.get(food.id) : undefined;
      if (days === undefined) continue;
      if (!best || days < best.days) best = { name: food.name, days };
    }
    return best;
  }, [pantryFoods, forecastDays]);

  // Paginate: show only visibleCount items (load-more pattern)
  const displayedFoods = useMemo(() => processedFoods.slice(0, visibleCount), [processedFoods, visibleCount]);
  const hasMoreFoods = processedFoods.length > visibleCount;

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearchQuery, categoryFilter, stockFilter, sortBy, fitFilter, lensKidId]);

  // Grouped by category (for "all" view without search)
  const groupedFoods = useMemo(() => groupFoodsByCategory(processedFoods), [processedFoods]);

  const showGroupedView =
    categoryFilter === "all" &&
    stockFilter === "all" &&
    fitFilter === "all" &&
    !debouncedSearchQuery &&
    sortBy !== "low-stock";

  const activeFilterCount =
    (categoryFilter !== "all" ? 1 : 0) +
    (stockFilter !== "all" ? 1 : 0) +
    (fitFilter !== "all" ? 1 : 0) +
    (debouncedSearchQuery ? 1 : 0);

  // --- Window virtualization for the flat list -------------------------------
  const [virtualOn, setVirtualOn] = useState(false);
  const flatList = !showGroupedView && viewMode === "list";
  const nextVirtual = flatList
    ? virtualOn
      ? displayedFoods.length >= VIRTUAL_LEAVE
      : displayedFoods.length > VIRTUAL_ENTER
    : false;
  if (nextVirtual !== virtualOn) setVirtualOn(nextVirtual);

  const listRef = useRef<HTMLDivElement>(null);
  const [listOffset, setListOffset] = useState(0);
  useLayoutEffect(() => {
    if (!nextVirtual) return;
    const measure = () => {
      const el = listRef.current;
      if (el) setListOffset(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [nextVirtual, displayedFoods.length]);

  const virtualizer = useWindowVirtualizer({
    count: nextVirtual ? displayedFoods.length : 0,
    // US-636: first-paint guess only; measureElement reports the real height.
    estimateSize: () => 64,
    overscan: 10,
    enabled: nextVirtual,
    scrollMargin: listOffset,
  });

  // === HANDLERS ===

  // US-672: a pantry edit becomes a correction movement. The two paths are
  // mutually exclusive; running both double-counts the edit. A movement that
  // cannot be built falls through to the legacy write.
  const handleQuantityChange = useCallback(
    (foodId: string, newQuantity: number) => {
      const food = foodsRef.current.find((f) => f.id === foodId);
      if (!food) return;

      // Quantity only: a spread of `food` here would write back fields an
      // edit made in the same tick has already changed.
      const legacyWrite = () => updateFood(foodId, { quantity: newQuantity });

      if (!ledgerWritesEnabled) {
        legacyWrite();
        return;
      }

      void recordPantryCorrection(food as MovementItem & { quantity?: number | null }, newQuantity)
        .then((result) => {
          if (result.recorded) return;
          logger.warn('US-672: pantry edit not recorded as a movement, using the legacy write', {
            foodId,
            reason: result.reason,
          });
          legacyWrite();
        });
    },
    [updateFood, ledgerWritesEnabled, recordPantryCorrection]
  );

  // US-672 criterion 4: "we threw this out" is waste, not a correction.
  const handleWaste = useCallback(
    (foodId: string, quantity: number) => {
      const food = foodsRef.current.find((f) => f.id === foodId);
      if (!food) return;
      const remaining = Math.max(0, (food.quantity ?? 0) - Math.abs(quantity));
      const confirm = () =>
        toast.success(
          t("pantry.toast.threwOut", {
            amount: fmt(Math.abs(quantity)),
            unit: food.unit || "",
          }).trim(),
          { description: t("pantry.toast.updated", { name: food.name }) }
        );

      const legacyWrite = () => updateFood(foodId, { quantity: remaining });

      if (!ledgerWritesEnabled) {
        legacyWrite();
        confirm();
        return;
      }

      void recordWaste(food as MovementItem, quantity).then((result) => {
        if (!result.recorded) {
          logger.warn('US-672: waste not recorded as a movement, using the legacy write', {
            foodId,
            reason: result.reason,
          });
          legacyWrite();
        }
        confirm();
      });
    },
    [updateFood, ledgerWritesEnabled, recordWaste, t, fmt]
  );

  /**
   * Add stock to a food that is already in the pantry: a restock movement
   * when the ledger takes it, else the legacy sum on the latest quantity.
   */
  const topUpFood = useCallback(
    async (
      food: Food,
      delta: number,
      unit?: string | null,
      ref?: TopUpRef,
      price?: { unitPrice: number; currency: string } | null
    ): Promise<void> => {
      const current = foodsRef.current.find((f) => f.id === food.id) ?? food;
      const paid = price ? pricePairOrNull(price.unitPrice, price.currency) : null;
      // Item 22: a price bought in the food's own unit becomes its last known
      // price. One in another unit ("per lb" for a food counted in bags) stays
      // on the movement only, where it is recorded against the unit it is per.
      if (paid && priceUnitFits(current.unit, unit ?? current.unit)) {
        updateFood(current.id, { price_per_unit: paid.unitPrice, currency: paid.currency });
      }
      try {
        const result = await recordRestock(current as MovementItem, delta, {
          unit: unit ?? current.unit ?? null,
          refType: ref?.refType ?? null,
          refId: ref?.refId ?? null,
          unitPrice: paid?.unitPrice ?? null,
          currency: paid?.currency ?? null,
        });
        if (result.recorded) return;
      } catch (error) {
        logger.warn("Restock movement failed, using the legacy write", error);
      }
      const latest = foodsRef.current.find((f) => f.id === food.id) ?? current;
      updateFood(latest.id, { quantity: round2((latest.quantity ?? 0) + delta) });
    },
    [recordRestock, updateFood]
  );

  // Item 21: "used up" from a list row's button or left swipe. A correction
  // to zero through the same path as any edit, so the ledger records it, and
  // Undo is the opposite correction rather than a rewrite of history.
  const handleUsedUp = useCallback(
    (food: Food) => {
      const current = foodsRef.current.find((f) => f.id === food.id);
      if (!current) return;
      const before = current.quantity ?? 0;
      if (before <= 0) return;
      handleQuantityChange(current.id, 0);
      haptic.light();
      toast.success(t("pantry.swipe.usedUpToast", { defaultValue: "{{name}} used up", name: current.name }), {
        action: {
          label: t("pantry.toast.undo"),
          // Relative to what is there now: stock that arrived since the swipe
          // (a receipt, a checkout, another device) stays.
          onClick: () => {
            const latest = foodsRef.current.find((f) => f.id === current.id)?.quantity ?? 0;
            handleQuantityChange(current.id, latest + before);
          },
        },
      });
    },
    [handleQuantityChange, t]
  );

  // --- Grocery ---------------------------------------------------------------
  const mergeToGrocery = useCallback(
    (items: GroceryAddInput[]) => {
      if (items.length === 0) return 0;
      const result = mergeGroceryItems(items, { defaultListId });
      if (result.touched === 0) return 0;
      haptic.success();
      toast.success(t("pantry.grocery.added", { count: result.touched, formatted: fmt(result.touched) }), {
        action: {
          label: t("pantry.toast.undo"),
          onClick: () => {
            deleteGroceryItems(result.insertedIds);
            result.bumps.forEach((b) => updateGroceryItem(b.id, b.prev));
          },
        },
      });
      return result.touched;
    },
    [mergeGroceryItems, defaultListId, deleteGroceryItems, updateGroceryItem, t, fmt]
  );

  const addToGrocery = useCallback(
    (list: Food[]) =>
      mergeToGrocery(
        list.map((food) =>
          pantryToGroceryInput(food, food.canonical_id ? catalogById[food.canonical_id] ?? null : null)
        )
      ),
    [mergeToGrocery, catalogById]
  );
  const addOneToGrocery = useCallback((food: Food) => void addToGrocery([food]), [addToGrocery]);

  const handleAddAllLow = useCallback(
    () => void addToGrocery([...stockBuckets.out, ...stockBuckets.low]),
    [addToGrocery, stockBuckets]
  );
  const handleAddSafe = useCallback(() => void addToGrocery(safeRunningLow), [addToGrocery, safeRunningLow]);
  const handleStripFilter = useCallback((filter: StockFilter) => {
    setStockFilter(filter);
    if (filter !== "all") setSortBy("low-stock");
  }, []);
  const handleShowUntracked = useCallback(() => {
    setStockFilter("out-of-stock");
    setCategoryFilter("all");
  }, []);

  // --- AI suggestions ----------------------------------------------------------
  const activeKid = useMemo(
    () => (activeKidId ? kids.find((k) => k.id === activeKidId) ?? null : null),
    [kids, activeKidId]
  );
  const aiDisabledReason = activeKid
    ? undefined
    : t("pantry.suggestions.needsKid");

  const handleGetSuggestions = useCallback(async () => {
    if (!activeKid) {
      toast(t("pantry.suggestions.needsKid"));
      return;
    }
    setIsLoadingSuggestions(true);
    setShowSuggestions(true);
    setAddedSuggestions(new Set());
    try {
      const current = foodsRef.current;
      const { data, error } = await invokeEdgeFunction<SuggestFoodsResponse>("suggest-foods", {
        body: {
          foods: current.slice(0, AI_FOOD_CAP).map((f) => ({
            name: f.name,
            category: f.category,
            is_safe: f.is_safe,
            is_try_bite: f.is_try_bite,
          })),
          planEntries: planEntries
            .filter((p) => p.kid_id === activeKid.id)
            .map((p) => ({ food_id: p.food_id, result: p.result })),
          childProfile: projectChildProfile(activeKid),
        },
      });
      if (error) throw error;
      if (data?.error) {
        if (String(data.error).includes("Rate limits")) {
          toast.error(t("pantry.suggestions.rateLimited"), {
            description: t("pantry.suggestions.tryLater"),
          });
        } else if (String(data.error).includes("Payment required")) {
          toast.error(t("pantry.suggestions.creditsTitle"), {
            description: t("pantry.suggestions.credits"),
          });
        } else {
          throw new Error(String(data.error));
        }
        setSuggestions([]);
      } else {
        const list: FoodSuggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
        // A suggestion for something already in the pantry is no suggestion.
        setSuggestions(list.filter((s) => s?.name && !findExistingFood(foodsRef.current, { name: s.name })));
      }
    } catch (error) {
      logger.error("Error getting suggestions:", error);
      toast.error(t("pantry.suggestions.failed"));
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [activeKid, planEntries, t]);

  const markSuggestionAdded = useCallback((key: string) => {
    setAddedSuggestions((prev) => new Set(prev).add(key));
  }, []);

  const handleSuggestionToGrocery = useCallback(
    (suggestion: FoodSuggestion, key: string) => {
      const touched = mergeToGrocery([
        { name: suggestion.name, quantity: 1, unit: "", category: suggestion.category, added_via: "pantry" },
      ]);
      if (touched > 0) markSuggestionAdded(key);
    },
    [mergeToGrocery, markSuggestionAdded]
  );

  const handleSuggestionAsTryBite = useCallback(
    async (suggestion: FoodSuggestion, key: string) => {
      const added = await addFood({
        name: suggestion.name,
        category: suggestion.category,
        is_safe: false,
        is_try_bite: true,
      });
      if (added) {
        markSuggestionAdded(key);
        toast.success(
          t("pantry.suggestions.addedTryBite", { name: suggestion.name })
        );
      }
      // If blocked by plan limit, the upgrade modal handles messaging.
    },
    [addFood, markSuggestionAdded, t]
  );

  // --- Edit dialog ---------------------------------------------------------------
  const handleEdit = useCallback((food: Food) => {
    setEditFood(food);
    setDialogOpen(true);
  }, []);

  const openAddDetails = useCallback((name: string) => {
    const food = findExistingFood(foodsRef.current, { name });
    setEditFood(food ?? null);
    setDialogOpen(true);
  }, []);

  // What the quick-add line would stack onto, for its preview chip. The
  // component owns its text, so the page listens to the input's change events.
  const [quickAddText, setQuickAddText] = useState("");
  const handleQuickAddInput = useCallback((e: FormEvent<HTMLDivElement>) => {
    const target = e.target;
    if (target instanceof HTMLInputElement) setQuickAddText(target.value);
  }, []);
  const quickAddMatch = useMemo(() => {
    const parse = quickAddText.trim() ? parsePantryQuickAddLine(quickAddText) : null;
    if (!parse) return null;
    const existing = findExistingFood(foods, { name: parse.name });
    if (!existing || !unitsMatch(existing.unit, parse.unit)) return null;
    const from = existing.quantity ?? 0;
    return {
      name: existing.name,
      from,
      to: round2(from + parse.quantity),
      unit: existing.unit || undefined,
    };
  }, [quickAddText, foods]);

  // US-288: Quick-add (single line), stacking onto a food already there.
  const handleQuickAddOne = useCallback(
    async (parse: PantryQuickAddParse): Promise<boolean> => {
      const existing = findExistingFood(foodsRef.current, { name: parse.name });
      if (existing && unitsMatch(existing.unit, parse.unit)) {
        const before = existing.quantity ?? 0;
        const after = round2(before + parse.quantity);
        handleQuantityChange(existing.id, after);
        haptic.light();
        toast.success(
          t("pantry.quickAdd.toppedUp", {
            name: existing.name,
            from: fmt(before),
            to: fmt(after),
          }),
          {
            action: {
              label: t("pantry.toast.undo"),
              onClick: () => handleQuantityChange(existing.id, before),
            },
          }
        );
        return true;
      }
      const added = await addFood({
        name: parse.name,
        category: parse.category,
        quantity: parse.quantity,
        unit: parse.unit || undefined,
        // US-803: the parent typed a name and a quantity, not a judgement
        // about whether their child eats it.
        is_safe: ACQUIRED_FOOD_IS_SAFE,
        is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
      });
      if (added) {
        toast.success(t("pantry.toast.added", { name: parse.name }), {
          action: {
            label: t("pantry.toast.addDetails"),
            onClick: () => openAddDetails(parse.name),
          },
        });
      }
      return added;
    },
    [addFood, handleQuantityChange, openAddDetails, t, fmt]
  );

  // US-288: Quick-add bulk (textarea, one item per line). The paste is the
  // single bulk path; lines that match a food stack onto it.
  const handleQuickAddMany = useCallback(
    async (parses: PantryQuickAddParse[]): Promise<boolean> => {
      const fresh: PantryQuickAddParse[] = [];
      let stacked = 0;
      for (const parse of parses) {
        const existing = findExistingFood(foodsRef.current, { name: parse.name });
        if (existing && unitsMatch(existing.unit, parse.unit)) {
          handleQuantityChange(existing.id, round2((existing.quantity ?? 0) + parse.quantity));
          stacked++;
        } else {
          fresh.push(parse);
        }
      }
      let added = true;
      if (fresh.length > 0) {
        added = await addFoods(
          fresh.map((p) => ({
            name: p.name,
            category: p.category,
            quantity: p.quantity,
            unit: p.unit || undefined,
            // US-803, as above: quick-add is entry, not a safety decision.
            is_safe: ACQUIRED_FOOD_IS_SAFE,
            is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
          }))
        );
      }
      const count = (added ? fresh.length : 0) + stacked;
      if (count > 0) {
        toast.success(t("pantry.toast.bulkAdded", { count, formatted: fmt(count) }));
      }
      return added;
    },
    [addFoods, handleQuantityChange, t, fmt]
  );

  // The edit branch never writes quantity directly: a changed count goes
  // through handleQuantityChange, so the ledger records it as a correction.
  const handleSave = useCallback(
    async (foodData: Omit<Food, "id">): Promise<boolean> => {
      if (editFood) {
        const { quantity, ...rest } = foodData;
        updateFood(editFood.id, rest);
        if (quantity !== undefined && quantity !== editFood.quantity) {
          handleQuantityChange(editFood.id, quantity);
        }
        setEditFood(null);
        return true;
      }
      const added = await addFood(foodData);
      if (added) setEditFood(null);
      return added;
    },
    [editFood, updateFood, addFood, handleQuantityChange]
  );

  const handleDialogClose = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditFood(null);
  }, []);

  // Item 20: the starter list is a checklist sheet, scored per kid.
  const handleLoadStarterList = useCallback(() => setStarterOpen(true), []);

  const handleStarterAdd = useCallback(
    async (list: Omit<Food, "id">[]): Promise<boolean> => {
      // The sheet already hides what is in the pantry; this catches a food
      // added on another device while it was open.
      const fresh = list.filter((f) => !findExistingFood(foodsRef.current, { name: f.name }));
      if (fresh.length === 0) {
        toast(t("pantry.toast.starterAlready"));
        return true;
      }
      const added = await addFoods(fresh);
      if (added) {
        toast.success(t("pantry.toast.starterLoaded", { count: fresh.length, formatted: fmt(fresh.length) }));
      }
      // If blocked by plan limit, the upgrade modal handles the messaging.
      return added;
    },
    [addFoods, t, fmt]
  );

  const handleFoodIdentified = useCallback(
    async (foodData: FoodIdentification) => {
      logger.debug("handleFoodIdentified received:", foodData);
      const canonicalId = (foodData as FoodIdentification & { canonical_id?: string | null }).canonical_id ?? null;
      const qty = foodData.quantity || 1;
      const existing = findExistingFood(foodsRef.current, { name: foodData.name, canonicalId });
      if (existing) {
        await topUpFood(existing, qty);
        toast.success(
          t("pantry.toast.toppedUpBy", {
            amount: fmt(qty),
            name: existing.name,
          })
        );
        return;
      }
      const added = await addFood({
        name: foodData.name,
        category: foodData.category,
        // US-803: a photo says what the food is, not whether a child eats it.
        is_safe: ACQUIRED_FOOD_IS_SAFE,
        is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
        quantity: qty,
        package_quantity: foodData.servingSize || undefined,
        ...(canonicalId ? { canonical_id: canonicalId } : {}),
      });
      if (added) {
        toast.success(t("pantry.toast.added", { name: foodData.name }), {
          action: {
            label: t("pantry.toast.addDetails"),
            onClick: () => openAddDetails(foodData.name),
          },
        });
      }
      // If blocked by plan limit, the upgrade modal handles messaging.
    },
    [topUpFood, addFood, openAddDetails, t, fmt]
  );

  /** A scanned product: stack onto the same barcode or product, else insert. */
  const handleBarcodeAdd = useCallback(
    async ({ food, barcode, existingFoodId, delta, unit }: BarcodePantryAdd): Promise<boolean> => {
      const current = foodsRef.current;
      const existing =
        (existingFoodId ? current.find((f) => f.id === existingFoodId) : undefined) ??
        findExistingFood(current, {
          name: food.name,
          barcode: barcode || food.barcode || null,
          canonicalId: food.canonical_id ?? null,
        });
      const qty = delta > 0 ? delta : 1;
      if (existing) {
        await topUpFood(existing, qty, unit ?? food.unit ?? null);
        toast.success(
          t("pantry.toast.toppedUpBy", {
            amount: fmt(qty),
            name: existing.name,
          })
        );
        return true;
      }
      return addFood({
        ...food,
        quantity: qty,
        barcode: barcode || food.barcode || null,
        canonical_id: food.canonical_id ?? null,
        // US-803: a scanned product is a product, not a safe food.
        is_safe: ACQUIRED_FOOD_IS_SAFE,
        is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
      });
    },
    [topUpFood, addFood, t, fmt]
  );

  /** A receipt line for a food already in the pantry. */
  const handleReceiptTopUp = useCallback(
    async (
      foodId: string,
      delta: number,
      unit: string | null,
      price?: { unitPrice: number; currency: string } | null
    ): Promise<void> => {
      const food = foodsRef.current.find((f) => f.id === foodId);
      if (!food) return;
      await topUpFood(food, delta, unit, undefined, price);
    },
    [topUpFood]
  );

  const toggleCategory = useCallback((cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStockFilter("all");
    setFitFilter("all");
  }, []);

  const openAddDialog = useCallback(() => {
    setEditFood(null);
    setDialogOpen(true);
  }, []);
  const openScanner = useCallback(() => {
    haptic.light();
    setScannerOpen(true);
  }, []);
  const openReceipt = useCallback(() => {
    haptic.light();
    setReceiptScanOpen(true);
  }, []);
  const openPhoto = useCallback(() => setImageCaptureOpen(true), []);
  const openCsv = useCallback(() => setCsvOpen(true), []);
  const openWaste = useCallback(() => setWasteOpen(true), []);
  const closeReceipt = useCallback(() => setReceiptScanOpen(false), []);
  const closeScanner = useCallback(() => setScannerOpen(false), []);
  const prefetchScanner = useCallback(() => void loadBarcodeScanner(), []);
  const prefetchReceipt = useCallback(() => void loadReceiptScanner(), []);
  const getCatalog = useCallback(
    (food: Food) => (food.canonical_id ? catalogById[food.canonical_id] ?? null : null),
    [catalogById]
  );

  const anyDialogOpen =
    dialogOpen ||
    scannerOpen ||
    imageCaptureOpen ||
    receiptScanOpen ||
    csvOpen ||
    showSuggestions ||
    starterOpen ||
    wasteOpen;

  // '/' focuses search, 'b' opens the barcode scanner. Radix handles Escape.
  useKeyboardShortcuts({
    enabled: !anyDialogOpen,
    shortcuts: [
      {
        key: "/",
        description: t("pantry.shortcuts.search"),
        action: () => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        },
      },
      {
        key: "b",
        description: t("pantry.shortcuts.barcode"),
        action: openScanner,
      },
    ],
  });

  // === RENDER ===

  const resultCount = processedFoods.length;
  const pillBase =
    "flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const pillActive = "bg-primary text-primary-foreground border-primary shadow-sm";
  const pillInactive = "bg-card hover:bg-muted/80 border-border";

  const renderFlatCard = (food: Food) => (
    <FoodCard
      food={food}
      onEdit={handleEdit}
      onDelete={deleteFood}
      onQuantityChange={handleQuantityChange}
      onWaste={handleWaste}
      // US-797: catalogById holds stable references, so this does not defeat FoodCard's memo.
      catalog={getCatalog(food)}
      fit={fitByFoodId.get(food.id)}
      onAddToGrocery={addOneToGrocery}
      onList={isOnList(onListKeys, food)}
      runsOutInDays={forecastDays.get(food.id)}
    />
  );
  const renderListRow = (food: Food) => (
    <PantryListItem
      food={food}
      onEdit={handleEdit}
      onDelete={deleteFood}
      onQuantityChange={handleQuantityChange}
      onWaste={handleWaste}
      onAddToGrocery={addOneToGrocery}
      catalog={getCatalog(food)}
      fit={fitByFoodId.get(food.id)}
      onList={isOnList(onListKeys, food)}
      runsOutInDays={forecastDays.get(food.id)}
      onUsedUp={handleUsedUp}
    />
  );

  return (
    <div
      ref={pullToRefreshRef}
      className="relative min-h-screen pb-20 md:pt-20 bg-background"
    >
      <Helmet>
        <title>{t("pantry.meta.title")}</title>
        <meta
          name="description"
          content={t("pantry.meta.description")}
        />
        <meta name="robots" content="noindex" />
      </Helmet>
      {isMobile && (
        <PullToRefreshIndicator
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
        />
      )}

      <div
        className="container mx-auto px-4 py-4 md:py-6 max-w-7xl"
        style={{
          transform:
            isMobile && !isRefreshing && pullDistance > 0
              ? `translateY(${pullDistance}px)`
              : undefined,
          transition:
            pullDistance === 0 ? "transform 0.2s ease-out" : "none",
        }}
      >
        <div className="flex flex-col gap-2.5 md:gap-4">
          {/* === HEADER === */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold font-heading">
              {t('pantry.title')}
            </h1>
            <p className="text-sm text-muted-foreground flex-1 min-w-0">
              {foods.length > 0
                ? t("pantry.subtitle", {
                    count: foods.length,
                    formatted: fmt(foods.length),
                    categories: t("pantry.subtitleCategories", {
                      count: categoriesInUse,
                      formatted: fmt(categoriesInUse),
                    }),
                  })
                : t('pantry.subtitleEmpty')}
            </p>
            {/* The report reads ledger waste movements, which only exist while
                ledger writes are on; with them off it would always claim
                nothing was thrown out. */}
            {foods.length > 0 && ledgerWritesEnabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 gap-1.5 self-center"
                onClick={openWaste}
                title={t("pantry.waste.openLabel", "What was thrown out this month")}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t("pantry.waste.open", "Waste")}
              </Button>
            )}
          </div>

          {/* === CAPTURE BAR === */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0" onChange={handleQuickAddInput}>
              <PantryQuickAdd
                onAddOne={handleQuickAddOne}
                onAddMany={handleQuickAddMany}
                existingMatch={quickAddMatch}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-11 shrink-0 p-0"
              onClick={openScanner}
              onPointerEnter={prefetchScanner}
              onFocus={prefetchScanner}
              aria-label={t("pantry.captureBar.scanBarcode")}
              aria-keyshortcuts="b"
            >
              <ScanBarcode className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-11 shrink-0 p-0"
              onClick={openReceipt}
              onPointerEnter={prefetchReceipt}
              onFocus={prefetchReceipt}
              aria-label={t("pantry.captureBar.scanReceipt")}
            >
              <Receipt className="h-5 w-5" aria-hidden="true" />
            </Button>
            <PantryCaptureMenu
              onPhoto={openPhoto}
              onImportCsv={openCsv}
              onAiIdeas={handleGetSuggestions}
              onStarter={
                foods.length <= STARTER_OFFER_MAX_FOODS && foodsHydrated ? handleLoadStarterList : undefined
              }
            />
          </div>

          {/* === STOCK STRIP === */}
          {foods.length > 0 && (
            <PantryStockStrip
              safeRunningLow={safeRunningLow}
              kidName={lensKid?.name}
              lowCount={stockBuckets.low.length}
              outCount={stockBuckets.out.length}
              untrackedCount={stockBuckets.untracked.length}
              soonest={soonest}
              stockFilter={stockFilter}
              onFilter={handleStripFilter}
              onAddAll={handleAddAllLow}
              onAddSafe={handleAddSafe}
              onShowUntracked={handleShowUntracked}
            />
          )}

          {/* === KID LENS === */}
          <PantryKidLens
            kids={kids}
            selectedKidId={lensKidId}
            onSelect={handleLensSelect}
            fitFilter={fitFilter}
            onFitFilter={setFitFilter}
          />

          {/* === SEARCH, SORT, VIEW: one row === */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                ref={searchInputRef}
                type="search"
                placeholder={t("pantry.filters.searchPlaceholder")}
                aria-label={t("pantry.filters.searchLabel")}
                aria-keyshortcuts="/"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-11"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("pantry.filters.clearSearch")}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <Select value={sortBy} onValueChange={handleSortBy}>
              {/* aria-label (US-778): the trigger renders an icon and the value. */}
              <SelectTrigger
                className="h-11 w-11 shrink-0 justify-center px-0 text-sm md:w-[180px] md:justify-between md:px-3 [&>svg:last-child]:hidden md:[&>svg:last-child]:block"
                aria-label={t("pantry.sort.label")}
              >
                <ArrowUpDown className="h-4 w-4 shrink-0 md:mr-1.5" aria-hidden="true" />
                <span className="hidden md:inline truncate">
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t("pantry.sort.name")}</SelectItem>
                <SelectItem value="low-stock">{t("pantry.sort.lowStock")}</SelectItem>
                <SelectItem value="category">{t("pantry.sort.category")}</SelectItem>
                <SelectItem value="recent">{t("pantry.sort.recent")}</SelectItem>
              </SelectContent>
            </Select>

            <div
              role="group"
              aria-label={t("pantry.view.label")}
              className="flex shrink-0 items-center gap-0.5 bg-muted rounded-lg p-0.5"
            >
              {VIEW_MODES.map((mode) => {
                const Icon = mode === "grid" ? LayoutGrid : List;
                const pressed = viewMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleViewMode(mode)}
                    aria-pressed={pressed}
                    aria-label={mode === "grid" ? t("pantry.view.grid") : t("pantry.view.list")}
                    className={cn(
                      "h-10 w-10 flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      pressed ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* === CATEGORY PILLS === */}
          <div
            role="group"
            aria-label={t("pantry.filters.categories")}
            className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide"
          >
            <button
              type="button"
              aria-pressed={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
              className={cn(pillBase, categoryFilter === "all" ? pillActive : pillInactive)}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              {t("pantry.filters.all")}
              <Badge
                variant="secondary"
                aria-hidden="true"
                className={cn(
                  "text-[10px] h-[18px] px-1.5 tabular-nums",
                  categoryFilter === "all" && "bg-primary-foreground/20 text-primary-foreground"
                )}
              >
                {fmt(foods.length)}
              </Badge>
              <span className="sr-only">
                {t("pantry.filters.itemCount", { count: foods.length, formatted: fmt(foods.length) })}
              </span>
            </button>

            {PANTRY_DISPLAY_ORDER.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              if (count === 0) return null;
              const config = getCategoryConfig(cat);
              const Icon = config.icon;
              const isActive = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setCategoryFilter(cat)}
                  // Item 24: the pill wears its category's tokens, tinted at
                  // rest and solid when chosen. aria-pressed carries the state.
                  className={cn(pillBase, isActive ? config.pillActive : config.pillInactive)}
                  data-category={cat}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {t(config.labelKey, config.label)}
                  <Badge
                    variant="secondary"
                    aria-hidden="true"
                    className="text-[10px] h-[18px] px-1.5 tabular-nums bg-background text-foreground hover:bg-background"
                  >
                    {fmt(count)}
                  </Badge>
                  <span className="sr-only">
                    {t("pantry.filters.itemCount", { count, formatted: fmt(count) })}
                  </span>
                </button>
              );
            })}
          </div>

          {/* === ACTIVE FILTERS === */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {stockFilter !== "all" && (
                <Badge variant="outline" className="gap-1 text-sm py-1 px-3">
                  {stockFilter === "low-stock"
                    ? t("pantry.filters.showingLow")
                    : stockFilter === "out-of-stock"
                      ? t("pantry.filters.showingOut")
                      : t("pantry.filters.showingRestock")}
                  <button
                    aria-label={t("pantry.filters.clearStock")}
                    type="button"
                    onClick={() => setStockFilter("all")}
                    className="ml-1 hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              )}
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-1 min-h-9 px-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                {t("pantry.filters.clear", { count: activeFilterCount, formatted: fmt(activeFilterCount) })}
              </button>
            </div>
          )}

          {/* One announcement for the result count, instead of a live region
              on the whole grid that read every card back on each keystroke. */}
          <p role="status" className="sr-only">
            {isInitialLoading ? "" : t("pantry.resultCount", { count: resultCount, formatted: fmt(resultCount) })}
          </p>

          {/* === CONTENT === */}
          {isInitialLoading ? (
            <LoadingSkeleton />
          ) : foods.length === 0 ? (
            <EmptyPantryState
              onAddFood={openAddDialog}
              onLoadStarter={handleLoadStarterList}
              onGetSuggestions={handleGetSuggestions}
              starterDisabled={!foodsHydrated}
              aiDisabledReason={aiDisabledReason}
            />
          ) : processedFoods.length === 0 ? (
            <FilteredEmptyState onClear={clearAllFilters} kidName={lensKid?.name} />
          ) : showGroupedView ? (
            <div className="flex flex-col gap-2">
              {PANTRY_DISPLAY_ORDER.map((cat) => {
                const items = groupedFoods[cat];
                if (!items || items.length === 0) return null;
                return (
                  <PantryCategorySection
                    key={cat}
                    category={cat}
                    items={items}
                    isOpen={!collapsedCategories.has(cat)}
                    onToggle={toggleCategory}
                    viewMode={viewMode}
                    onEdit={handleEdit}
                    onDelete={deleteFood}
                    onQuantityChange={handleQuantityChange}
                    onWaste={handleWaste}
                    onAddToGrocery={addOneToGrocery}
                    kidAllergens={NO_ALLERGENS}
                    getCatalog={getCatalog}
                    fitByFoodId={fitByFoodId}
                    onListKeys={onListKeys}
                    runsOutInDays={forecastDays}
                    onUsedUp={handleUsedUp}
                  />
                );
              })}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              {displayedFoods.map((food) => (
                <div key={food.id}>{renderFlatCard(food)}</div>
              ))}
            </div>
          ) : nextVirtual ? (
            <div ref={listRef} className="border rounded-xl">
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const food = displayedFoods[virtualRow.index];
                  if (!food) return null;
                  return (
                    <div
                      key={food.id}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      className="border-b last:border-b-0"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      {renderListRow(food)}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden divide-y">
              {displayedFoods.map((food) => (
                <div key={food.id}>{renderListRow(food)}</div>
              ))}
            </div>
          )}

          {/* Load more (the grouped view renders everything) */}
          {!isInitialLoading && !showGroupedView && hasMoreFoods && (
            <div className="flex justify-center py-4">
              <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
                {t("pantry.loadMore", {
                  count: processedFoods.length - visibleCount,
                  formatted: fmt(processedFoods.length - visibleCount),
                })}
              </Button>
            </div>
          )}
        </div>

        {/* === DIALOGS: each mounted only while open === */}
        <Suspense fallback={null}>
          {dialogOpen && (
            <AddFoodDialog
              open={dialogOpen}
              onOpenChange={handleDialogClose}
              onSave={handleSave}
              editFood={editFood}
            />
          )}

          {scannerOpen && (
            <BarcodeScannerDialog
              open={scannerOpen}
              onOpenChange={setScannerOpen}
              onFoodAdded={closeScanner}
              targetTable="foods"
              onAddToPantry={handleBarcodeAdd}
              pantryFoods={foods}
            />
          )}

          {imageCaptureOpen && (
            <ImageFoodCapture
              open={imageCaptureOpen}
              onOpenChange={setImageCaptureOpen}
              onFoodIdentified={handleFoodIdentified}
            />
          )}

          {receiptScanOpen && (
            <ScanReceiptDialog open={receiptScanOpen} onClose={closeReceipt} onTopUp={handleReceiptTopUp} />
          )}

          {csvOpen && <ImportCsvDialog open={csvOpen} onOpenChange={setCsvOpen} />}

          {starterOpen && (
            <PantryStarterSheet
              open={starterOpen}
              onOpenChange={setStarterOpen}
              kids={kids}
              foods={foods}
              planEntries={planEntries}
              onAdd={handleStarterAdd}
            />
          )}

          {wasteOpen && (
            <PantryWasteSheet
              open={wasteOpen}
              onOpenChange={setWasteOpen}
              foods={foods}
              fitByFoodId={fitByFoodId}
            />
          )}
        </Suspense>

        <SuggestionsDialog
          open={showSuggestions}
          onOpenChange={setShowSuggestions}
          loading={isLoadingSuggestions}
          suggestions={suggestions}
          added={addedSuggestions}
          onAddToGrocery={handleSuggestionToGrocery}
          onAddAsTryBite={handleSuggestionAsTryBite}
        />
      </div>
    </div>
  );
}

// === SUB-COMPONENTS ===

/** Kept stable: PantryCategorySection still takes the legacy prop; `fit` supersedes it. */
const NO_ALLERGENS: string[] = [];

const SuggestionsDialog = memo(function SuggestionsDialog({
  open,
  onOpenChange,
  loading,
  suggestions,
  added,
  onAddToGrocery,
  onAddAsTryBite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  suggestions: FoodSuggestion[];
  added: ReadonlySet<string>;
  onAddToGrocery: (s: FoodSuggestion, key: string) => void;
  onAddAsTryBite: (s: FoodSuggestion, key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("pantry.suggestions.title")}
          </DialogTitle>
          <DialogDescription className="text-base">
            {t("pantry.suggestions.description")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div role="status" className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 text-primary motion-safe:animate-spin mb-4" aria-hidden="true" />
            <p className="text-muted-foreground">{t("pantry.suggestions.loading")}</p>
          </div>
        ) : suggestions.length > 0 ? (
          <ul className="space-y-3">
            {suggestions.map((suggestion, index) => {
              const key = `${suggestion.name}-${index}`;
              const isAdded = added.has(key);
              return (
                <li key={key}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1">{suggestion.name}</h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            {t(getCategoryConfig(suggestion.category).labelKey, getCategoryConfig(suggestion.category).label)}
                          </p>
                          <p className="text-sm">{suggestion.reason}</p>
                        </div>
                        {isAdded ? (
                          <Button size="sm" variant="outline" disabled className="shrink-0 gap-1">
                            <Check className="h-4 w-4" aria-hidden="true" />
                            {t("pantry.suggestions.added")}
                          </Button>
                        ) : (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Button size="sm" className="gap-1" onClick={() => onAddToGrocery(suggestion, key)}>
                              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                              {t("pantry.suggestions.addToGrocery")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onAddAsTryBite(suggestion, key)}>
                              {t("pantry.suggestions.addAsTryBite")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>{t("pantry.suggestions.none")}</p>
            <p className="text-sm mt-2">{t("pantry.suggestions.noneHint")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

function LoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">{t("pantry.loading")}</span>
      <Skeleton className="h-11 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-card rounded-lg border p-3.5 space-y-3" data-testid="pantry-skeleton-card">
            <div className="flex justify-between items-start">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-7 w-14 rounded" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <div className="flex gap-2 items-center">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const optionCardClass =
  "w-full rounded-xl border bg-card text-card-foreground p-6 text-center transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

function EmptyPantryState({
  onAddFood,
  onLoadStarter,
  onGetSuggestions,
  starterDisabled,
  aiDisabledReason,
}: {
  onAddFood: () => void;
  onLoadStarter: () => void;
  onGetSuggestions: () => void;
  starterDisabled?: boolean;
  aiDisabledReason?: string;
}) {
  // Its own hook: this is a separate component from Pantry, so the page's `t`
  // is not in scope here. Without it the t() calls below are an unbound
  // identifier and the screen throws ReferenceError (TS2304 must stay at 0).
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Utensils className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold font-heading mb-2">
          {t('pantry.emptyTitle')}
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          {t('pantry.emptyText')}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <button type="button" className={optionCardClass} onClick={onLoadStarter} disabled={starterDisabled}>
          <span className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Download className="h-6 w-6 text-primary" aria-hidden="true" />
          </span>
          <span className="block font-semibold mb-1">{t("pantry.empty.starterTitle")}</span>
          <span className="block text-sm text-muted-foreground mb-3">
            {t("pantry.empty.starterText")}
          </span>
          <Badge variant="secondary">{t("pantry.empty.recommended")}</Badge>
        </button>

        <button type="button" className={optionCardClass} onClick={onAddFood}>
          <span className="w-12 h-12 rounded-xl bg-safe-food/10 flex items-center justify-center mx-auto mb-3">
            <Plus className="h-6 w-6 text-safe-food" aria-hidden="true" />
          </span>
          <span className="block font-semibold mb-1">{t("pantry.empty.manualTitle")}</span>
          <span className="block text-sm text-muted-foreground">
            {t("pantry.empty.manualText")}
          </span>
        </button>

        <button
          type="button"
          className={optionCardClass}
          onClick={onGetSuggestions}
          disabled={Boolean(aiDisabledReason)}
          aria-describedby={aiDisabledReason ? "pantry-ai-disabled-reason" : undefined}
        >
          <span className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="h-6 w-6 text-accent" aria-hidden="true" />
          </span>
          <span className="block font-semibold mb-1">{t("pantry.empty.aiTitle")}</span>
          <span className="block text-sm text-muted-foreground">
            {t("pantry.empty.aiText")}
          </span>
          {aiDisabledReason && (
            <span id="pantry-ai-disabled-reason" className="block text-xs text-muted-foreground mt-2">
              {aiDisabledReason}
            </span>
          )}
        </button>
      </div>

      <div className="bg-muted/50 rounded-xl p-5">
        <h3 className="font-semibold mb-3 text-sm">{t("pantry.empty.tipsTitle")}</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-safe-food font-bold">1.</span>
            <span>
              <strong>{t("pantry.empty.tipSafeLabel")}</strong>{" "}
              {t("pantry.empty.tipSafe")}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-try-bite font-bold">2.</span>
            <span>
              <strong>{t("pantry.empty.tipTryLabel")}</strong>{" "}
              {t("pantry.empty.tipTry")}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">3.</span>
            <span>
              <strong>{t("pantry.empty.tipQtyLabel")}</strong>{" "}
              {t("pantry.empty.tipQty")}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function FilteredEmptyState({ onClear, kidName }: { onClear: () => void; kidName?: string }) {
  // Its own hook, for the same reason as EmptyPantryState.
  const { t } = useTranslation();
  return (
    <div className="text-center py-16 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
        <Search className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-muted-foreground mb-4">
        {kidName
          ? t("pantry.filteredEmpty.forKid", { kid: kidName })
          : t("pantry.filteredEmpty.text")}
      </p>
      <Button variant="outline" onClick={onClear}>
        {t("pantry.filteredEmpty.clear")}
      </Button>
    </div>
  );
}
