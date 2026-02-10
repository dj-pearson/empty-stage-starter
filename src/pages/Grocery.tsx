import { useEffect, useState, useRef, useCallback } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AddGroceryItemDialog } from "@/components/AddGroceryItemDialog";
import { SmartRestockSuggestions } from "@/components/SmartRestockSuggestions";
import { GroceryListSelector } from "@/components/GroceryListSelector";
import { CreateGroceryListDialog } from "@/components/CreateGroceryListDialog";
import { ManageGroceryListsDialog } from "@/components/ManageGroceryListsDialog";
import { CreateStoreLayoutDialog } from "@/components/CreateStoreLayoutDialog";
import { ManageStoreLayoutsDialog } from "@/components/ManageStoreLayoutsDialog";
import { ManageStoreAislesDialog } from "@/components/ManageStoreAislesDialog";
import { AisleContributionDialog } from "@/components/AisleContributionDialog";
import { ImportRecipeToGroceryDialog } from "@/components/ImportRecipeToGroceryDialog";
import { generateGroceryList } from "@/lib/mealPlanner";
import {
  ShoppingCart, Trash2, Printer, Download, Plus, Share2, FileText,
  Sparkles, Store, Barcode, RefreshCw, ChevronDown, ChevronRight,
  X, Minus, Check, MoreHorizontal, PackageCheck, ShoppingBag
} from "lucide-react";
import { toast } from "sonner";
import { FoodCategory, GroceryItem } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Extended type for grocery items with additional database properties
interface ExtendedGroceryItem extends GroceryItem {
  is_manual?: boolean;
  confidence_level?: 'low' | 'medium' | 'high';
}

// Type for aisle mapping records
interface AisleMapping {
  id: string;
  store_layout_id: string;
  food_name: string;
  aisle_name: string;
  confidence_level?: 'low' | 'medium' | 'high';
  created_at?: string;
  updated_at?: string;
}

// Type for user contribution records
interface UserContribution {
  id: string;
  user_id: string;
  store_layout_id: string;
  food_name: string;
  aisle_name: string;
  created_at?: string;
}

const categoryLabels: Record<FoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  dairy: "Dairy",
  fruit: "Fruits",
  vegetable: "Vegetables",
  snack: "Snacks",
};

const categoryIcons: Record<FoodCategory, string> = {
  protein: "🥩",
  carb: "🍞",
  dairy: "🧀",
  fruit: "🍎",
  vegetable: "🥦",
  snack: "🍿",
};

export default function Grocery() {
  const {
    foods, kids, activeKidId, planEntries, groceryItems,
    setGroceryItems, addGroceryItem, toggleGroceryItem,
    updateGroceryItem, deleteGroceryItem, deleteGroceryItems,
    clearCheckedGroceryItems, addFood, updateFood
  } = useApp();

  const [groupBy, setGroupBy] = useState<"category" | "aisle">("aisle");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isGeneratingRestock, setIsGeneratingRestock] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [showCreateListDialog, setShowCreateListDialog] = useState(false);
  const [showManageListsDialog, setShowManageListsDialog] = useState(false);

  // Store layout states
  const [showCreateStoreDialog, setShowCreateStoreDialog] = useState(false);
  const [showManageStoresDialog, setShowManageStoresDialog] = useState(false);
  const [showManageAislesDialog, setShowManageAislesDialog] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const [managingAislesStore, setManagingAislesStore] = useState<any>(null);
  const [selectedStoreLayoutId, setSelectedStoreLayoutId] = useState<string | null>(null);

  // Aisle contribution state
  const [showAisleContribution, setShowAisleContribution] = useState(false);
  const [contributionItem, setContributionItem] = useState<string | null>(null);

  // Import recipe state
  const [showImportRecipeDialog, setShowImportRecipeDialog] = useState(false);

  // Purchased section state
  const [purchasedOpen, setPurchasedOpen] = useState(false);

  // Auto-cleanup flag to prevent running multiple times
  const hasAutoCleanedRef = useRef(false);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          logger.error('Error getting user in Grocery:', authError);
          return;
        }
        setUserId(user?.id || null);
        if (user) {
          const { data: hh, error: hhError } = await supabase.rpc('get_user_household_id', { _user_id: user.id });
          if (hhError) {
            logger.error('Error getting household ID in Grocery:', hhError);
            toast.error('Failed to load household data', { description: 'Some features may be unavailable' });
            return;
          }
          setHouseholdId((hh as string) ?? null);
        }
      } catch (error) {
        logger.error('Unexpected error loading user data in Grocery:', error);
        toast.error('Failed to load user data');
      }
    };
    loadUserData();
  }, []);

  // Auto-cleanup: Remove stale checked items from previous sessions on mount
  useEffect(() => {
    if (hasAutoCleanedRef.current) return;
    const checkedItems = groceryItems.filter(item => item.checked);
    if (checkedItems.length > 0) {
      hasAutoCleanedRef.current = true;
      const checkedIds = checkedItems.map(i => i.id);
      deleteGroceryItems(checkedIds);
      toast.info(`Cleared ${checkedItems.length} purchased item${checkedItems.length === 1 ? '' : 's'} from last trip`, {
        description: "Items were already added to your pantry"
      });
    }
  }, [groceryItems.length > 0]); // Run once when grocery items first load

  const isFamilyMode = !activeKidId;
  const activeKid = kids.find(k => k.id === activeKidId);

  // Filter grocery items by selected list
  const filteredGroceryItems = selectedListId
    ? groceryItems.filter(item => item.grocery_list_id === selectedListId)
    : groceryItems;

  // Split into active (unchecked) and purchased (checked) items
  const activeItems = filteredGroceryItems.filter(i => !i.checked);
  const purchasedItems = filteredGroceryItems.filter(i => i.checked);

  // Progress calculation
  const totalItems = filteredGroceryItems.length;
  const purchasedCount = purchasedItems.length;
  const progressPercent = totalItems > 0 ? Math.round((purchasedCount / totalItems) * 100) : 0;

  // Manual regeneration function
  const handleRegenerateFromPlan = () => {
    if (planEntries.length === 0) {
      toast.info("No meal plan found", { description: "Create a meal plan first to generate a grocery list" });
      return;
    }
    const filteredEntries = isFamilyMode
      ? planEntries
      : planEntries.filter(e => e.kid_id === activeKidId);
    const generated = generateGroceryList(filteredEntries, foods);
    const extendedItems = groceryItems as ExtendedGroceryItem[];
    const manual = extendedItems.filter(item => item.is_manual);
    const checked = extendedItems.filter(item => item.checked && !item.is_manual);
    const existingNames = new Set([
      ...manual.map(i => i.name.toLowerCase()),
      ...checked.map(i => i.name.toLowerCase())
    ]);
    const newItems = generated.filter(gen => !existingNames.has(gen.name.toLowerCase()));
    setGroceryItems([...manual, ...checked, ...newItems]);
    toast.success(`Added ${newItems.length} items from meal plan`, {
      description: `Preserved ${manual.length + checked.length} existing items`
    });
  };

  const handleToggleItem = async (itemId: string) => {
    const item = groceryItems.find(i => i.id === itemId);
    if (!item) return;

    toggleGroceryItem(itemId);

    // If checking the item (purchasing), handle pantry sync + aisle contribution
    if (!item.checked) {
      // Aisle contribution prompt
      if (selectedStoreLayoutId && userId) {
        try {
          const { data: existingContribution } = await supabase
            .from('user_store_contributions')
            .select('*')
            .eq('user_id', userId)
            .eq('store_layout_id', selectedStoreLayoutId)
            .eq('food_name', item.name)
            .maybeSingle() as { data: UserContribution | null };

          const { data: existingMapping } = await supabase
            .from('food_aisle_mappings')
            .select('*')
            .eq('store_layout_id', selectedStoreLayoutId)
            .eq('food_name', item.name)
            .maybeSingle() as { data: AisleMapping | null };

          const shouldAskContribution = !existingContribution ||
            !existingMapping ||
            existingMapping?.confidence_level === 'low';

          if (shouldAskContribution && Math.random() < 0.5) {
            setContributionItem(item.name);
            setShowAisleContribution(true);
          }
        } catch (error) {
          logger.error('Error checking contribution status:', error);
        }
      }

      // Add/update pantry inventory
      const existingFood = foods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
      if (existingFood) {
        updateFood(existingFood.id, {
          ...existingFood,
          quantity: (existingFood.quantity || 0) + item.quantity,
          unit: item.unit
        });
      } else {
        addFood({
          name: item.name,
          category: item.category,
          is_safe: true,
          is_try_bite: false,
          aisle: item.aisle,
          quantity: item.quantity,
          unit: item.unit
        });
      }

      toast.success(`${item.name} added to pantry`, {
        description: `${item.quantity} ${item.unit} moved to inventory`,
        action: {
          label: "Undo",
          onClick: () => {
            toggleGroceryItem(itemId);
            // Reverse pantry update
            const food = foods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
            if (food && food.quantity) {
              updateFood(food.id, {
                ...food,
                quantity: Math.max(0, food.quantity - item.quantity),
              });
            }
          }
        }
      });
    } else {
      // Unchecking - remove from pantry
      const existingFood = foods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
      if (existingFood && existingFood.quantity) {
        updateFood(existingFood.id, {
          ...existingFood,
          quantity: Math.max(0, existingFood.quantity - item.quantity),
        });
        toast.info(`${item.name} moved back to shopping list`);
      }
    }
  };

  const handleDeleteItem = (itemId: string) => {
    const item = groceryItems.find(i => i.id === itemId);
    deleteGroceryItem(itemId);
    if (item) {
      toast.success(`Removed ${item.name}`, {
        action: {
          label: "Undo",
          onClick: () => {
            addGroceryItem({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              category: item.category,
              aisle: item.aisle,
              notes: item.notes,
              brand_preference: item.brand_preference,
              barcode: item.barcode,
              grocery_list_id: item.grocery_list_id,
            });
          }
        }
      });
    }
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    const item = groceryItems.find(i => i.id === itemId);
    if (!item) return;
    const newQty = Math.max(1, item.quantity + delta);
    updateGroceryItem(itemId, { quantity: newQty });
  };

  const handleDoneShopping = () => {
    const count = purchasedItems.length;
    clearCheckedGroceryItems();
    setPurchasedOpen(false);
    toast.success(`Shopping trip complete!`, {
      description: `${count} item${count === 1 ? '' : 's'} cleared from list and saved to pantry`
    });
  };

  const handleSmartRestock = async () => {
    setIsGeneratingRestock(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }
      const { data, error } = await supabase.rpc('auto_add_restock_items', {
        p_user_id: user.id,
        p_kid_id: activeKidId
      });
      if (error) throw error;

      const { data: groceryData } = await supabase
        .from('grocery_items')
        .select('*')
        .order('created_at', { ascending: true });

      if (groceryData) {
        setGroceryItems(groceryData as any);
      }
      const itemsAdded = Number(data) || 0;
      if (itemsAdded > 0) {
        toast.success(`Added ${itemsAdded} item${itemsAdded === 1 ? '' : 's'} to restock`, {
          description: "Based on low stock and consumption patterns"
        });
      } else {
        toast.info("No restock items needed right now", {
          description: "Your pantry looks well-stocked!"
        });
      }
    } catch (error) {
      logger.error('Error generating restock:', error);
      toast.error("Failed to generate restock suggestions");
    } finally {
      setIsGeneratingRestock(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const csv = [
      "Category,Item,Quantity,Unit,Aisle,Status",
      ...activeItems.map(item =>
        `${categoryLabels[item.category]},"${item.name}",${item.quantity},${item.unit},"${item.aisle || ""}","To Buy"`
      )
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grocery-list-${activeKid?.name || "list"}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  const handleExportText = () => {
    const text = [
      `Grocery List${activeKid ? ` - ${activeKid.name}` : ""}`,
      `${new Date().toLocaleDateString()} - ${activeItems.length} items`,
      "",
      ...Object.entries(activeItemsByGroup).map(([group, items]) => {
        if (items.length === 0) return "";
        return [
          `${group}:`,
          ...items.map(item => `  - ${item.name} (${item.quantity} ${item.unit})`),
          ""
        ].join("\n");
      }).filter(Boolean)
    ].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("List copied to clipboard!");
  };

  const handleExportAnyList = () => {
    const csv = activeItems
      .map(item => `"${item.name}","${item.quantity} ${item.unit}","${item.aisle || categoryLabels[item.category]}"`)
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anylist-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("AnyList format exported!");
  };

  const handleShareiOS = async () => {
    const text = activeItems
      .map(item => `${item.name} (${item.quantity} ${item.unit})`)
      .join("\n");
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Grocery List${activeKid ? ` - ${activeKid.name}` : ""}`,
          text: text,
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard!");
        }
      }
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    }
  };

  const handleCopyList = () => {
    const text = activeItems
      .map(item => `${item.name} (${item.quantity} ${item.unit})`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("List copied to clipboard!");
  };

  // Group active items by category or aisle
  const activeItemsByGroup: Record<string, GroceryItem[]> = {};

  if (groupBy === "category") {
    const categoryGroups: Record<FoodCategory, GroceryItem[]> = {
      protein: [], carb: [], dairy: [], fruit: [], vegetable: [], snack: [],
    };
    activeItems.forEach(item => {
      categoryGroups[item.category].push(item);
    });
    Object.entries(categoryGroups).forEach(([category, items]) => {
      if (items.length > 0) {
        activeItemsByGroup[categoryLabels[category as FoodCategory]] = items;
      }
    });
  } else {
    activeItems.forEach(item => {
      const aisle = item.aisle || "Uncategorized";
      if (!activeItemsByGroup[aisle]) {
        activeItemsByGroup[aisle] = [];
      }
      activeItemsByGroup[aisle].push(item);
    });
  }

  const isEmpty = activeItems.length === 0 && purchasedItems.length === 0;

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-6 max-w-3xl">

        {/* ─── Header ─── */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Grocery List</h1>
                <p className="text-sm text-muted-foreground">
                  {isFamilyMode ? "Household shopping list" : `Shopping for ${activeKid?.name || 'your child'}`}
                </p>
              </div>
            </div>

            {/* More options menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleRegenerateFromPlan}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync from Meal Plan
                </DropdownMenuItem>
                {userId && (
                  <DropdownMenuItem onClick={() => setShowManageStoresDialog(true)}>
                    <Store className="h-4 w-4 mr-2" />
                    Store Layouts
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportText}>
                  <FileText className="h-4 w-4 mr-2" />
                  Copy as Text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShareiOS}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportAnyList}>
                  <Download className="h-4 w-4 mr-2" />
                  Export for AnyList
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* List Selector */}
          {userId && (
            <div className="mb-4">
              <GroceryListSelector
                userId={userId}
                householdId={householdId || undefined}
                selectedListId={selectedListId}
                onListChange={setSelectedListId}
                onCreateNew={() => setShowCreateListDialog(true)}
                onManageLists={() => setShowManageListsDialog(true)}
              />
            </div>
          )}

          {/* Progress Bar - only show when shopping */}
          {totalItems > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Shopping progress
                </span>
                <span className="text-sm font-semibold">
                  {purchasedCount} of {totalItems} items
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              {progressPercent === 100 && (
                <p className="text-sm text-primary font-medium mt-2">
                  All items purchased! Tap "Done Shopping" below to clear your list.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ─── Quick Actions ─── */}
        <div className="flex gap-2 flex-wrap mb-6">
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Item
          </Button>
          <Button onClick={() => setShowImportRecipeDialog(true)} variant="secondary" size="sm">
            <FileText className="h-4 w-4 mr-1.5" />
            From Recipe
          </Button>
          <Button
            onClick={handleSmartRestock}
            variant="secondary"
            size="sm"
            disabled={isGeneratingRestock}
          >
            {isGeneratingRestock ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary mr-1.5" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1.5" />
                Smart Restock
              </>
            )}
          </Button>
        </div>

        {/* Smart Restock Suggestions */}
        {userId && (
          <div className="mb-6">
            <SmartRestockSuggestions
              userId={userId}
              kidId={activeKidId || undefined}
              onAddItems={(items) => {
                items.forEach(item => addGroceryItem(item));
              }}
            />
          </div>
        )}

        {/* ─── Empty State ─── */}
        {isEmpty ? (
          <Card className="p-12 text-center">
            <div className="max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Your list is empty</h3>
              <p className="text-muted-foreground mb-6">
                Add items manually, import from a recipe, or sync from your meal plan to get started.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button onClick={() => setShowAddDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Item
                </Button>
                <Button onClick={handleRegenerateFromPlan} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Sync from Meal Plan
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <>
            {/* ─── Group Toggle ─── */}
            {activeItems.length > 0 && (
              <div className="mb-4">
                <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as "category" | "aisle")}>
                  <TabsList className="grid w-full max-w-xs grid-cols-2">
                    <TabsTrigger value="aisle">By Aisle</TabsTrigger>
                    <TabsTrigger value="category">By Category</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}

            {/* ─── Active Shopping Items ─── */}
            {activeItems.length > 0 ? (
              <div className="space-y-3 mb-6">
                {Object.entries(activeItemsByGroup).map(([group, items]) => {
                  if (items.length === 0) return null;

                  return (
                    <Card key={group} className="overflow-hidden">
                      <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{group}</span>
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {items.length}
                          </Badge>
                        </div>
                      </div>
                      <div className="divide-y">
                        {items.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
                          >
                            <Checkbox
                              checked={false}
                              onCheckedChange={() => handleToggleItem(item.id)}
                              className="shrink-0"
                            />

                            {/* Item photo */}
                            {item.photo_url && (
                              <img
                                src={item.photo_url}
                                alt={item.name}
                                className="w-10 h-10 object-cover rounded-md border shrink-0"
                              />
                            )}

                            {/* Item details */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{item.name}</p>
                              {item.brand_preference && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {item.brand_preference}
                                </p>
                              )}
                              {item.notes && (
                                <p className="text-xs text-muted-foreground italic truncate">
                                  {item.notes}
                                </p>
                              )}
                              {item.barcode && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Barcode className="h-3 w-3" />
                                  <span className="truncate">{item.barcode}</span>
                                </div>
                              )}
                            </div>

                            {/* Quantity controls */}
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleQuantityChange(item.id, -1)}
                                disabled={item.quantity <= 1}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-sm font-medium w-16 text-center tabular-nums">
                                {item.quantity} {item.unit}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleQuantityChange(item.id, 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>

                            {/* Delete button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : purchasedItems.length > 0 ? (
              /* All items purchased celebration */
              <Card className="p-8 text-center mb-6 border-primary/20 bg-primary/5">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <PackageCheck className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">All items purchased!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Everything has been added to your pantry.
                </p>
                <Button onClick={handleDoneShopping} size="sm">
                  <Check className="h-4 w-4 mr-1.5" />
                  Done Shopping
                </Button>
              </Card>
            ) : null}

            {/* ─── Purchased Items Section ─── */}
            {purchasedItems.length > 0 && activeItems.length > 0 && (
              <Collapsible open={purchasedOpen} onOpenChange={setPurchasedOpen}>
                <Card className="overflow-hidden border-dashed">
                  <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2">
                      {purchasedOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium text-muted-foreground">
                        Purchased
                      </span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {purchasedItems.length}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        - added to pantry
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDoneShopping();
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="divide-y border-t">
                      {purchasedItems.map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-4 py-2.5 bg-muted/20"
                        >
                          <Checkbox
                            checked={true}
                            onCheckedChange={() => handleToggleItem(item.id)}
                            className="shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm line-through text-muted-foreground truncate">
                              {item.name}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {item.quantity} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* ─── Done Shopping Button (floating) ─── */}
            {purchasedItems.length > 0 && activeItems.length > 0 && (
              <div className="fixed bottom-24 md:bottom-8 left-0 right-0 flex justify-center z-30 pointer-events-none">
                <Button
                  onClick={handleDoneShopping}
                  size="lg"
                  className="shadow-lg pointer-events-auto rounded-full px-6"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Done Shopping ({purchasedItems.length} item{purchasedItems.length === 1 ? '' : 's'})
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Dialogs ─── */}
      <AddGroceryItemDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={addGroceryItem}
      />

      {userId && (
        <>
          <CreateGroceryListDialog
            open={showCreateListDialog}
            onOpenChange={setShowCreateListDialog}
            userId={userId}
            householdId={householdId || undefined}
            onListCreated={(listId) => {
              setSelectedListId(listId);
              setShowCreateListDialog(false);
            }}
          />

          <ManageGroceryListsDialog
            open={showManageListsDialog}
            onOpenChange={setShowManageListsDialog}
            userId={userId}
            householdId={householdId || undefined}
            currentListId={selectedListId}
            onListDeleted={(deletedId) => {
              if (deletedId === selectedListId) {
                setSelectedListId(null);
              }
            }}
          />

          <CreateStoreLayoutDialog
            open={showCreateStoreDialog}
            onOpenChange={(open) => {
              setShowCreateStoreDialog(open);
              if (!open) setEditingStore(null);
            }}
            userId={userId}
            householdId={householdId || undefined}
            editStore={editingStore}
            onStoreCreated={() => {
              setEditingStore(null);
              setShowCreateStoreDialog(false);
            }}
          />

          <ManageStoreLayoutsDialog
            open={showManageStoresDialog}
            onOpenChange={setShowManageStoresDialog}
            userId={userId}
            householdId={householdId || undefined}
            onEditStore={(store) => {
              setEditingStore(store);
              setShowManageStoresDialog(false);
              setShowCreateStoreDialog(true);
            }}
            onManageAisles={(store) => {
              setManagingAislesStore(store);
              setShowManageStoresDialog(false);
              setShowManageAislesDialog(true);
            }}
          />

          {managingAislesStore && (
            <ManageStoreAislesDialog
              open={showManageAislesDialog}
              onOpenChange={(open) => {
                setShowManageAislesDialog(open);
                if (!open) {
                  setManagingAislesStore(null);
                  setShowManageStoresDialog(true);
                }
              }}
              storeLayout={managingAislesStore}
            />
          )}

          <AisleContributionDialog
            open={showAisleContribution}
            onOpenChange={setShowAisleContribution}
            itemName={contributionItem || ""}
            storeLayoutId={selectedStoreLayoutId}
            userId={userId}
            onContribute={() => {
              toast.success("Thank you for helping the community!");
            }}
          />

          <ImportRecipeToGroceryDialog
            open={showImportRecipeDialog}
            onOpenChange={setShowImportRecipeDialog}
            onImport={(ingredients) => {
              ingredients.forEach(ingredient => {
                addGroceryItem({
                  name: ingredient.name,
                  quantity: ingredient.quantity,
                  unit: ingredient.unit,
                  category: ingredient.category,
                  notes: ingredient.notes,
                  aisle: undefined,
                  grocery_list_id: selectedListId || undefined
                });
              });
            }}
          />
        </>
      )}
    </div>
  );
}
