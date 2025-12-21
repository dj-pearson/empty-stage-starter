import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { FoodCard } from "@/components/FoodCard";
import { AddFoodDialog } from "@/components/AddFoodDialog";
import { ImportCsvDialog } from "@/components/ImportCsvDialog";
import { BarcodeScannerDialog } from "@/components/admin/BarcodeScannerDialog";
import { ImageFoodCapture } from "@/components/ImageFoodCapture";
import { BulkAddFoodDialog } from "@/components/BulkAddFoodDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { Food, FoodCategory } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useToast } from "@/hooks/use-toast";
import { starterFoods } from "@/lib/starterFoods";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { haptic } from "@/lib/haptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { logger } from "@/lib/logger";
import { useDebounce } from "@/hooks/use-debounce";

interface FoodSuggestion {
  name: string;
  category: FoodCategory;
  reason: string;
}

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFood, setEditFood] = useState<Food | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Ref for search input
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query to improve performance
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

  // Pull-to-refresh functionality (mobile only)
  const { pullToRefreshRef, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      haptic.light();
      // Fetch fresh data from server
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

  const filteredFoods = foods.filter((food) => {
    if (!food || !food.name) return false;
    const matchesSearch = food.name
      .toLowerCase()
      .includes(debouncedSearchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || food.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleGetSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setShowSuggestions(true);

    try {
      // Get active child's profile for personalized suggestions
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

  const handleEdit = (food: Food) => {
    setEditFood(food);
    setDialogOpen(true);
  };

  const handleQuantityChange = (foodId: string, newQuantity: number) => {
    const food = foods.find((f) => f.id === foodId);
    if (food) {
      updateFood(foodId, {
        ...food,
        quantity: newQuantity,
      });
    }
  };

  const handleSave = (foodData: Omit<Food, "id">) => {
    if (editFood) {
      updateFood(editFood.id, foodData);
    } else {
      addFood(foodData);
    }
    setEditFood(null);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditFood(null);
    }
  };

  const handleLoadStarterList = () => {
    let addedCount = 0;
    starterFoods.forEach((starterFood) => {
      // Check if food already exists
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
    logger.debug(
      "Quantity:",
      foodData.quantity,
      "ServingSize:",
      foodData.servingSize
    );

    // Check for existing food with same name, category, and serving size
    const existingFood = foods.find(
      (f) =>
        f.name.toLowerCase() === foodData.name.toLowerCase() &&
        f.category === foodData.category &&
        (f.package_quantity || "") === (foodData.servingSize || "")
    );

    if (existingFood) {
      // Update existing food's quantity
      const newQuantity =
        (existingFood.quantity || 0) + (foodData.quantity || 1);
      updateFood(existingFood.id, {
        ...existingFood,
        quantity: newQuantity,
      });

      toast({
        title: "Quantity Updated",
        description: `Added ${foodData.quantity || 1} to existing ${
          foodData.name
        }. Total: ${newQuantity}`,
      });
    } else {
      // Add new food
      const foodToAdd = {
        name: foodData.name,
        category: foodData.category,
        is_safe: foodData.is_safe ?? true, // Default to Safe Foods
        is_try_bite: false,
        quantity: foodData.quantity || 1,
        package_quantity: foodData.servingSize || undefined,
      };
      logger.debug("Adding food to pantry:", foodToAdd);
      addFood(foodToAdd);

      toast({
        title: "Food Added from Photo",
        description: `${foodData.name} has been added to your pantry!`,
      });
    }
  };

  const handleBulkAdd = async (foods: Omit<Food, "id">[]) => {
    if (!addFoods) {
      toast({
        title: "Error",
        description: "Bulk add feature is not available",
        variant: "destructive",
      });
      return;
    }

    try {
      await addFoods(foods);
      toast({
        title: "Foods Added",
        description: `${foods.length} food${foods.length !== 1 ? "s" : ""} added to your pantry!`,
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

  return (
    <div
      ref={pullToRefreshRef}
      className="min-h-screen pb-20 md:pt-20 bg-background overflow-y-auto"
    >
      {/* Pull to Refresh Indicator */}
      {isMobile && (
        <PullToRefreshIndicator
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
        />
      )}

      <div
        className="container mx-auto px-4 py-8 max-w-6xl"
        style={{
          transform: isMobile && !isRefreshing ? `translateY(${pullDistance}px)` : 'none',
          transition: pullDistance === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Food Pantry</h1>
              <p className="text-muted-foreground">
                Manage your child's safe foods and try bites
              </p>
            </div>

            {/* Mobile Actions - Consolidated */}
            <div className="flex gap-2 md:hidden">
              <Button
                onClick={() => {
                  haptic.light();
                  setDialogOpen(true);
                }}
                size="lg"
                className="flex-1 touch-target"
              >
                <Plus className="h-5 w-5 mr-2" />
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

            {/* Desktop Actions - Full Layout */}
            <div className="hidden md:flex flex-col gap-3">
              <div className="flex gap-3">
                <Button onClick={() => setDialogOpen(true)} size="lg">
                  <Plus className="h-5 w-5 mr-2" />
                  Add Food
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setImageCaptureOpen(true)}
                  size="lg"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Photo ID
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setScannerOpen(true)}
                  size="lg"
                >
                  <ScanBarcode className="h-5 w-5 mr-2" />
                  Barcode
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setBulkAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Bulk Add Foods
                </Button>
                <Button variant="outline" onClick={handleLoadStarterList}>
                  <Download className="h-4 w-4 mr-2" />
                  Load Starter List
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGetSuggestions}
                  disabled={isLoadingSuggestions}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isLoadingSuggestions ? "Getting Ideas..." : "AI Suggestions"}
                </Button>
                <ImportCsvDialog />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                placeholder="Search foods... (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="protein">Protein</SelectItem>
                <SelectItem value="carb">Carb</SelectItem>
                <SelectItem value="dairy">Dairy</SelectItem>
                <SelectItem value="fruit">Fruit</SelectItem>
                <SelectItem value="vegetable">Vegetable</SelectItem>
                <SelectItem value="snack">Snack</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card rounded-lg p-4 border active:scale-[0.98] transition-transform">
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Foods</p>
              <p className="text-xl sm:text-2xl font-bold">{foods.length}</p>
            </div>
            <div className="bg-card rounded-lg p-4 border active:scale-[0.98] transition-transform">
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Safe Foods</p>
              <p className="text-xl sm:text-2xl font-bold text-safe-food">
                {foods.filter((f) => f.is_safe).length}
              </p>
            </div>
            <div className="bg-card rounded-lg p-4 border active:scale-[0.98] transition-transform">
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Try Bites</p>
              <p className="text-xl sm:text-2xl font-bold text-try-bite">
                {foods.filter((f) => f.is_try_bite).length}
              </p>
            </div>
            <div className="bg-card rounded-lg p-4 border active:scale-[0.98] transition-transform">
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Filtered</p>
              <p className="text-xl sm:text-2xl font-bold">{filteredFoods.length}</p>
            </div>
          </div>

          {/* Food Grid */}
          {isInitialLoading ? (
            /* Loading Skeletons */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-card rounded-lg border p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 w-9" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredFoods.length === 0 ? (
            <div className="text-center py-12">
              {searchQuery || categoryFilter !== "all" ? (
                // Filtered empty state
                <>
                  <p className="text-muted-foreground mb-4 px-4">
                    No foods match your filters
                  </p>
                  <Button onClick={() => {
                    setSearchQuery("");
                    setCategoryFilter("all");
                  }}>
                    Clear Filters
                  </Button>
                </>
              ) : (
                // True empty state with helpful guidance
                <div className="max-w-3xl mx-auto px-4">
                  <div className="mb-8">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Utensils className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Build Your Food Pantry</h3>
                    <p className="text-muted-foreground mb-6">
                      Start by adding foods your child already loves (safe foods) and new foods to try.
                      This helps us create personalized meal plans!
                    </p>
                  </div>

                  {/* 3 Quick Action Cards */}
                  <div className="grid md:grid-cols-3 gap-4 mb-8">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => handleLoadStarterList()}>
                      <CardContent className="pt-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                          <Download className="h-6 w-6 text-primary" />
                        </div>
                        <h4 className="font-semibold mb-2">Quick Start</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Load 50+ common kid-friendly foods
                        </p>
                        <Badge variant="secondary">Recommended</Badge>
                      </CardContent>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setDialogOpen(true)}>
                      <CardContent className="pt-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-safe-food/10 flex items-center justify-center mx-auto mb-3">
                          <Plus className="h-6 w-6 text-safe-food" />
                        </div>
                        <h4 className="font-semibold mb-2">Add Manually</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Type in specific foods one at a time
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleGetSuggestions}>
                      <CardContent className="pt-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
                          <Sparkles className="h-6 w-6 text-accent" />
                        </div>
                        <h4 className="font-semibold mb-2">AI Suggestions</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Get personalized food recommendations
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Helpful Tips */}
                  <div className="bg-muted/50 rounded-lg p-6">
                    <h4 className="font-semibold mb-3">💡 Quick Tips</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground text-left">
                      <li className="flex gap-2">
                        <span>•</span>
                        <span><strong>Safe Foods:</strong> Foods your child already eats and enjoys</span>
                      </li>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span><strong>Try Bites:</strong> New foods you want to introduce gradually</span>
                      </li>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span><strong>Categories:</strong> Help organize foods (protein, carb, fruit, etc.)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFoods.map((food) => {
                // Collect allergens from all kids in the family
                const allKidAllergens = kids.reduce<string[]>((acc, kid) => {
                  if (kid.allergens) {
                    return [...acc, ...kid.allergens];
                  }
                  return acc;
                }, []);
                // Remove duplicates
                const uniqueAllergens = [...new Set(allKidAllergens)];

                return (
                  <FoodCard
                    key={food.id}
                    food={food}
                    onEdit={handleEdit}
                    onDelete={deleteFood}
                    onQuantityChange={handleQuantityChange}
                    kidAllergens={uniqueAllergens}
                  />
                );
              })}
            </div>
          )}
        </div>

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
                These foods are suggested based on your child's current
                preferences and eating history.
              </DialogDescription>
            </DialogHeader>

            {isLoadingSuggestions ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                <p className="text-muted-foreground">
                  Analyzing eating patterns...
                </p>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-4">
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
          onFoodAdded={() => {
            // Just refresh - the food is already saved to database
            setScannerOpen(false);
          }}
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
