import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { FoodCard } from "@/components/FoodCard";
import { AddFoodDialog } from "@/components/AddFoodDialog";
import { ImportCsvDialog } from "@/components/ImportCsvDialog";
import { BarcodeScannerDialog } from "@/components/admin/BarcodeScannerDialog";
import { ImageFoodCapture } from "@/components/ImageFoodCapture";
import { BulkAddFoodDialog } from "@/components/BulkAddFoodDialog";
import { PantryStatsBar } from "@/components/pantry/PantryStatsBar";
import { PantryCategorySection } from "@/components/pantry/PantryCategorySection";
import { PantryListItem } from "@/components/pantry/PantryListItem";
import {
  CATEGORY_CONFIG,
  CATEGORY_ORDER,
  getStockStatus,
  type SortOption,
  type ViewMode,
} from "@/components/pantry/pantryConstants";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Sparkles,
  Download,
  ScanBarcode,
  Camera,
  MoreVertical,
  Upload,
  Utensils,
  LayoutGrid,
  List,
  ArrowUpDown,
  X,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Food, FoodCategory } from "@/types";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { useToast } from "@/hooks/use-toast";
import { starterFoods } from "@/lib/starterFoods";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { haptic } from "@/lib/haptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { logger } from "@/lib/logger";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface FoodSuggestion {
  name: string;
  category: FoodCategory;
  reason: string;
}

type StockFilter = "all" | "low-stock" | "out-of-stock";

export default function Pantry() {
  const {
    foods,
    addFood,
    addFoods,
    updateFood,
    deleteFood,
    planEntries,
    kids,
    activeKidId,
    refreshFoods,
  } = useApp();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFood, setEditFood] = useState<Food | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // View states
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "n",
        ctrlKey: true,
        metaKey: true,
        description: "New food",
        action: () => {
          setDialogOpen(true);
          haptic.light();
        },
      },
      {
        key: "f",
        ctrlKey: true,
        metaKey: true,
        description: "Focus search",
        action: () => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        },
      },
      {
        key: "Escape",
        description: "Close dialogs",
        action: () => {
          if (dialogOpen) setDialogOpen(false);
          if (scannerOpen) setScannerOpen(false);
          if (imageCaptureOpen) setImageCaptureOpen(false);
          if (bulkAddOpen) setBulkAddOpen(false);
          if (showSuggestions) setShowSuggestions(false);
        },
      },
    ],
  });

  // Track initial data loading
  useEffect(() => {
    if (foods.length > 0 || kids.length > 0) {
      setIsInitialLoading(false);
    }
  }, [foods, kids]);

  // Pull-to-refresh
  const { pullToRefreshRef, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      haptic.light();
      if (refreshFoods) {
        await refreshFoods();
      }
      haptic.success();
      toast({
        title: "Refreshed",
        description: "Pantry updated with latest data",
      });
    },
    enabled: isMobile,
  });

  // === DERIVED DATA ===

  const uniqueKidAllergens = useMemo(() => {
    const all = kids.reduce<string[]>((acc, kid) => {
      if (kid.allergens) return [...acc, ...kid.allergens];
      return acc;
    }, []);
    return [...new Set(all)];
  }, [kids]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: foods.length };
    for (const cat of CATEGORY_ORDER) {
      counts[cat] = foods.filter((f) => f.category === cat).length;
    }
    return counts;
  }, [foods]);

  // Stock stats
  const stockStats = useMemo(() => {
    let lowStock = 0;
    let outOfStock = 0;
    let safeCount = 0;
    let tryBiteCount = 0;
    for (const f of foods) {
      const status = getStockStatus(f.quantity);
      if (status === "low") lowStock++;
      if (status === "out") outOfStock++;
      if (f.is_safe) safeCount++;
      if (f.is_try_bite) tryBiteCount++;
    }
    return { lowStock, outOfStock, safeCount, tryBiteCount };
  }, [foods]);

  // Filtered and sorted foods
  const processedFoods = useMemo(() => {
    let result = foods.filter((food) => {
      if (!food || !food.name) return false;
      const matchesSearch = food.name
        .toLowerCase()
        .includes(debouncedSearchQuery.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || food.category === categoryFilter;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "low-stock" &&
          getStockStatus(food.quantity) === "low") ||
        (stockFilter === "out-of-stock" &&
          getStockStatus(food.quantity) === "out");
      return matchesSearch && matchesCategory && matchesStock;
    });

    // Sort
    switch (sortBy) {
      case "name":
        result = [...result].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "low-stock":
        result = [...result].sort(
          (a, b) => (a.quantity ?? 0) - (b.quantity ?? 0)
        );
        break;
      case "category":
        result = [...result].sort((a, b) => {
          const ai = CATEGORY_ORDER.indexOf(a.category);
          const bi = CATEGORY_ORDER.indexOf(b.category);
          return ai - bi || a.name.localeCompare(b.name);
        });
        break;
      case "recent":
        result = [...result].reverse();
        break;
    }
    return result;
  }, [foods, debouncedSearchQuery, categoryFilter, stockFilter, sortBy]);

  // Grouped by category (for "all" view without search)
  const groupedFoods = useMemo(() => {
    const groups: Record<string, Food[]> = {};
    for (const cat of CATEGORY_ORDER) {
      groups[cat] = [];
    }
    for (const food of processedFoods) {
      if (groups[food.category]) {
        groups[food.category].push(food);
      }
    }
    return groups;
  }, [processedFoods]);

  // Should show grouped view?
  const showGroupedView =
    categoryFilter === "all" &&
    stockFilter === "all" &&
    !debouncedSearchQuery &&
    sortBy !== "low-stock";

  // Active filter count
  const activeFilterCount =
    (categoryFilter !== "all" ? 1 : 0) +
    (stockFilter !== "all" ? 1 : 0) +
    (debouncedSearchQuery ? 1 : 0);

  // === HANDLERS ===

  const handleGetSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const activeKid = activeKidId
        ? kids.find((k) => k.id === activeKidId)
        : null;
      const { data, error } = await invokeEdgeFunction("suggest-foods", {
        body: {
          foods,
          planEntries,
          childProfile: activeKid || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.error.includes("Rate limits")) {
          toast({
            title: "Rate Limit Reached",
            description: "Please try again in a few moments.",
            variant: "destructive",
          });
        } else if (data.error.includes("Payment required")) {
          toast({
            title: "Credits Required",
            description:
              "Please add credits to your workspace to continue using AI features.",
            variant: "destructive",
          });
        } else {
          throw new Error(data.error);
        }
        setSuggestions([]);
      } else {
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      logger.error("Error getting suggestions:", error);
      toast({
        title: "Error",
        description: "Failed to get AI suggestions. Please try again.",
        variant: "destructive",
      });
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleAddSuggestion = (suggestion: FoodSuggestion) => {
    addFood({
      name: suggestion.name,
      category: suggestion.category,
      is_safe: false,
      is_try_bite: true,
    });
    toast({
      title: "Food Added",
      description: `${suggestion.name} has been added to your pantry as a try bite food.`,
    });
  };

  const handleEdit = useCallback((food: Food) => {
    setEditFood(food);
    setDialogOpen(true);
  }, []);

  const handleQuantityChange = useCallback(
    (foodId: string, newQuantity: number) => {
      const food = foods.find((f) => f.id === foodId);
      if (food) {
        updateFood(foodId, { ...food, quantity: newQuantity });
      }
    },
    [foods, updateFood]
  );

  const handleSave = useCallback(
    (foodData: Omit<Food, "id">) => {
      if (editFood) {
        updateFood(editFood.id, foodData);
      } else {
        addFood(foodData);
      }
      setEditFood(null);
    },
    [editFood, updateFood, addFood]
  );

  const handleDialogClose = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditFood(null);
  }, []);

  const handleLoadStarterList = () => {
    let addedCount = 0;
    starterFoods.forEach((starterFood) => {
      const exists = foods.some(
        (f) => f.name.toLowerCase() === starterFood.name.toLowerCase()
      );
      if (!exists) {
        addFood(starterFood);
        addedCount++;
      }
    });
    toast({
      title: "Starter List Loaded",
      description: `${addedCount} foods added to your pantry!`,
    });
  };

  const handleFoodIdentified = (foodData: any) => {
    logger.debug("handleFoodIdentified received:", foodData);
    const existingFood = foods.find(
      (f) =>
        f.name.toLowerCase() === foodData.name.toLowerCase() &&
        f.category === foodData.category &&
        (f.package_quantity || "") === (foodData.servingSize || "")
    );
    if (existingFood) {
      const newQuantity =
        (existingFood.quantity || 0) + (foodData.quantity || 1);
      updateFood(existingFood.id, { ...existingFood, quantity: newQuantity });
      toast({
        title: "Quantity Updated",
        description: `Added ${foodData.quantity || 1} to existing ${foodData.name}. Total: ${newQuantity}`,
      });
    } else {
      addFood({
        name: foodData.name,
        category: foodData.category,
        is_safe: foodData.is_safe ?? true,
        is_try_bite: false,
        quantity: foodData.quantity || 1,
        package_quantity: foodData.servingSize || undefined,
      });
      toast({
        title: "Food Added from Photo",
        description: `${foodData.name} has been added to your pantry!`,
      });
    }
  };

  const handleBulkAdd = async (newFoods: Omit<Food, "id">[]) => {
    if (!addFoods) {
      toast({
        title: "Error",
        description: "Bulk add feature is not available",
        variant: "destructive",
      });
      return;
    }
    try {
      await addFoods(newFoods);
      toast({
        title: "Foods Added",
        description: `${newFoods.length} food${newFoods.length !== 1 ? "s" : ""} added to your pantry!`,
      });
    } catch (error) {
      logger.error("Error bulk adding foods:", error);
      toast({
        title: "Error",
        description: "Failed to add foods. Please try again.",
        variant: "destructive",
      });
    }
  };

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
    setSortBy("name");
  }, []);

  // === RENDER ===

  return (
    <div
      ref={pullToRefreshRef}
      className="min-h-screen pb-20 md:pt-20 bg-background overflow-y-auto"
    >
      {/* Pull to Refresh */}
      {isMobile && (
        <PullToRefreshIndicator
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
        />
      )}

      <div
        className="container mx-auto px-4 py-6 max-w-7xl"
        style={{
          transform:
            isMobile && !isRefreshing
              ? `translateY(${pullDistance}px)`
              : "none",
          transition:
            pullDistance === 0 ? "transform 0.2s ease-out" : "none",
        }}
      >
        <div className="flex flex-col gap-5">
          {/* === HEADER === */}
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold font-heading">
                  My Pantry
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {foods.length > 0
                    ? `${foods.length} item${foods.length !== 1 ? "s" : ""} across ${CATEGORY_ORDER.filter((c) => categoryCounts[c] > 0).length} categories`
                    : "Track and manage your family's food inventory"}
                </p>
              </div>

              {/* Desktop action buttons */}
              <div className="hidden md:flex gap-2">
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Food
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <MoreVertical className="h-4 w-4" />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>Quick Add</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setBulkAddOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Bulk Add Foods
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setImageCaptureOpen(true)}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Photo Identify
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScannerOpen(true)}>
                      <ScanBarcode className="h-4 w-4 mr-2" />
                      Scan Barcode
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Import</DropdownMenuLabel>
                    <DropdownMenuItem onClick={handleLoadStarterList}>
                      <Download className="h-4 w-4 mr-2" />
                      Load Starter List
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleGetSuggestions}
                      disabled={isLoadingSuggestions}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {isLoadingSuggestions
                        ? "Getting Ideas..."
                        : "AI Suggestions"}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <div className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        <ImportCsvDialog />
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Mobile action buttons */}
            <div className="flex gap-2 md:hidden">
              <Button
                onClick={() => {
                  haptic.light();
                  setDialogOpen(true);
                }}
                size="lg"
                className="flex-1 touch-target gap-2"
              >
                <Plus className="h-5 w-5" />
                Add Food
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="lg"
                    className="touch-target min-w-[44px]"
                  >
                    <MoreVertical className="h-5 w-5" />
                    <span className="sr-only">More options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Quick Add</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setBulkAddOpen(true)}
                    className="min-h-[44px]"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Bulk Add Foods
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setImageCaptureOpen(true)}
                    className="min-h-[44px]"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Scan Photo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setScannerOpen(true)}
                    className="min-h-[44px]"
                  >
                    <ScanBarcode className="h-4 w-4 mr-2" />
                    Scan Barcode
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Import & AI</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={handleLoadStarterList}
                    className="min-h-[44px]"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Load Starter List
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleGetSuggestions}
                    disabled={isLoadingSuggestions}
                    className="min-h-[44px]"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isLoadingSuggestions
                      ? "Getting Ideas..."
                      : "AI Suggestions"}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="min-h-[44px]">
                    <div className="cursor-pointer">
                      <Upload className="h-4 w-4 mr-2" />
                      <ImportCsvDialog />
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* === SEARCH BAR === */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              placeholder="Search pantry items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 h-11"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* === CATEGORY TABS === */}
          <div
            ref={categoryScrollRef}
            className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide"
          >
            {/* All tab */}
            <button
              type="button"
              onClick={() => {
                setCategoryFilter("all");
                setStockFilter("all");
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                categoryFilter === "all" && stockFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card hover:bg-muted/80 border-border"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              All
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] h-[18px] px-1.5 tabular-nums",
                  categoryFilter === "all" &&
                    stockFilter === "all" &&
                    "bg-primary-foreground/20 text-primary-foreground"
                )}
              >
                {foods.length}
              </Badge>
            </button>

            {/* Category tabs */}
            {CATEGORY_ORDER.map((cat) => {
              const config = CATEGORY_CONFIG[cat];
              const Icon = config.icon;
              const count = categoryCounts[cat] || 0;
              const isActive = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(cat);
                    setStockFilter("all");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                    isActive
                      ? config.pillActive
                      : "bg-card hover:bg-muted/80 border-border",
                    count === 0 && "opacity-50"
                  )}
                  disabled={count === 0}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] h-[18px] px-1.5 tabular-nums",
                      isActive && "bg-current/10"
                    )}
                  >
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>

          {/* === SORT + VIEW CONTROLS === */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortOption)}
              >
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort by Name</SelectItem>
                  <SelectItem value="low-stock">Low Stock First</SelectItem>
                  <SelectItem value="category">By Category</SelectItem>
                  <SelectItem value="recent">Recently Added</SelectItem>
                </SelectContent>
              </Select>

              {/* Active filter count */}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                  Clear {activeFilterCount} filter
                  {activeFilterCount !== 1 ? "s" : ""}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "grid"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "list"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* === LOW STOCK ALERT BANNER === */}
          {(stockStats.outOfStock > 0 || stockStats.lowStock > 0) &&
            stockFilter === "all" &&
            !debouncedSearchQuery && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
              >
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    {stockStats.outOfStock > 0 && (
                      <span>
                        {stockStats.outOfStock} out of stock
                      </span>
                    )}
                    {stockStats.outOfStock > 0 && stockStats.lowStock > 0 && (
                      <span className="mx-1">and</span>
                    )}
                    {stockStats.lowStock > 0 && (
                      <span>
                        {stockStats.lowStock} running low
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                  onClick={() => {
                    setStockFilter("low-stock");
                    setCategoryFilter("all");
                    setSortBy("low-stock");
                  }}
                >
                  View
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </motion.div>
            )}

          {/* === STATS === */}
          {foods.length > 0 && (
            <PantryStatsBar
              totalCount={foods.length}
              lowStockCount={stockStats.lowStock}
              outOfStockCount={stockStats.outOfStock}
              safeCount={stockStats.safeCount}
              tryBiteCount={stockStats.tryBiteCount}
              onFilterLowStock={() => {
                setStockFilter("low-stock");
                setCategoryFilter("all");
                setSortBy("low-stock");
              }}
              onFilterOutOfStock={() => {
                setStockFilter("out-of-stock");
                setCategoryFilter("all");
                setSortBy("low-stock");
              }}
            />
          )}

          {/* === STOCK FILTER INDICATOR === */}
          {stockFilter !== "all" && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 text-sm py-1 px-3 border-amber-400 text-amber-700 dark:text-amber-400"
              >
                {stockFilter === "low-stock"
                  ? "Showing low stock items"
                  : "Showing out of stock items"}
                <button
                  type="button"
                  onClick={() => setStockFilter("all")}
                  className="ml-1 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
              <span className="text-sm text-muted-foreground">
                {processedFoods.length} item
                {processedFoods.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* === CONTENT === */}
          {isInitialLoading ? (
            <LoadingSkeleton />
          ) : processedFoods.length === 0 && foods.length === 0 ? (
            <EmptyPantryState
              onAddFood={() => setDialogOpen(true)}
              onLoadStarter={handleLoadStarterList}
              onGetSuggestions={handleGetSuggestions}
            />
          ) : processedFoods.length === 0 ? (
            <FilteredEmptyState onClear={clearAllFilters} />
          ) : showGroupedView ? (
            /* Grouped category view */
            <div className="flex flex-col gap-2">
              {CATEGORY_ORDER.map((cat) => {
                const items = groupedFoods[cat];
                if (!items || items.length === 0) return null;
                return (
                  <PantryCategorySection
                    key={cat}
                    category={cat}
                    items={items}
                    isOpen={!collapsedCategories.has(cat)}
                    onToggle={() => toggleCategory(cat)}
                    viewMode={viewMode}
                    onEdit={handleEdit}
                    onDelete={deleteFood}
                    onQuantityChange={handleQuantityChange}
                    kidAllergens={uniqueKidAllergens}
                  />
                );
              })}
            </div>
          ) : (
            /* Flat filtered/sorted view */
            <AnimatePresence mode="popLayout">
              {viewMode === "grid" ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                >
                  {processedFoods.map((food) => (
                    <motion.div
                      key={food.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                    >
                      <FoodCard
                        food={food}
                        onEdit={handleEdit}
                        onDelete={deleteFood}
                        onQuantityChange={handleQuantityChange}
                        kidAllergens={uniqueKidAllergens}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border rounded-xl overflow-hidden divide-y"
                >
                  {processedFoods.map((food) => (
                    <PantryListItem
                      key={food.id}
                      food={food}
                      onEdit={handleEdit}
                      onDelete={deleteFood}
                      onQuantityChange={handleQuantityChange}
                      kidAllergens={uniqueKidAllergens}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Result count when filtering */}
          {(debouncedSearchQuery || categoryFilter !== "all") &&
            processedFoods.length > 0 && (
              <p className="text-center text-sm text-muted-foreground pb-4">
                Showing {processedFoods.length} of {foods.length} items
              </p>
            )}
        </div>

        {/* === DIALOGS === */}
        <AddFoodDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          onSave={handleSave}
          editFood={editFood}
        />

        <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Food Suggestions
              </DialogTitle>
              <DialogDescription className="text-base">
                Personalized suggestions based on your child's preferences and
                eating history.
              </DialogDescription>
            </DialogHeader>

            {isLoadingSuggestions ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
                <p className="text-muted-foreground">
                  Analyzing eating patterns...
                </p>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3">
                {suggestions.map((suggestion, index) => (
                  <Card
                    key={index}
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1">
                            {suggestion.name}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            Category:{" "}
                            <span className="capitalize">
                              {suggestion.category}
                            </span>
                          </p>
                          <p className="text-sm">{suggestion.reason}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAddSuggestion(suggestion)}
                          className="shrink-0"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No suggestions available at the moment.</p>
                <p className="text-sm mt-2">
                  Try again or add more foods to your pantry first.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <BarcodeScannerDialog
          open={scannerOpen}
          onOpenChange={setScannerOpen}
          onFoodAdded={() => setScannerOpen(false)}
          targetTable="foods"
        />

        <ImageFoodCapture
          open={imageCaptureOpen}
          onOpenChange={setImageCaptureOpen}
          onFoodIdentified={handleFoodIdentified}
        />

        <BulkAddFoodDialog
          open={bulkAddOpen}
          onOpenChange={setBulkAddOpen}
          onSave={handleBulkAdd}
        />
      </div>
    </div>
  );
}

// === SUB-COMPONENTS ===

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-card rounded-lg border-l-4 border p-3.5 space-y-3">
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

function EmptyPantryState({
  onAddFood,
  onLoadStarter,
  onGetSuggestions,
}: {
  onAddFood: () => void;
  onLoadStarter: () => void;
  onGetSuggestions: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto"
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Utensils className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-2xl font-bold font-heading mb-2">
          Build Your Food Pantry
        </h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Start by adding foods your family already loves. This helps create
          personalized meal plans for all your kids!
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card
          className="hover:shadow-lg transition-all cursor-pointer hover:-translate-y-0.5 duration-200"
          onClick={onLoadStarter}
        >
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-1">Quick Start</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Load common kid-friendly foods
            </p>
            <Badge variant="secondary">Recommended</Badge>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-all cursor-pointer hover:-translate-y-0.5 duration-200"
          onClick={onAddFood}
        >
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-safe-food/10 flex items-center justify-center mx-auto mb-3">
              <Plus className="h-6 w-6 text-safe-food" />
            </div>
            <h4 className="font-semibold mb-1">Add Manually</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Type in specific foods one at a time
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-all cursor-pointer hover:-translate-y-0.5 duration-200"
          onClick={onGetSuggestions}
        >
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <h4 className="font-semibold mb-1">AI Suggestions</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Get personalized food recommendations
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-muted/50 rounded-xl p-5">
        <h4 className="font-semibold mb-3 text-sm">Tips for getting started</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-safe-food font-bold">1.</span>
            <span>
              <strong>Safe Foods:</strong> Foods your kids already eat and enjoy
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-try-bite font-bold">2.</span>
            <span>
              <strong>Try Bites:</strong> New foods you want to introduce
              gradually
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">3.</span>
            <span>
              <strong>Quantities:</strong> Track stock levels to know when to
              restock
            </span>
          </li>
        </ul>
      </div>
    </motion.div>
  );
}

function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center py-16"
    >
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
        <Search className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground mb-4">
        No items match your current filters
      </p>
      <Button variant="outline" onClick={onClear}>
        Clear Filters
      </Button>
    </motion.div>
  );
}
