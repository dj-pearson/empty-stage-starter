import { useState, useEffect, useMemo, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";
import {
  Plus,
  ChefHat,
  Clock,
  Lightbulb,
  Upload,
  Sparkles,
  Loader2,
  Folder,
  Globe,
} from "lucide-react";
import { ImportRecipeDialog } from "@/components/ImportRecipeDialog";
import { EnhancedRecipeCard } from "@/components/EnhancedRecipeCard";
import { RecipeCollectionsSelector } from "@/components/RecipeCollectionsSelector";
import { CreateCollectionDialog } from "@/components/CreateCollectionDialog";
import { ManageCollectionsDialog } from "@/components/ManageCollectionsDialog";
import { AddToCollectionsDialog } from "@/components/AddToCollectionsDialog";
import { OrderIngredientsDialog } from "@/components/OrderIngredientsDialog";
import { RecipeToolbar } from "@/components/recipes/RecipeToolbar";
import { RecipeListItem } from "@/components/recipes/RecipeListItem";
import { RecipeDetailView } from "@/components/recipes/RecipeDetailView";
import { EnhancedRecipeBuilder } from "@/components/recipes/EnhancedRecipeBuilder";
import { SmartGroceryDialog } from "@/components/recipes/SmartGroceryDialog";
import { useRecipeFilters } from "@/hooks/useRecipeFilters";
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
import { toast } from "sonner";
import { Recipe, RecipeCollection, MealSlot } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { ScrollArea } from "@/components/ui/scroll-area";
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

export default function Recipes() {
  const {
    recipes,
    foods,
    addRecipe,
    updateRecipe,
    deleteRecipe,
    kids,
    activeKidId,
    setActiveKid,
    addGroceryItem,
    groceryItems,
    addPlanEntries,
  } = useApp();

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Detail view state
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Smart grocery state
  const [groceryRecipe, setGroceryRecipe] = useState<Recipe | null>(null);
  const [groceryDialogOpen, setGroceryDialogOpen] = useState(false);

  // AI suggestions
  const [aiSuggestionsOpen, setAiSuggestionsOpen] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<RecipeSuggestion[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Collection states
  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [showCreateCollectionDialog, setShowCreateCollectionDialog] = useState(false);
  const [showManageCollectionsDialog, setShowManageCollectionsDialog] = useState(false);
  const [showAddToCollectionsDialog, setShowAddToCollectionsDialog] = useState(false);
  const [recipeForCollections, setRecipeForCollections] = useState<Recipe | null>(null);
  const [collections, setCollections] = useState<RecipeCollection[]>([]);
  const [collectionItems, setCollectionItems] = useState<Record<string, string[]>>({});
  const [editingCollection, setEditingCollection] = useState<RecipeCollection | null>(null);

  // Order ingredients states
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [recipeForOrder, setRecipeForOrder] = useState<Recipe | null>(null);

  // Filter by collection first, then apply search/sort/filter
  const collectionFilteredRecipes = useMemo(() => {
    return selectedCollectionId
      ? recipes.filter(recipe => collectionItems[selectedCollectionId]?.includes(recipe.id))
      : recipes;
  }, [selectedCollectionId, recipes, collectionItems]);

  // Search, sort, and filter
  const {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    quickFilters,
    toggleQuickFilter,
    clearFilters,
    filteredRecipes,
    resultCount,
    totalCount,
    hasActiveFilters,
  } = useRecipeFilters({ recipes: collectionFilteredRecipes, foods });

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: kidsData } = await supabase
          .from('kids')
          .select('household_id')
          .eq('user_id', user.id)
          .limit(1);
        if (kidsData && kidsData.length > 0 && kidsData[0].household_id) {
          setHouseholdId(kidsData[0].household_id);
        }
      }
    };
    fetchUserData();
  }, []);

  useEffect(() => {
    if (recipes.length > 0 || foods.length > 0) {
      setIsInitialLoading(false);
    }
  }, [recipes, foods]);

  const loadCollections = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('recipe_collections')
        .select('*')
        .or(`user_id.eq.${userId}${householdId ? `,household_id.eq.${householdId}` : ''}`)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      setCollections(data as unknown as RecipeCollection[] || []);
    } catch (error) {
      logger.error('Error loading collections:', error);
    }
  }, [userId, householdId]);

  const loadCollectionItems = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('recipe_collection_items')
        .select('collection_id, recipe_id');
      if (error) throw error;
      const itemsByCollection: Record<string, string[]> = {};
      data?.forEach((item: { collection_id: string; recipe_id: string }) => {
        if (!itemsByCollection[item.collection_id]) {
          itemsByCollection[item.collection_id] = [];
        }
        itemsByCollection[item.collection_id].push(item.recipe_id);
      });
      setCollectionItems(itemsByCollection);
    } catch (error) {
      logger.error('Error loading collection items:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadCollections();
    loadCollectionItems();
  }, [userId, householdId, loadCollections, loadCollectionItems]);

  // Keep viewingRecipe in sync with recipes state (e.g., after updateRecipe)
  useEffect(() => {
    if (viewingRecipe) {
      const updated = recipes.find((r) => r.id === viewingRecipe.id);
      if (updated) setViewingRecipe(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes]);

  // Handlers
  const handleView = useCallback((recipe: Recipe) => {
    setViewingRecipe(recipe);
    setDetailOpen(true);
  }, []);

  const handleEdit = useCallback((recipe: Recipe) => {
    setEditRecipe(recipe);
    setBuilderOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setBuilderOpen(false);
    setEditRecipe(null);
  }, []);

  const handleSave = useCallback(async (recipeData: Partial<Recipe>) => {
    try {
      if (editRecipe) {
        await updateRecipe(editRecipe.id, recipeData);
        toast.success("Recipe updated!");
      } else {
        await addRecipe(recipeData);
        toast.success("Recipe created!");
      }
      handleClose();
    } catch (error) {
      logger.error("Error saving recipe:", error);
      toast.error("Failed to save recipe");
    }
  }, [editRecipe, updateRecipe, addRecipe, handleClose]);

  const handleImport = useCallback(async (recipeData: Partial<Recipe>) => {
    try {
      await addRecipe(recipeData);
      toast.success("Recipe imported successfully!");
      setImportDialogOpen(false);
    } catch (error) {
      logger.error("Error importing recipe:", error);
      toast.error(`Failed to import recipe: ${(error as Error).message}`);
    }
  }, [addRecipe]);

  const handleDelete = useCallback((id: string) => {
    deleteRecipe(id);
    setDeleteId(null);
    toast.success("Recipe deleted");
  }, [deleteRecipe]);

  // Smart grocery handler
  const handleAddToGrocery = useCallback((recipe: Recipe) => {
    setGroceryRecipe(recipe);
    setGroceryDialogOpen(true);
  }, []);

  const handleGroceryItemsAdd = useCallback((items: { name: string; quantity: number; unit: string; category: string; aisle?: string }[]) => {
    items.forEach((item) => {
      addGroceryItem({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category as Recipe['category'],
        aisle: item.aisle,
      });
    });
  }, [addGroceryItem]);

  // Add to planner handler
  const handleAddToPlan = useCallback((entries: { kid_id: string; date: string; meal_slot: MealSlot; food_id: string; result: null }[]) => {
    addPlanEntries(entries);
  }, [addPlanEntries]);

  const handleAddToCollections = useCallback((recipe: Recipe) => {
    setRecipeForCollections(recipe);
    setShowAddToCollectionsDialog(true);
  }, []);

  const getRecipeCollectionIds = useCallback((recipeId: string): string[] => {
    const collectionIds: string[] = [];
    Object.entries(collectionItems).forEach(([collectionId, recipeIds]) => {
      if (recipeIds.includes(recipeId)) {
        collectionIds.push(collectionId);
      }
    });
    return collectionIds;
  }, [collectionItems]);

  const recipeCountsByCollection = useMemo(() => {
    return Object.entries(collectionItems).reduce((acc, [collectionId, recipeIds]) => {
      acc[collectionId] = recipeIds.length;
      return acc;
    }, {} as Record<string, number>);
  }, [collectionItems]);

  const handleCollectionSaved = useCallback(() => {
    loadCollections();
    setEditingCollection(null);
  }, [loadCollections]);

  const handleEditCollection = useCallback((collection: RecipeCollection) => {
    setEditingCollection(collection);
    setShowManageCollectionsDialog(false);
    setShowCreateCollectionDialog(true);
  }, []);

  const handleOrderIngredients = useCallback((recipe: Recipe) => {
    setRecipeForOrder(recipe);
    setShowOrderDialog(true);
  }, []);

  // AI Suggestions
  const handleAISuggestions = async () => {
    setIsLoadingSuggestions(true);
    setAiSuggestionsOpen(true);
    setSuggestions([]);
    try {
      const activeKid = kids.find((k) => k.id === activeKidId);
      const pantryFoods = foods.filter((f) => f.is_safe && (f.quantity ?? 0) > 0);
      if (pantryFoods.length === 0) {
        toast.error("No foods in pantry", { description: "Add some foods to your pantry first" });
        setIsLoadingSuggestions(false);
        return;
      }
      const { data, error } = await invokeEdgeFunction("suggest-recipes-from-pantry", {
        body: { pantryFoods, childProfile: activeKid, count: 5 },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error("AI Error", { description: data.error });
      } else {
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      logger.error("Error getting AI suggestions:", error);
      toast.error("Failed to get suggestions");
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleAddSuggestion = async (suggestion: RecipeSuggestion) => {
    try {
      const createdRecipe = await addRecipe({
        name: suggestion.name,
        description: suggestion.description,
        food_ids: suggestion.food_ids,
        prepTime: suggestion.prepTime,
        cookTime: suggestion.cookTime,
        tips: suggestion.reason,
      });
      if (!createdRecipe?.id) throw new Error("Recipe was not saved to database");
      toast.success(`Added "${suggestion.name}" to recipes!`);
    } catch (error) {
      logger.error("Error adding recipe:", error);
      toast.error("Failed to add recipe", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const isFamilyMode = activeKidId === null;

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <Helmet>
        <title>Recipes - EatPal</title>
        <meta name="description" content="Manage family recipes, meal templates, and discover new meal ideas" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">Recipes & Meal Templates</h1>
            <p className="text-muted-foreground">
              {isFamilyMode
                ? "Family recipes for all children"
                : `Recipes for ${kids.find((k) => k.id === activeKidId)?.name}`}
            </p>
            {isFamilyMode && kids.length > 1 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="text-sm text-muted-foreground">Quick filter:</span>
                {kids.map((kid) => (
                  <Button key={kid.id} variant="ghost" size="sm" onClick={() => setActiveKid(kid.id)}>
                    {kid.name}
                  </Button>
                ))}
              </div>
            )}
            {userId && (
              <div className="mt-4">
                <RecipeCollectionsSelector
                  userId={userId}
                  householdId={householdId || undefined}
                  selectedCollectionId={selectedCollectionId}
                  onCollectionChange={setSelectedCollectionId}
                  onCreateNew={() => {
                    setEditingCollection(null);
                    setShowCreateCollectionDialog(true);
                  }}
                  onManageCollections={() => setShowManageCollectionsDialog(true)}
                  recipeCountsByCollection={recipeCountsByCollection}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleAISuggestions} variant="secondary" size="lg" disabled={isLoadingSuggestions}>
              <Sparkles className="h-5 w-5 mr-2" />
              AI Suggest
            </Button>
            <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="lg" type="button">
              <Upload className="h-5 w-5 mr-2" />
              Import
            </Button>
            <Button onClick={() => setBuilderOpen(true)} size="lg" className="shadow-lg">
              <Plus className="h-5 w-5 mr-2" />
              Create
            </Button>
          </div>
        </div>

        {isInitialLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
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
        ) : recipes.length === 0 ? (
          /* Empty state */
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ChefHat className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Create Your Recipe Collection</h3>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Recipes are meal templates that combine multiple foods. They make planning faster
                and help you create balanced, kid-friendly meals.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => setBuilderOpen(true)}>
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors flex items-center justify-center mx-auto mb-3">
                    <Plus className="h-6 w-6 text-primary" />
                  </div>
                  <h4 className="font-semibold mb-2">Create from Scratch</h4>
                  <p className="text-sm text-muted-foreground mb-3">Build a custom recipe with your child's favorite foods</p>
                  <Badge variant="secondary">Most Popular</Badge>
                </CardContent>
              </Card>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => setImportDialogOpen(true)}>
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-accent/10 group-hover:bg-accent/20 transition-colors flex items-center justify-center mx-auto mb-3">
                    <Globe className="h-6 w-6 text-accent" />
                  </div>
                  <h4 className="font-semibold mb-2">Import from URL</h4>
                  <p className="text-sm text-muted-foreground mb-3">Paste a recipe link and we'll extract it for you</p>
                </CardContent>
              </Card>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={handleAISuggestions}>
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="h-6 w-6 text-purple-500" />
                  </div>
                  <h4 className="font-semibold mb-2">AI Recipe Generator</h4>
                  <p className="text-sm text-muted-foreground mb-3">Generate kid-friendly recipes using AI</p>
                </CardContent>
              </Card>
            </div>
            <div className="bg-muted/50 rounded-lg p-6">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Recipe Tips
              </h4>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex gap-2"><span className="text-primary">✓</span><span><strong>Save time:</strong> Create recipes for meals you make often</span></div>
                  <div className="flex gap-2"><span className="text-primary">✓</span><span><strong>Balance meals:</strong> Include protein, carbs, and veggies</span></div>
                </div>
                <div className="space-y-2">
                  <div className="flex gap-2"><span className="text-primary">✓</span><span><strong>Organize:</strong> Use collections to group similar recipes</span></div>
                  <div className="flex gap-2"><span className="text-primary">✓</span><span><strong>Track success:</strong> Rate recipes your kids actually eat</span></div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar: search, sort, view toggle, quick filters */}
            <RecipeToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              quickFilters={quickFilters}
              onToggleQuickFilter={toggleQuickFilter}
              onClearFilters={clearFilters}
              resultCount={resultCount}
              totalCount={totalCount}
              hasActiveFilters={hasActiveFilters}
            />

            {selectedCollectionId && filteredRecipes.length === 0 && !hasActiveFilters ? (
              <Card className="p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Folder className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Recipes in This Collection</h3>
                  <p className="text-muted-foreground mb-6">Add recipes to this collection to see them here</p>
                  <Button onClick={() => setSelectedCollectionId(null)} variant="outline">View All Recipes</Button>
                </div>
              </Card>
            ) : filteredRecipes.length === 0 && hasActiveFilters ? (
              <Card className="p-12 text-center">
                <div className="max-w-md mx-auto">
                  <h3 className="text-xl font-semibold mb-2">No Matching Recipes</h3>
                  <p className="text-muted-foreground mb-6">Try adjusting your search or filters</p>
                  <Button onClick={clearFilters} variant="outline">Clear Filters</Button>
                </div>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                {filteredRecipes.map((recipe) => (
                  <EnhancedRecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    foods={foods}
                    kids={kids}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={setDeleteId}
                    onAddToGroceryList={handleAddToGrocery}
                    onAddToCollections={handleAddToCollections}
                    onOrderIngredients={handleOrderIngredients}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredRecipes.map((recipe) => (
                  <RecipeListItem
                    key={recipe.id}
                    recipe={recipe}
                    foods={foods}
                    onView={handleView}
                    onAddToGrocery={handleAddToGrocery}
                    onAddToPlanner={(r) => {
                      setViewingRecipe(r);
                      setDetailOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Recipe Detail View (Sheet) */}
        <RecipeDetailView
          recipe={viewingRecipe}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          foods={foods}
          kids={kids}
          activeKidId={activeKidId}
          onUpdateRecipe={updateRecipe}
          onDeleteRecipe={(id) => {
            deleteRecipe(id);
            setDetailOpen(false);
            toast.success("Recipe deleted");
          }}
          onEdit={handleEdit}
          onAddToGrocery={handleAddToGrocery}
          onAddToPlan={handleAddToPlan}
          onAddToCollections={handleAddToCollections}
        />

        {/* Enhanced Recipe Builder (Sheet) */}
        <Sheet open={builderOpen} onOpenChange={(open) => { if (!open) handleClose(); setBuilderOpen(open); }}>
          <SheetContent side="right" className="w-full sm:max-w-[600px] md:max-w-[700px]">
            <SheetHeader>
              <SheetTitle>{editRecipe ? "Edit Recipe" : "Create Recipe"}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <EnhancedRecipeBuilder
                foods={foods}
                kids={kids}
                activeKidId={activeKidId}
                editRecipe={editRecipe}
                onSave={handleSave}
                onCancel={handleClose}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Smart Grocery Dialog */}
        <SmartGroceryDialog
          recipe={groceryRecipe}
          open={groceryDialogOpen}
          onOpenChange={setGroceryDialogOpen}
          foods={foods}
          groceryItems={groceryItems}
          onAddGroceryItems={handleGroceryItemsAdd}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this recipe. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && handleDelete(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Import Dialog */}
        <ImportRecipeDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImport={handleImport}
          foods={foods}
          kids={kids}
        />

        {/* AI Suggestions Dialog */}
        <Dialog open={aiSuggestionsOpen} onOpenChange={setAiSuggestionsOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Recipe Suggestions from Your Pantry
              </DialogTitle>
              <DialogDescription>Recipes created using foods you already have</DialogDescription>
            </DialogHeader>
            {isLoadingSuggestions ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Analyzing your pantry...</p>
              </div>
            ) : suggestions.length > 0 ? (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  {suggestions.map((suggestion, index) => (
                    <Card key={index} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">{suggestion.name}</h3>
                              <Badge variant="outline">{suggestion.difficulty}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">{suggestion.description}</p>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {suggestion.food_names.map((foodName, i) => (
                                <Badge key={i} variant="secondary">{foodName}</Badge>
                              ))}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>Prep: {suggestion.prepTime}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>Cook: {suggestion.cookTime}</span>
                              </div>
                            </div>
                            <div className="bg-primary/5 p-3 rounded-lg">
                              <div className="flex items-start gap-2">
                                <Lightbulb className="h-4 w-4 text-primary mt-0.5" />
                                <p className="text-sm">
                                  <span className="font-medium">Why this works:</span> {suggestion.reason}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Button size="sm" onClick={() => handleAddSuggestion(suggestion)}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No suggestions available.</p>
                <p className="text-sm mt-2">Make sure you have foods in your pantry with quantity &gt; 0</p>
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
              userId={userId}
              householdId={householdId || undefined}
              editCollection={editingCollection}
              onCollectionCreated={handleCollectionSaved}
            />
            <ManageCollectionsDialog
              open={showManageCollectionsDialog}
              onOpenChange={setShowManageCollectionsDialog}
              userId={userId}
              householdId={householdId || undefined}
              onEditCollection={handleEditCollection}
              recipeCountsByCollection={recipeCountsByCollection}
            />
          </>
        )}
        {recipeForCollections && (
          <AddToCollectionsDialog
            open={showAddToCollectionsDialog}
            onOpenChange={(open) => { setShowAddToCollectionsDialog(open); if (!open) setRecipeForCollections(null); }}
            recipeId={recipeForCollections.id}
            recipeName={recipeForCollections.name}
            collections={collections}
            currentCollectionIds={getRecipeCollectionIds(recipeForCollections.id)}
            onCollectionsUpdated={loadCollectionItems}
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
