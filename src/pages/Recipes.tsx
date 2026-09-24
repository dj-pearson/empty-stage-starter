import {
  Fragment,
  lazy,
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { Helmet } from "react-helmet-async";
import { useFoods, useGrocery, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useNetworkStatus } from "@/hooks/useMobileOptimizations";
import {
  Plus,
  ChefHat,
  Clock,
  Lightbulb,
  Upload,
  Sparkles,
  Loader2,
  Folder,
  Users2,
  Check,
  ChevronDown,
  FolderPlus,
  Settings2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { analytics } from "@/lib/analytics";
import { EnhancedRecipeCard } from "@/components/EnhancedRecipeCard";
import { RecipeCollectionsSelector } from "@/components/RecipeCollectionsSelector";
import { CreateCollectionDialog } from "@/components/CreateCollectionDialog";
import { ManageCollectionsDialog } from "@/components/ManageCollectionsDialog";
import { AddToCollectionsDialog } from "@/components/AddToCollectionsDialog";
import { OrderIngredientsDialog } from "@/components/OrderIngredientsDialog";
import { RecipeToolbar } from "@/components/recipes/RecipeToolbar";
import { RecipeListItem } from "@/components/recipes/RecipeListItem";
import { RecipeDetailView } from "@/components/recipes/RecipeDetailView";
import { SmartGroceryDialog } from "@/components/recipes/SmartGroceryDialog";
import { SmartCollectionChips } from "@/components/recipes/SmartCollectionChips";
import { ImportDuplicateNotice } from "@/components/recipes/ImportDuplicateNotice";
import { buildSmartCollections, isSmartCollectionId } from "@/lib/recipeSmartCollections";
import { findLikelyDuplicate, mergeReviewedImport } from "@/lib/recipeImportReview";
import { toISODate } from "@/lib/date-utils";
import { useRecipeFilters, totalMinutes, type RecipeViewMode } from "@/hooks/useRecipeFilters";
import { useRecipeQuickPlan } from "@/hooks/useRecipeQuickPlan";
import { useRecipeCollections } from "@/hooks/useRecipeCollections";
import { useDeferredRecipeDelete } from "@/hooks/useDeferredRecipeDelete";
import { findAllergenConflicts, getKidFoodFit } from "@/lib/kidFit";
import { computeRecipeShortfall } from "@/lib/recipeShortfall";
import type { GroceryAddInput } from "@/lib/groceryMerge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { Recipe, RecipeCollection, Food, Kid } from "@/types";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { ScrollArea } from "@/components/ui/scroll-area";
import "@/i18n/appLocale";

// US-331-style code splitting: the builder and the import dialog are the two
// heaviest things on this screen and neither is needed until it is opened.
const EnhancedRecipeBuilder = lazy(() =>
  import("@/components/recipes/EnhancedRecipeBuilder").then((m) => ({ default: m.EnhancedRecipeBuilder })),
);
const ImportRecipeDialog = lazy(() =>
  import("@/components/ImportRecipeDialog").then((m) => ({ default: m.ImportRecipeDialog })),
);

interface RecipeSuggestion {
  name: string;
  description: string;
  food_ids: string[];
  food_names: string[];
  reason: string;
  difficulty: string;
  prepTime: string;
  cookTime: string;
}

type AiState = "idle" | "loading" | "no-pantry" | "ready";

/**
 * Below this many recipes the plain flow layout is cheaper than virtualizing:
 * the whole collection fits in a few screens and the absolute positioning,
 * measurement and re-render churn buy nothing. Shared by both views so they
 * switch over together.
 */
const VIRTUAL_THRESHOLD = 50;

/** Foods shown on the empty state's "meals they already eat" card. */
const EMPTY_STATE_FOOD_LIMIT = 5;

const WORKS_FOR_KEY = "recipe-works-for";
const VIEW_MODE_KEY = "recipe-view";

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

function toDifficulty(value: string | null | undefined): Difficulty | undefined {
  const v = (value ?? "").trim().toLowerCase();
  return (DIFFICULTIES as readonly string[]).includes(v) ? (v as Difficulty) : undefined;
}

function hasStoredViewMode(): boolean {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * What "add the missing ingredients" would put on the list for one recipe.
 * Structured recipes go through the unit-aware shortfall; legacy recipes
 * (food_ids only) count linked foods with nothing on hand.
 */
function missingItemsFor(
  recipe: Recipe,
  foods: Food[],
  foodById: ReadonlyMap<string, Food>,
): GroceryAddInput[] {
  if (recipe.recipe_ingredients && recipe.recipe_ingredients.length > 0) {
    return computeRecipeShortfall(recipe, foods)
      .filter((s) => s.ingredient.name.trim().length > 0)
      .map((s) => ({
        name: s.ingredient.name.trim(),
        quantity: s.needed > 0 ? s.needed : 1,
        unit: s.neededUnit ?? "",
        category: s.matchedFood?.category,
        added_via: "recipe",
        source_recipe_id: recipe.id,
      }));
  }
  const out: GroceryAddInput[] = [];
  for (const id of recipe.food_ids ?? []) {
    const food = foodById.get(id);
    if (!food || (food.quantity ?? 0) > 0) continue;
    out.push({
      name: food.name,
      quantity: 1,
      unit: food.unit ?? "",
      category: food.category,
      added_via: "recipe",
      source_recipe_id: recipe.id,
    });
  }
  return out;
}

/** One merged profile so family-mode suggestions avoid every kid's allergens and dislikes. */
function mergeChildProfiles(kids: readonly Kid[]): Partial<Kid> {
  const allergens = new Set<string>();
  const disliked = new Set<string>();
  for (const kid of kids) {
    for (const a of kid.allergens ?? []) allergens.add(a);
    for (const d of kid.disliked_foods ?? []) disliked.add(d);
  }
  return {
    name: kids.map((k) => k.name).join(", "),
    allergens: [...allergens],
    disliked_foods: [...disliked],
  };
}

const chipClass = (checked: boolean) =>
  cn(
    "inline-flex min-h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
    "motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    checked
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background text-foreground hover:bg-accent",
  );

export default function Recipes() {
  const { t } = useTranslation();
  // US-331: subscribe only to the domain slices this page uses so a grocery
  // toggle or food edit elsewhere doesn't re-render the whole Recipes page.
  const { recipes, addRecipe, updateRecipe, deleteRecipe } = useRecipes();
  const { foods } = useFoods();
  const { kids, activeKidId } = useKids();
  const { addGroceryItemsMerged } = useGrocery();
  const { planEntries } = usePlan();
  const { userId, householdId } = useAuth();
  const { online } = useNetworkStatus();
  const { planTonight } = useRecipeQuickPlan();
  const {
    collections: collectionList,
    itemsByCollection,
    collectionIdsByRecipe,
    countsByCollection,
    loading: collectionsLoading,
    error: collectionsError,
    create: createCollection,
    update: updateCollection,
    remove: removeCollection,
    setMembership,
    dropRecipe,
  } = useRecipeCollections(userId, householdId);

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  // Item 12: a parsed import waiting in the builder for the parent to confirm.
  const [importDraft, setImportDraft] = useState<Omit<Recipe, "id"> | null>(null);
  const [importDupDismissed, setImportDupDismissed] = useState(false);
  const [importKey, setImportKey] = useState(0);

  // Detail view state. Only the id is stored; the recipe is always read from
  // `recipes`, so an edit elsewhere shows up without a sync effect.
  const [viewingRecipeId, setViewingRecipeId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const viewingRecipe = useMemo(
    () => (viewingRecipeId ? recipes.find((r) => r.id === viewingRecipeId) ?? null : null),
    [recipes, viewingRecipeId],
  );

  // Smart grocery state
  const [groceryRecipe, setGroceryRecipe] = useState<Recipe | null>(null);
  const [groceryDialogOpen, setGroceryDialogOpen] = useState(false);

  // AI suggestions
  const [aiSuggestionsOpen, setAiSuggestionsOpen] = useState(false);
  const [aiState, setAiState] = useState<AiState>("idle");
  const [suggestions, setSuggestions] = useState<RecipeSuggestion[]>([]);
  const [hiddenForAllergens, setHiddenForAllergens] = useState(0);
  const [addedSuggestions, setAddedSuggestions] = useState<ReadonlySet<string>>(() => new Set());
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Collection states
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [showCreateCollectionDialog, setShowCreateCollectionDialog] = useState(false);
  const [showManageCollectionsDialog, setShowManageCollectionsDialog] = useState(false);
  const [showAddToCollectionsDialog, setShowAddToCollectionsDialog] = useState(false);
  const [recipeForCollections, setRecipeForCollections] = useState<Recipe | null>(null);
  const [editingCollection, setEditingCollection] = useState<RecipeCollection | null>(null);

  // Order ingredients states
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [recipeForOrder, setRecipeForOrder] = useState<Recipe | null>(null);

  // Kid lens: which kid the fit badges and sorts are scored for. Local to this
  // page on purpose; it never changes the app-wide active kid.
  const [storedWorksFor, setWorksFor] = useLocalStorage<string>(WORKS_FOR_KEY, activeKidId ?? "all");
  const lensKid = storedWorksFor === "all" ? null : kids.find((k) => k.id === storedWorksFor) ?? null;
  const worksFor = lensKid ? lensKid.id : "all";
  const targetKids = useMemo(() => (lensKid ? [lensKid] : kids), [lensKid, kids]);
  const allergenUnknown = targetKids.some((k) => k.allergens === undefined);

  const { pendingDeleteIds, requestDelete } = useDeferredRecipeDelete({
    deleteRecipe,
    dropRecipe,
    onRequested: useCallback(() => setDetailOpen(false), []),
  });

  // Filter by collection and hide pending deletes, then search/sort/filter.
  const liveRecipes = useMemo(
    () => (pendingDeleteIds.size === 0 ? recipes : recipes.filter((r) => !pendingDeleteIds.has(r.id))),
    [recipes, pendingDeleteIds],
  );
  // Item 11: smart collections, computed from kidFit, times and membership.
  const smartFoodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const smartCollections = useMemo(
    () =>
      liveRecipes.length === 0
        ? []
        : buildSmartCollections({
            recipes: liveRecipes,
            kids,
            foodById: smartFoodById,
            planEntries,
            collectionIdsByRecipe,
            includeUnfiled: Boolean(userId) && !collectionsLoading && collectionsError == null,
            todayKey: toISODate(new Date()),
          }),
    [liveRecipes, kids, smartFoodById, planEntries, collectionIdsByRecipe, userId, collectionsLoading, collectionsError],
  );
  const selectedSmart = useMemo(
    () => (isSmartCollectionId(selectedCollectionId) ? smartCollections.find((c) => c.id === selectedCollectionId) ?? null : null),
    [selectedCollectionId, smartCollections],
  );

  const collectionFilteredRecipes = useMemo(() => {
    if (!selectedCollectionId) return liveRecipes;
    if (isSmartCollectionId(selectedCollectionId)) {
      return selectedSmart ? liveRecipes.filter((recipe) => selectedSmart.recipeIds.has(recipe.id)) : liveRecipes;
    }
    const members = itemsByCollection[selectedCollectionId];
    if (!members) return [];
    return liveRecipes.filter((recipe) => members.has(recipe.id));
  }, [selectedCollectionId, selectedSmart, liveRecipes, itemsByCollection]);

  const {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    viewMode: storedViewMode,
    setViewMode,
    quickFilters,
    toggleQuickFilter,
    clearFilters,
    filteredRecipes,
    resultCount,
    totalCount,
    hasActiveFilters,
    foodById,
    fitByRecipeId,
  } = useRecipeFilters({ recipes: collectionFilteredRecipes, foods, kids, planEntries, worksFor });

  // A phone gets the list until the user picks a view themselves: a grid of
  // one column is a list with more scrolling.
  const isMd = useMediaQuery("(min-width: 768px)");
  const [viewChosen, setViewChosen] = useState(hasStoredViewMode);
  const viewMode: RecipeViewMode = !viewChosen && !isMd ? "list" : storedViewMode;
  const handleViewModeChange = useCallback(
    (mode: RecipeViewMode) => {
      setViewChosen(true);
      setViewMode(mode);
    },
    [setViewMode],
  );

  // Per-recipe view model, computed once per recipe rather than per render of
  // each card.
  const missingByRecipeId = useMemo(() => {
    const map = new Map<string, GroceryAddInput[]>();
    for (const recipe of collectionFilteredRecipes) {
      map.set(recipe.id, missingItemsFor(recipe, foods, foodById));
    }
    return map;
  }, [collectionFilteredRecipes, foods, foodById]);

  // Virtualization for both views (mirrors the proven Pantry pattern). Only
  // engages past VIRTUAL_THRESHOLD so small collections keep the simple flow
  // layout. The list scrolls inside its own box; the grid scrolls with the
  // page, so it uses the window virtualizer and keeps the page's scrollbar.
  const listParentRef = useRef<HTMLDivElement>(null);
  const gridParentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // US-564: the grid is responsive, so the number of cards per row has to be
  // known in JS before rows can be virtualized. These queries mirror the grid's
  // own classes (grid-cols-1 sm:grid-cols-2 xl:grid-cols-3) rather than
  // measuring, so the two cannot disagree about where a breakpoint is.
  const isSm = useMediaQuery("(min-width: 640px)");
  const isXl = useMediaQuery("(min-width: 1280px)");
  const gridColumns = isXl ? 3 : isSm ? 2 : 1;
  const useVirtualList = viewMode === 'list' && filteredRecipes.length >= VIRTUAL_THRESHOLD;
  const listVirtualizer = useVirtualizer({
    count: useVirtualList ? filteredRecipes.length : 0,
    getScrollElement: () => listParentRef.current,
    // US-636: first-paint guess only; measureElement reports the real height.
    // A RecipeListItem carries buttons, and src/index.css:215 gives every
    // button a 44px minimum on touch, so the row outgrows any fixed estimate
    // there and rows would creep into each other down the list.
    estimateSize: () => 72,
    overscan: 10,
  });

  const useVirtualGrid = viewMode === 'grid' && filteredRecipes.length >= VIRTUAL_THRESHOLD;

  // Cards are laid out one row at a time so the virtualizer has a single
  // vertical axis to work on. Recomputes when a filter, a sort or a breakpoint
  // changes, which is what keeps filtering working while virtualized.
  const gridRows = useMemo(() => {
    if (!useVirtualGrid) return [];
    const rows: (typeof filteredRecipes)[] = [];
    for (let i = 0; i < filteredRecipes.length; i += gridColumns) {
      rows.push(filteredRecipes.slice(i, i + gridColumns));
    }
    return rows;
  }, [useVirtualGrid, filteredRecipes, gridColumns]);

  // The grid starts partway down the page, so window scroll offsets have to be
  // shifted by how far down it begins or every row lands too high. Measured in
  // a layout effect (never by reading a ref during render) and re-measured
  // when the header above it changes height or the window resizes.
  const [gridTop, setGridTop] = useState(0);
  useLayoutEffect(() => {
    if (!useVirtualGrid) return;
    const measure = () => {
      const el = gridParentRef.current;
      if (!el) return;
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
      setGridTop((prev) => (prev === top ? prev : top));
    };
    measure();
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && headerRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(headerRef.current);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [useVirtualGrid]);

  const gridVirtualizer = useWindowVirtualizer({
    count: gridRows.length,
    // Recipe cards vary a lot in height (image or not, badge count, title
    // wrapping), so this is only the first-paint guess; measureElement reports
    // what each row actually renders at. See US-636.
    estimateSize: () => 420,
    overscan: 3,
    scrollMargin: gridTop,
  });

  // A brand-new account has no recipes and may have no foods either, so the
  // skeleton cannot wait on data that will never arrive (Pantry.tsx pattern).
  useEffect(() => {
    if (recipes.length > 0) {
      setIsInitialLoading(false);
      return;
    }
    const timeout = setTimeout(() => setIsInitialLoading(false), 1200);
    return () => clearTimeout(timeout);
  }, [recipes.length]);

  // The open recipe was deleted (here after its Undo ran out, or on another
  // device): close the sheet instead of showing a stale or empty one.
  useEffect(() => {
    if (!viewingRecipeId || viewingRecipe) return;
    if (detailOpen) {
      setDetailOpen(false);
      toast(t("recipes.toasts.removed", { defaultValue: "This recipe was removed" }));
    }
    setViewingRecipeId(null);
  }, [viewingRecipeId, viewingRecipe, detailOpen, t]);

  // A selected collection that no longer exists (deleted here or elsewhere)
  // falls back to all recipes instead of an empty screen with no way out.
  useEffect(() => {
    if (!selectedCollectionId || collectionsLoading) return;
    if (isSmartCollectionId(selectedCollectionId)) {
      // A smart collection goes away with its kid (or "Unfiled" while
      // collections are unavailable); fall back the same way.
      if (liveRecipes.length > 0 && !smartCollections.some((c) => c.id === selectedCollectionId)) {
        setSelectedCollectionId(null);
      }
      return;
    }
    if (!collectionList.some((c) => c.id === selectedCollectionId)) {
      setSelectedCollectionId(null);
    }
  }, [selectedCollectionId, collectionList, collectionsLoading, smartCollections, liveRecipes.length]);

  // Handlers
  const handleView = useCallback((recipe: Recipe) => {
    setViewingRecipeId(recipe.id);
    setDetailOpen(true);
  }, []);

  const handleEdit = useCallback((recipe: Recipe) => {
    setEditRecipe(recipe);
    setBuilderOpen(true);
  }, []);

  const handleEditFromDetail = useCallback((recipe: Recipe) => {
    setDetailOpen(false);
    setEditRecipe(recipe);
    setBuilderOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditRecipe(null);
    setBuilderOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setBuilderOpen(false);
    setEditRecipe(null);
    setImportDraft(null);
  }, []);

  const handleSave = useCallback(async (recipeData: Partial<Recipe>) => {
    try {
      if (!editRecipe && importDraft) {
        // Item 12: the reviewed import. The builder's fields win; what it has
        // no input for (source type, nutrition) comes from the parsed draft.
        await addRecipe(mergeReviewedImport(importDraft, recipeData));
        toast.success(t("recipes.toasts.imported", { defaultValue: "Recipe imported" }));
      } else if (editRecipe) {
        await updateRecipe(editRecipe.id, recipeData);
        toast.success(t("recipes.toasts.updated", { defaultValue: "Recipe updated" }));
      } else {
        await addRecipe(recipeData as Omit<Recipe, "id">);
        toast.success(t("recipes.toasts.created", { defaultValue: "Recipe created" }));
      }
      handleClose();
    } catch (error) {
      logger.error("Error saving recipe:", error);
      toast.error(t("recipes.toasts.saveFailed", { defaultValue: "Couldn't save the recipe" }));
    }
  }, [editRecipe, importDraft, updateRecipe, addRecipe, handleClose, t]);

  // Item 12: a parsed import is not saved straight away. It opens in the
  // builder, prefilled, for the parent to check; the builder's Save is the
  // one that writes (and owns the "Recipe imported" toast).
  const handleImport = useCallback(async (recipeData: Omit<Recipe, "id">) => {
    setImportKey((k) => k + 1);
    setImportDupDismissed(false);
    setEditRecipe(null);
    setImportDraft(recipeData);
    setBuilderOpen(true);
    analytics.trackEvent("recipe_import_review_opened", { source_type: recipeData.source_type ?? null });
  }, []);

  const importDuplicate = useMemo(
    () => (importDraft && !importDupDismissed ? findLikelyDuplicate(importDraft, liveRecipes) : null),
    [importDraft, importDupDismissed, liveRecipes],
  );

  const handleOpenDuplicate = useCallback(() => {
    const existing = importDuplicate?.recipe;
    if (!existing) return;
    setBuilderOpen(false);
    setImportDraft(null);
    setViewingRecipeId(existing.id);
    setDetailOpen(true);
  }, [importDuplicate]);

  // Opens the SmartGroceryDialog with the full recipe ingredient list.
  const handleAddToGrocery = useCallback((recipe: Recipe) => {
    setGroceryRecipe(recipe);
    setGroceryDialogOpen(true);
  }, []);

  // US-291: one-tap "add the missing ingredients" -- bypasses the dialog and
  // bulk-inserts only what is not on hand. Review opens the dialog to adjust.
  const missingRef = useRef(missingByRecipeId);
  missingRef.current = missingByRecipeId;
  const handleAddMissingToGrocery = useCallback(
    (recipe: Recipe) => {
      const items = missingRef.current.get(recipe.id) ?? missingItemsFor(recipe, foods, foodById);
      if (items.length === 0) return;
      // Route through the merging add so duplicates stack with existing lines
      // and provenance is stamped for the mark-made auto-check (US-262).
      const touched = addGroceryItemsMerged(items);
      toast.success(
        t("recipes.toasts.addedMissing", {
          count: touched,
          defaultValue_one: "Added 1 item to the grocery list",
          defaultValue: "Added {{count}} items to the grocery list",
        }),
        {
          description: recipe.name,
          action: {
            label: t("recipes.actions.review", { defaultValue: "Review" }),
            onClick: () => handleAddToGrocery(recipe),
          },
        },
      );
      analytics.trackEvent("recipe_add_missing_to_grocery", {
        recipe_id: recipe.id,
        missing_count: items.length,
        total_ingredients: recipe.food_ids.length,
      });
    },
    [addGroceryItemsMerged, foods, foodById, handleAddToGrocery, t]
  );

  const handleGroceryItemsAdd = useCallback((items: { name: string; quantity: number; unit: string; category: string; aisle?: string }[]) => {
    // Merge duplicates ("ground beef" + "ground beef 80/20" -> one stacked line)
    // and fold into existing unchecked rows instead of piling up new ones.
    const touched = addGroceryItemsMerged(
      items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        aisle: item.aisle,
        added_via: "recipe",
        source_recipe_id: groceryRecipe?.id,
      }))
    );
    if (touched > 0) {
      toast.success(
        t("recipes.toasts.addedToList", {
          count: touched,
          defaultValue_one: "Added 1 item to the grocery list",
          defaultValue: "Added {{count}} items to the grocery list",
        }),
        groceryRecipe ? { description: groceryRecipe.name } : undefined
      );
    }
  }, [addGroceryItemsMerged, groceryRecipe, t]);

  const fitRef = useRef(fitByRecipeId);
  fitRef.current = fitByRecipeId;
  const handlePlan = useCallback(
    (recipe: Recipe) => {
      void planTonight(recipe, fitRef.current.get(recipe.id));
    },
    [planTonight],
  );

  const handleAddToCollections = useCallback((recipe: Recipe) => {
    setRecipeForCollections(recipe);
    setShowAddToCollectionsDialog(true);
  }, []);

  const handleToggleFavorite = useCallback(
    (recipe: Recipe) => updateRecipe(recipe.id, { is_favorite: !recipe.is_favorite }),
    [updateRecipe],
  );

  const handleOpenCreateCollection = useCallback(() => {
    setEditingCollection(null);
    setShowCreateCollectionDialog(true);
  }, []);

  // A collection made from here is where the user wants to be next. The hook
  // adds it to `collections` before this runs, so the guard below keeps it.
  const handleCollectionCreated = useCallback((collection: RecipeCollection) => {
    setEditingCollection(null);
    if (collection?.id) setSelectedCollectionId(collection.id);
  }, []);

  const handleEditCollection = useCallback((collection: RecipeCollection) => {
    setEditingCollection(collection);
    setShowManageCollectionsDialog(false);
    setShowCreateCollectionDialog(true);
  }, []);

  const handleOrderIngredients = useCallback((recipe: Recipe) => {
    setRecipeForOrder(recipe);
    setShowOrderDialog(true);
  }, []);

  const handleWorksFor = useCallback(
    (id: string) => {
      setWorksFor(id);
      analytics.trackEvent("recipes_works_for_changed", { target: id === "all" ? "all" : "kid" });
    },
    [setWorksFor],
  );

  // AI Suggestions
  const handleAISuggestions = useCallback(async () => {
    if (!online) return;
    setAiSuggestionsOpen(true);
    setSuggestions([]);
    setHiddenForAllergens(0);
    setAddedSuggestions(new Set());

    // Foods marked safe that are in stock; when the household does not track
    // quantities at all, every safe food counts as available.
    const safeFoods = foods.filter((f) => f.is_safe);
    const tracksQuantity = foods.some((f) => (f.quantity ?? 0) > 0);
    const available = tracksQuantity ? safeFoods.filter((f) => (f.quantity ?? 0) > 0) : safeFoods;
    if (available.length === 0) {
      setAiState("no-pantry");
      return;
    }

    setAiState("loading");
    try {
      const childProfile = lensKid ?? (kids.length > 0 ? mergeChildProfiles(kids) : undefined);
      const pantryFoods = available.map((f) => ({
        id: f.id,
        name: f.name,
        category: f.category,
        allergens: f.allergens ?? [],
      }));
      const { data, error } = await invokeEdgeFunction<{ suggestions?: RecipeSuggestion[]; error?: string }>(
        "suggest-recipes-from-pantry",
        {
          body: { pantryFoods, childProfile, count: 5 },
        },
      );
      if (error) throw error;
      if (data?.error) {
        toast.error(t("recipes.ai.error", { defaultValue: "AI suggestions failed" }), { description: data.error });
        setSuggestions([]);
      } else {
        const all: RecipeSuggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
        // Never offer a recipe that carries one of the target kids' allergens.
        const safe = all.filter(
          (s) => findAllergenConflicts(targetKids, s.food_ids ?? [], foodById).length === 0,
        );
        setSuggestions(safe);
        setHiddenForAllergens(all.length - safe.length);
      }
    } catch (error) {
      logger.error("Error getting AI suggestions:", error);
      toast.error(t("recipes.ai.failed", { defaultValue: "Couldn't get suggestions" }));
    } finally {
      setAiState((s) => (s === "loading" ? "ready" : s));
    }
  }, [online, foods, lensKid, kids, targetKids, foodById, t]);

  const handleAddSuggestion = useCallback(async (suggestion: RecipeSuggestion, key: string) => {
    try {
      const minutes = totalMinutes({ prepTime: suggestion.prepTime, cookTime: suggestion.cookTime });
      const createdRecipe = await addRecipe({
        name: suggestion.name,
        description: suggestion.description,
        food_ids: suggestion.food_ids ?? [],
        prepTime: suggestion.prepTime,
        cookTime: suggestion.cookTime,
        // The "why this works" reason is not a cooking step; addRecipe falls
        // back to `tips` for instructions, so neither is sent.
        instructions: undefined,
        difficulty_level: toDifficulty(suggestion.difficulty),
        total_time_minutes: minutes ?? undefined,
      });
      if (!createdRecipe?.id) throw new Error("Recipe was not saved to database");
      setAddedSuggestions((prev) => new Set(prev).add(key));
      toast.success(t("recipes.ai.added", { defaultValue: 'Added "{{name}}" to recipes', name: suggestion.name }));
    } catch (error) {
      logger.error("Error adding recipe:", error);
      toast.error(t("recipes.ai.addFailed", { defaultValue: "Couldn't add the recipe" }), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [addRecipe, t]);

  const subtitle = lensKid
    ? t("recipes.subtitleChild", { name: lensKid.name })
    : t("recipes.subtitleFamily");

  // Empty state: foods the target kids already eat, allergen-free for them.
  const emptyKidName = lensKid?.name ?? (kids.length === 1 ? kids[0].name : null);
  const alreadyEats = useMemo(() => {
    if (kids.length === 0) return [];
    const out: Food[] = [];
    for (const food of foods) {
      if (out.length >= EMPTY_STATE_FOOD_LIMIT) break;
      if (findAllergenConflicts(targetKids, [food.id], foodById).length > 0) continue;
      const goTo = targetKids.some((k) => getKidFoodFit(k, food, []).alwaysEats);
      if (food.is_safe || goTo) out.push(food);
    }
    return out;
  }, [kids.length, foods, targetKids, foodById]);

  const aiDisabled = !online || aiState === "loading";
  const offlineHint = !online
    ? t("recipes.actions.offline", { defaultValue: "You're offline. AI suggestions need a connection." })
    : undefined;

  const renderCard = (recipe: Recipe) => (
    <EnhancedRecipeCard
      key={recipe.id}
      recipe={recipe}
      fit={fitByRecipeId.get(recipe.id)}
      missingCount={missingByRecipeId.get(recipe.id)?.length ?? 0}
      onView={handleView}
      onPlan={handlePlan}
      onAddMissing={handleAddMissingToGrocery}
      onEdit={handleEdit}
      onDelete={requestDelete}
      onAddToCollections={handleAddToCollections}
      onOrderIngredients={handleOrderIngredients}
    />
  );

  const renderRow = (recipe: Recipe) => (
    <RecipeListItem
      recipe={recipe}
      fit={fitByRecipeId.get(recipe.id)}
      missingCount={missingByRecipeId.get(recipe.id)?.length ?? 0}
      onView={handleView}
      onPlan={handlePlan}
      onAddMissing={handleAddMissingToGrocery}
    />
  );

  const showChipRow = kids.length >= 1 || collectionList.length > 0;

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <Helmet>
        <title>{t("recipes.metaTitle", { defaultValue: "Recipes - EatPal" })}</title>
        <meta
          name="description"
          content={t("recipes.metaDescription", {
            defaultValue: "Manage family recipes, meal templates, and discover new meal ideas",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto px-4 py-4 md:py-8 max-w-6xl">
        {/* Page header */}
        <div ref={headerRef}>
          <div className="flex items-center justify-between gap-3 mb-3 md:mb-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-bold md:mb-2">{t('recipes.title')}</h1>
              <p className="hidden md:block text-muted-foreground">{subtitle}</p>
            </div>

            {/* Phone: one Add menu instead of four buttons wrapping onto two rows. */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="min-h-11">
                    <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                    {t("recipes.actions.add", { defaultValue: "Add recipe" })}
                    <ChevronDown className="h-4 w-4 ml-1" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("recipes.actions.create", { defaultValue: "Create" })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setImportDialogOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("recipes.actions.importLinkOrPhoto", { defaultValue: "Import from a link or photo" })}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={aiDisabled} onSelect={() => void handleAISuggestions()}>
                    <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                    {online
                      ? t("recipes.actions.aiSuggest", { defaultValue: "AI Suggest" })
                      : t("recipes.actions.aiOffline", { defaultValue: "AI Suggest (offline)" })}
                  </DropdownMenuItem>
                  {userId && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={handleOpenCreateCollection}>
                        <FolderPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("recipes.actions.newCollection", { defaultValue: "New collection" })}
                      </DropdownMenuItem>
                      {collectionList.length > 0 && (
                        <DropdownMenuItem onSelect={() => setShowManageCollectionsDialog(true)}>
                          <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          {t("recipes.actions.manageCollections", { defaultValue: "Manage collections" })}
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="hidden md:flex gap-2 flex-wrap justify-end">
              <Button onClick={handleCreate} size="lg">
                <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
                {t("recipes.actions.create", { defaultValue: "Create" })}
              </Button>
              <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="lg" type="button">
                <Upload className="h-5 w-5 mr-2" aria-hidden="true" />
                {t("recipes.actions.import", { defaultValue: "Import" })}
              </Button>
              <Button
                onClick={() => void handleAISuggestions()}
                variant="secondary"
                size="lg"
                disabled={aiDisabled}
                title={offlineHint}
              >
                <Sparkles className="h-5 w-5 mr-2" aria-hidden="true" />
                {t("recipes.actions.aiSuggest", { defaultValue: "AI Suggest" })}
              </Button>
            </div>
          </div>

          {smartCollections.length > 0 && (
            <SmartCollectionChips
              collections={smartCollections}
              selectedId={selectedSmart ? selectedSmart.id : null}
              onSelect={setSelectedCollectionId}
              className="mb-3"
            />
          )}

          {userId && (
            <div className="hidden md:block mb-4">
              <RecipeCollectionsSelector
                collections={collectionList}
                counts={countsByCollection}
                totalRecipeCount={liveRecipes.length}
                selectedId={isSmartCollectionId(selectedCollectionId) ? null : selectedCollectionId}
                onSelect={setSelectedCollectionId}
                onCreate={handleOpenCreateCollection}
                onManage={() => setShowManageCollectionsDialog(true)}
                disabled={collectionsError != null}
                disabledReason={
                  collectionsError
                    ? t("recipes.states.collectionsUnavailable", { defaultValue: "Collections couldn't load" })
                    : undefined
                }
              />
            </div>
          )}

          {showChipRow && (
            <div className="-mx-4 mb-3 flex snap-x items-center gap-2 overflow-x-auto px-4 pb-1">
              {kids.length >= 1 && (
                <div
                  role="radiogroup"
                  aria-label={t("recipes.kids.label", { defaultValue: "Show fit for" })}
                  className="flex shrink-0 gap-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={worksFor === "all"}
                    className={chipClass(worksFor === "all")}
                    onClick={() => handleWorksFor("all")}
                  >
                    {worksFor === "all" && <Check className="h-4 w-4" aria-hidden="true" />}
                    {t("recipes.kids.everyone", { defaultValue: "Everyone" })}
                  </button>
                  {kids.map((kid) => (
                    <button
                      key={kid.id}
                      type="button"
                      role="radio"
                      aria-checked={worksFor === kid.id}
                      className={chipClass(worksFor === kid.id)}
                      onClick={() => handleWorksFor(kid.id)}
                    >
                      {worksFor === kid.id && <Check className="h-4 w-4" aria-hidden="true" />}
                      {kid.name}
                    </button>
                  ))}
                </div>
              )}

              {collectionList.length > 0 && (
                <div
                  role="radiogroup"
                  aria-label={t("recipes.states.collectionsLabel", { defaultValue: "Collection" })}
                  className="flex shrink-0 gap-2 md:hidden"
                >
                  {kids.length >= 1 && <span className="w-px shrink-0 self-stretch bg-border" aria-hidden="true" />}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedCollectionId === null}
                    className={chipClass(selectedCollectionId === null)}
                    onClick={() => setSelectedCollectionId(null)}
                  >
                    {t("recipes.states.allRecipes", { defaultValue: "All recipes" })}
                  </button>
                  {collectionList.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedCollectionId === c.id}
                      className={chipClass(selectedCollectionId === c.id)}
                      onClick={() => setSelectedCollectionId(c.id)}
                    >
                      <Folder className="h-4 w-4" aria-hidden="true" />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {/* US-295: Multi-kid affordance. Only useful with 2+ kids. */}
              {kids.length >= 2 && (
                <Link
                  to="/dashboard/sibling-meal-finder"
                  className={cn(chipClass(false), "text-primary")}
                  onClick={() =>
                    analytics.trackEvent("family_finder_opened", {
                      source: "recipes_header",
                      kid_count: kids.length,
                    })
                  }
                >
                  <Users2 className="h-4 w-4" aria-hidden="true" />
                  {t("recipes.actions.findForEveryone", { defaultValue: "Find a meal everyone will eat" })}
                </Link>
              )}
            </div>
          )}
        </div>

        {isInitialLoading ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6"
            aria-busy="true"
            aria-label={t("recipes.states.loading", { defaultValue: "Loading recipes" })}
          >
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader>
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : liveRecipes.length === 0 ? (
          /* Empty state: start from what the kids already eat. */
          <section className="mx-auto max-w-2xl py-4 md:py-8" aria-labelledby="recipes-empty-title">
            <Card>
              <CardContent className="space-y-4 p-5 md:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <ChefHat className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="recipes-empty-title" className="text-xl font-semibold">
                      {emptyKidName
                        ? t("recipes.empty.title", {
                            defaultValue: "Start with meals {{name}} already eats",
                            name: emptyKidName,
                          })
                        : t("recipes.empty.titleFamily", {
                            defaultValue: "Start with meals your family already eats",
                          })}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("recipes.empty.body", {
                        defaultValue:
                          "A recipe built from foods your kids already accept is the easiest win. Add one and plan it in two taps.",
                      })}
                    </p>
                  </div>
                </div>

                {kids.length === 0 ? (
                  <p className="text-sm">
                    <Link to="/dashboard/kids" className="font-medium text-primary underline-offset-4 hover:underline">
                      {t("recipes.empty.addKid", { defaultValue: "Add your kids first" })}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {t("recipes.empty.addKidHint", {
                        defaultValue: "so every recipe shows who will eat it and what's safe for them.",
                      })}
                    </span>
                  </p>
                ) : alreadyEats.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-sm font-medium">
                      {t("recipes.empty.eatsHeading", { defaultValue: "Foods they already eat" })}
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                      {alreadyEats.map((food) => (
                        <li key={food.id}>
                          <Badge variant="outline" className="border-safe-food text-foreground">
                            {food.name}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm">
                    <Link to="/dashboard/pantry" className="font-medium text-primary underline-offset-4 hover:underline">
                      {t("recipes.empty.addFoods", { defaultValue: "Mark a few safe foods in the pantry" })}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {t("recipes.empty.addFoodsHint", { defaultValue: "and they'll show up here as a starting point." })}
                    </span>
                  </p>
                )}

                <Button onClick={handleCreate} className="w-full sm:w-auto min-h-11">
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("recipes.empty.makeFromThese", { defaultValue: "Make a recipe from these" })}
                </Button>
              </CardContent>
            </Card>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setImportDialogOpen(true)}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {t("recipes.empty.import", { defaultValue: "Import from a link or photo" })}
              </button>
              <button
                type="button"
                onClick={() => void handleAISuggestions()}
                disabled={aiDisabled}
                title={offlineHint}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {t("recipes.empty.aiSuggest", { defaultValue: "Suggest recipes from my pantry" })}
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Toolbar: search, sort, view toggle, quick filters */}
            <div className="sticky top-14 z-30 -mx-4 mb-3 bg-background px-4 pt-1 md:static md:z-auto md:mx-0 md:px-0">
              <RecipeToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                sortBy={sortBy}
                onSortChange={setSortBy}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                quickFilters={quickFilters}
                onToggleQuickFilter={toggleQuickFilter}
                onClearFilters={clearFilters}
                resultCount={resultCount}
                totalCount={totalCount}
                hasActiveFilters={hasActiveFilters}
                allergenUnknown={allergenUnknown}
                hasKids={kids.length > 0}
              />
            </div>

            {selectedSmart && filteredRecipes.length === 0 && !hasActiveFilters ? (
              <Card className="p-8 md:p-12 text-center">
                <div className="max-w-md mx-auto">
                  <h2 className="text-xl font-semibold mb-2">
                    {t("recipes.smart.emptyTitle", { defaultValue: "Nothing here yet" })}
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    {selectedSmart.kind === "unfiled"
                      ? t("recipes.smart.emptyUnfiled", { defaultValue: "Every recipe is in a collection." })
                      : selectedSmart.kind === "quick"
                        ? t("recipes.smart.emptyQuick", {
                            defaultValue: "No recipe takes 30 minutes or less. Add prep and cook times to see them here.",
                          })
                        : t("recipes.smart.emptyFit", {
                            defaultValue: "Mark the foods your kids eat as safe in the pantry and matching recipes show up here.",
                          })}
                  </p>
                  <Button onClick={() => setSelectedCollectionId(null)} variant="outline">
                    {t("recipes.states.viewAll", { defaultValue: "View all recipes" })}
                  </Button>
                </div>
              </Card>
            ) : selectedCollectionId && filteredRecipes.length === 0 && !hasActiveFilters ? (
              <Card className="p-8 md:p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Folder className="h-8 w-8 text-primary" aria-hidden="true" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    {t("recipes.states.emptyCollectionTitle", { defaultValue: "No recipes in this collection" })}
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    {t("recipes.states.emptyCollectionBody", {
                      defaultValue: "Open a recipe and choose Add to collection to see it here.",
                    })}
                  </p>
                  <Button onClick={() => setSelectedCollectionId(null)} variant="outline">
                    {t("recipes.states.viewAll", { defaultValue: "View all recipes" })}
                  </Button>
                </div>
              </Card>
            ) : filteredRecipes.length === 0 && hasActiveFilters ? (
              <Card className="p-8 md:p-12 text-center">
                <div className="max-w-md mx-auto">
                  <h2 className="text-xl font-semibold mb-2">
                    {t("recipes.states.noMatchTitle", { defaultValue: "No matching recipes" })}
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    {t("recipes.states.noMatchBody", { defaultValue: "Try adjusting your search or filters." })}
                  </p>
                  <Button onClick={clearFilters} variant="outline">
                    {t("recipes.states.clearFilters", { defaultValue: "Clear filters" })}
                  </Button>
                </div>
              </Card>
            ) : viewMode === 'grid' ? (
              useVirtualGrid ? (
                /* Virtualized grid: one absolutely positioned row of cards at a
                   time, measured rather than estimated. pb-6 stands in for the
                   gap-6 that a single grid container would have given between
                   rows -- padding is inside getBoundingClientRect, margin is
                   not, and the virtualizer positions from measured height. */
                <div ref={gridParentRef}>
                  <div
                    style={{
                      height: `${gridVirtualizer.getTotalSize()}px`,
                      position: "relative",
                    }}
                  >
                    {gridVirtualizer.getVirtualItems().map((virtualRow) => (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={gridVirtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${
                            virtualRow.start - gridVirtualizer.options.scrollMargin
                          }px)`,
                        }}
                        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 pb-4 md:pb-6"
                      >
                        {gridRows[virtualRow.index].map(renderCard)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                  {filteredRecipes.map(renderCard)}
                </div>
              )
            ) : useVirtualList ? (
              <div
                ref={listParentRef}
                role="list"
                className="border rounded-xl overflow-auto"
                style={{ maxHeight: "70vh" }}
              >
                <div style={{ height: `${listVirtualizer.getTotalSize()}px`, position: "relative" }}>
                  {listVirtualizer.getVirtualItems().map((virtualRow) => {
                    const recipe = filteredRecipes[virtualRow.index];
                    return (
                      <div
                        key={recipe.id}
                        data-index={virtualRow.index}
                        ref={listVirtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {renderRow(recipe)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div role="list" className="space-y-1">
                {filteredRecipes.map((recipe) => (
                  <Fragment key={recipe.id}>{renderRow(recipe)}</Fragment>
                ))}
              </div>
            )}
          </>
        )}

        {/* Recipe Detail View (Sheet) */}
        <RecipeDetailView
          recipe={viewingRecipe}
          open={detailOpen && viewingRecipe != null}
          onOpenChange={setDetailOpen}
          foods={foods}
          kids={kids}
          activeKidId={lensKid?.id ?? null}
          onUpdateRecipe={updateRecipe}
          onEdit={handleEditFromDetail}
          onRequestDelete={requestDelete}
          onAddToCollections={handleAddToCollections}
          onToggleFavorite={handleToggleFavorite}
        />

        {/* Enhanced Recipe Builder (Sheet). Its content mounts only while open. */}
        <Sheet open={builderOpen} onOpenChange={(open) => { if (!open) handleClose(); setBuilderOpen(open); }}>
          <SheetContent side="right" className="w-full sm:max-w-[600px] md:max-w-[700px]">
            <SheetHeader>
              <SheetTitle>
                {editRecipe
                  ? t("recipes.builder.editTitle", { defaultValue: "Edit recipe" })
                  : importDraft
                    ? t("recipes.importReview.title", { defaultValue: "Check the imported recipe" })
                    : t("recipes.builder.createTitle", { defaultValue: "Create recipe" })}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              {builderOpen && !editRecipe && importDraft && (
                <>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {t("recipes.importReview.hint", {
                      defaultValue: "Nothing is saved yet. Fix anything we read wrong, then save.",
                    })}
                  </p>
                  {importDuplicate && (
                    <ImportDuplicateNotice
                      duplicate={importDuplicate}
                      onOpenExisting={handleOpenDuplicate}
                      onSaveAsNew={() => setImportDupDismissed(true)}
                    />
                  )}
                </>
              )}
              {builderOpen && (
                <Suspense
                  fallback={
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 motion-safe:animate-spin text-muted-foreground" aria-hidden="true" />
                    </div>
                  }
                >
                  <EnhancedRecipeBuilder
                    key={editRecipe?.id ?? (importDraft ? `import-${importKey}` : "new")}
                    foods={foods}
                    kids={kids}
                    activeKidId={lensKid?.id ?? activeKidId}
                    editRecipe={editRecipe}
                    initialDraft={editRecipe ? null : importDraft}
                    onSave={handleSave}
                    onCancel={handleClose}
                  />
                </Suspense>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Smart Grocery Dialog */}
        <SmartGroceryDialog
          recipe={groceryRecipe}
          open={groceryDialogOpen}
          onOpenChange={setGroceryDialogOpen}
          foods={foods}
          onAddGroceryItems={handleGroceryItemsAdd}
        />

        {/* Import Dialog (lazy, mounted only while open) */}
        {importDialogOpen && (
          <Suspense fallback={null}>
            <ImportRecipeDialog
              open={importDialogOpen}
              onOpenChange={setImportDialogOpen}
              onImport={handleImport}
              foods={foods}
            />
          </Suspense>
        )}

        {/* AI Suggestions Dialog */}
        <Dialog open={aiSuggestionsOpen} onOpenChange={setAiSuggestionsOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                {t("recipes.ai.title", { defaultValue: "Recipe ideas from your pantry" })}
              </DialogTitle>
              <DialogDescription>
                {lensKid
                  ? t("recipes.ai.descriptionKid", {
                      defaultValue: "Built from foods you have, avoiding {{name}}'s allergens and dislikes.",
                      name: lensKid.name,
                    })
                  : t("recipes.ai.description", {
                      defaultValue: "Built from foods you have, avoiding every kid's allergens and dislikes.",
                    })}
              </DialogDescription>
            </DialogHeader>
            {aiState === "loading" ? (
              <div className="flex flex-col items-center justify-center py-12" role="status">
                <Loader2 className="h-10 w-10 motion-safe:animate-spin text-primary mb-4" aria-hidden="true" />
                <p className="text-muted-foreground">
                  {t("recipes.ai.loading", { defaultValue: "Looking through your pantry..." })}
                </p>
              </div>
            ) : aiState === "no-pantry" ? (
              <div className="py-10 text-center">
                <h3 className="font-semibold">
                  {t("recipes.ai.noPantryTitle", { defaultValue: "Nothing in the pantry to cook with yet" })}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {t("recipes.ai.noPantryBody", {
                    defaultValue: "Mark the foods your kids eat as safe (and in stock) and suggestions will use them.",
                  })}
                </p>
                <Button asChild className="mt-4">
                  <Link to="/dashboard/pantry">
                    {t("recipes.ai.openPantry", { defaultValue: "Open the pantry" })}
                  </Link>
                </Button>
              </div>
            ) : suggestions.length > 0 ? (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  {hiddenForAllergens > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("recipes.ai.hiddenForAllergens", {
                        count: hiddenForAllergens,
                        defaultValue_one: "1 idea was hidden because it has an allergen for your kids.",
                        defaultValue: "{{count}} ideas were hidden because they have an allergen for your kids.",
                      })}
                    </p>
                  )}
                  {suggestions.map((suggestion, index) => {
                    const key = `${index}-${suggestion.name}`;
                    const added = addedSuggestions.has(key);
                    const difficulty = toDifficulty(suggestion.difficulty);
                    return (
                      <Card key={key}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h3 className="font-semibold text-lg">{suggestion.name}</h3>
                                {difficulty && (
                                  <Badge variant="outline">
                                    {t(`recipes.difficulty.${difficulty}`, { defaultValue: difficulty })}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mb-3">{suggestion.description}</p>
                              <ul className="flex flex-wrap gap-2 mb-3">
                                {(suggestion.food_names ?? []).map((foodName) => (
                                  <li key={foodName}>
                                    <Badge variant="secondary">{foodName}</Badge>
                                  </li>
                                ))}
                              </ul>
                              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                                {suggestion.prepTime && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-4 w-4" aria-hidden="true" />
                                    {t("recipes.ai.prep", { defaultValue: "Prep: {{time}}", time: suggestion.prepTime })}
                                  </span>
                                )}
                                {suggestion.cookTime && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-4 w-4" aria-hidden="true" />
                                    {t("recipes.ai.cook", { defaultValue: "Cook: {{time}}", time: suggestion.cookTime })}
                                  </span>
                                )}
                              </div>
                              {suggestion.reason && (
                                <div className="bg-primary/5 p-3 rounded-lg">
                                  <div className="flex items-start gap-2">
                                    <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                                    <p className="text-sm">
                                      <span className="font-medium">
                                        {t("recipes.ai.why", { defaultValue: "Why this works:" })}
                                      </span>{" "}
                                      {suggestion.reason}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant={added ? "outline" : "default"}
                              disabled={added}
                              onClick={() => void handleAddSuggestion(suggestion, key)}
                            >
                              {added ? (
                                <Check className="h-4 w-4 mr-1" aria-hidden="true" />
                              ) : (
                                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                              )}
                              {added
                                ? t("recipes.ai.addedButton", { defaultValue: "Added" })
                                : t("recipes.ai.add", { defaultValue: "Add" })}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>{t("recipes.ai.none", { defaultValue: "No suggestions this time." })}</p>
                {hiddenForAllergens > 0 && (
                  <p className="text-sm mt-2">
                    {t("recipes.ai.hiddenForAllergens", {
                      count: hiddenForAllergens,
                      defaultValue_one: "1 idea was hidden because it has an allergen for your kids.",
                      defaultValue: "{{count}} ideas were hidden because they have an allergen for your kids.",
                    })}
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Collection Dialogs */}
        {userId && (
          <>
            <CreateCollectionDialog
              open={showCreateCollectionDialog}
              onOpenChange={(open) => { setShowCreateCollectionDialog(open); if (!open) setEditingCollection(null); }}
              editCollection={editingCollection}
              onCreate={createCollection}
              onUpdate={updateCollection}
              onCollectionCreated={handleCollectionCreated}
              onCollectionUpdated={() => setEditingCollection(null)}
            />
            <ManageCollectionsDialog
              open={showManageCollectionsDialog}
              onOpenChange={setShowManageCollectionsDialog}
              collections={collectionList}
              counts={countsByCollection}
              onDelete={removeCollection}
              onEdit={handleEditCollection}
            />
          </>
        )}
        {recipeForCollections && (
          <AddToCollectionsDialog
            open={showAddToCollectionsDialog}
            onOpenChange={(open) => { setShowAddToCollectionsDialog(open); if (!open) setRecipeForCollections(null); }}
            recipeId={recipeForCollections.id}
            recipeName={recipeForCollections.name}
            collections={collectionList}
            currentCollectionIds={collectionIdsByRecipe[recipeForCollections.id] ?? []}
            onSave={setMembership}
            onCreate={createCollection}
          />
        )}
        {recipeForOrder && (
          <OrderIngredientsDialog
            recipe={recipeForOrder}
            foods={foods}
            open={showOrderDialog}
            onOpenChange={(open) => { setShowOrderDialog(open); if (!open) setRecipeForOrder(null); }}
          />
        )}
      </div>
    </div>
  );
}

