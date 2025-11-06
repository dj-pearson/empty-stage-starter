import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ShoppingCart, Copy, Trash2, Printer, Download, Plus, Share2, FileText, Sparkles, Store, Barcode } from "lucide-react";
import { toast } from "sonner";
import { FoodCategory } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

const categoryLabels: Record<FoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  dairy: "Dairy",
  fruit: "Fruits",
  vegetable: "Vegetables",
  snack: "Snacks",
};

export default function Grocery() {
  const { foods, kids, activeKidId, planEntries, groceryItems, setGroceryItems, addGroceryItem, toggleGroceryItem, clearCheckedGroceryItems, addFood, updateFood } = useApp();
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

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUserId(user?.id || null);
      
      if (user) {
        // Get household ID
        const { data: hh } = await supabase.rpc('get_user_household_id', { _user_id: user.id });
        setHouseholdId((hh as string) ?? null);
      }
    });
  }, []);

  const isFamilyMode = !activeKidId;
  const activeKid = kids.find(k => k.id === activeKidId);

  // Filter grocery items by selected list
  const filteredGroceryItems = selectedListId
    ? groceryItems.filter(item => item.grocery_list_id === selectedListId)
    : groceryItems;

  useEffect(() => {
    if (planEntries.length > 0) {
      // In family mode, generate list from all kids' plans. Otherwise, just active kid.
      const filteredEntries = isFamilyMode 
        ? planEntries 
        : planEntries.filter(e => e.kid_id === activeKidId);
      const newList = generateGroceryList(filteredEntries, foods);
      setGroceryItems(newList);
    }
  }, [planEntries, foods, activeKidId, isFamilyMode]);

  const handleCopyList = () => {
    const text = groceryItems
      .map(item => `${item.checked ? "☑" : "☐"} ${item.name} (${item.quantity} ${item.unit})`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("List copied to clipboard!");
  };

  const handleToggleItem = async (itemId: string) => {
    const item = groceryItems.find(i => i.id === itemId);
    if (!item) return;

    toggleGroceryItem(itemId);

    // If checking the item, ask for aisle contribution (max 2-3 items per trip)
    if (!item.checked && selectedStoreLayoutId && userId) {
      try {
        // Check if user has already contributed for this item at this store
        const { data: existingContribution } = await (supabase as any)
          .from('user_store_contributions')
          .select('*')
          .eq('user_id', userId)
          .eq('store_layout_id', selectedStoreLayoutId)
          .eq('food_name', item.name)
          .maybeSingle();

        // Check if there's already a mapping
        const { data: existingMapping } = await (supabase as any)
          .from('food_aisle_mappings')
          .select('*')
          .eq('store_layout_id', selectedStoreLayoutId)
          .eq('food_name', item.name)
          .maybeSingle();

        // Only ask for contribution if:
        // 1. User hasn't contributed this item before, OR
        // 2. There's no mapping yet, OR
        // 3. Confidence is still low
        const shouldAskContribution = !existingContribution || 
          !existingMapping || 
          existingMapping?.confidence_level === 'low';

        if (shouldAskContribution && Math.random() < 0.5) { // Ask for ~50% of items to get more data
          setContributionItem(item.name);
          setShowAisleContribution(true);
        }
      } catch (error) {
        logger.error('Error checking contribution status:', error);
      }
    }

    // If checking the item, add/update pantry inventory
    if (!item.checked) {
      const existingFood = foods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
      
      if (existingFood) {
        // Update existing food quantity
        updateFood(existingFood.id, {
          ...existingFood,
          quantity: (existingFood.quantity || 0) + item.quantity,
          unit: item.unit
        });
        toast.success(
          `✓ ${item.name} added to pantry`,
          { description: `${item.quantity} ${item.unit} added to inventory` }
        );
      } else {
        // Create new food item in pantry
        addFood({
          name: item.name,
          category: item.category,
          is_safe: true,
          is_try_bite: false,
          aisle: item.aisle,
          quantity: item.quantity,
          unit: item.unit
        });
        toast.success(
          `✓ ${item.name} added to pantry`,
          { description: `New item created with ${item.quantity} ${item.unit}` }
        );
      }
    } else {
      // Unchecking - remove from pantry
      const existingFood = foods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
      if (existingFood && existingFood.quantity) {
        updateFood(existingFood.id, {
          ...existingFood,
          quantity: Math.max(0, existingFood.quantity - item.quantity),
        });
        toast.info(`${item.name} quantity reduced in pantry`);
      }
    }
  };

  const handleClearChecked = () => {
    clearCheckedGroceryItems();
    toast.success("Checked items cleared");
  };

  const handleSmartRestock = async () => {
    setIsGeneratingRestock(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      // Call the database function to detect and add restock items
      const { data, error } = await (supabase as any).rpc('auto_add_restock_items', {
        p_user_id: user.id,
        p_kid_id: activeKidId
      });

      if (error) throw error;

      // Reload grocery items from database
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
    toast.success("Print dialog opened");
  };

  const handleExportCSV = () => {
    const csv = [
      "Category,Item,Quantity,Unit,Aisle,Checked",
      ...groceryItems.map(item => 
        `${categoryLabels[item.category]},"${item.name}",${item.quantity},${item.unit},"${item.aisle || ""}",${item.checked ? "Yes" : "No"}`
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
    const uncheckedItems = groceryItems.filter(i => !i.checked);
    const text = [
      `Grocery List${activeKid ? ` - ${activeKid.name}` : ""}`,
      `Generated: ${new Date().toLocaleDateString()}`,
      "",
      ...Object.entries(itemsByGroup).map(([group, items]) => {
        const groupItems = items.filter(i => !i.checked);
        if (groupItems.length === 0) return "";
        return [
          `${group}:`,
          ...groupItems.map(item => `  ☐ ${item.name} (${item.quantity} ${item.unit})`),
          ""
        ].join("\n");
      }).filter(Boolean)
    ].join("\n");
    
    navigator.clipboard.writeText(text);
    toast.success("List copied to clipboard - paste into Notes or Reminders!");
  };

  const handleExportAnyList = () => {
    // AnyList format: item name,quantity,category
    const csv = groceryItems
      .filter(i => !i.checked)
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
    const uncheckedItems = groceryItems.filter(i => !i.checked);
    const text = uncheckedItems
      .map(item => `${item.name} (${item.quantity} ${item.unit})`)
      .join("\n");
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Grocery List${activeKid ? ` - ${activeKid.name}` : ""}`,
          text: text,
        });
        toast.success("Shared successfully!");
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

  // Group by category or aisle
  const itemsByGroup: Record<string, typeof filteredGroceryItems> = {};

  if (groupBy === "category") {
    // Group by category
    const categoryGroups: Record<FoodCategory, typeof filteredGroceryItems> = {
      protein: [],
      carb: [],
      dairy: [],
      fruit: [],
      vegetable: [],
      snack: [],
    };
    
    filteredGroceryItems.forEach(item => {
      categoryGroups[item.category].push(item);
    });

    Object.entries(categoryGroups).forEach(([category, items]) => {
      if (items.length > 0) {
        itemsByGroup[categoryLabels[category as FoodCategory]] = items;
      }
    });
  } else {
    // Group by aisle
    filteredGroceryItems.forEach(item => {
      const aisle = item.aisle || "Uncategorized";
      if (!itemsByGroup[aisle]) {
        itemsByGroup[aisle] = [];
      }
      itemsByGroup[aisle].push(item);
    });
  }

  const checkedCount = filteredGroceryItems.filter(i => i.checked).length;

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                Grocery List
              </h1>
              <p className="text-muted-foreground">
                {isFamilyMode 
                  ? "Household shopping list for all family members - auto-generated from meal plans"
                  : `Shopping list for ${activeKid?.name || 'your child'} - auto-generated from meal plan`
                }
              </p>
              <p className="text-sm text-accent mt-1 font-medium">
                ✓ Check items when purchased - they'll be added to your pantry automatically
              </p>
            </div>
          </div>
          
          {/* List Selector */}
          {userId && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setShowAddDialog(true)} variant="default">
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
            
            <Button onClick={() => setShowImportRecipeDialog(true)} variant="secondary">
              <FileText className="h-4 w-4 mr-2" />
              Import Recipe
            </Button>
            
            {/* Store Layout Manager Button */}
            {userId && (
              <Button
                onClick={() => setShowManageStoresDialog(true)}
                variant="outline"
              >
                <Store className="h-4 w-4 mr-2" />
                Store Layouts
              </Button>
            )}

            <Button
              onClick={handleSmartRestock}
              variant="secondary"
              disabled={isGeneratingRestock}
            >
              {isGeneratingRestock ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Smart Restock
                </>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={groceryItems.length === 0}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleExportText}>
                  <FileText className="h-4 w-4 mr-2" />
                  Copy as Text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShareiOS}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share (iOS/Android)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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

            <Button onClick={handleClearChecked} variant="outline" disabled={checkedCount === 0}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Checked
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Total Items</p>
            <p className="text-2xl font-bold">{filteredGroceryItems.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Checked</p>
            <p className="text-2xl font-bold text-safe-food">{checkedCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Remaining</p>
            <p className="text-2xl font-bold text-accent">{filteredGroceryItems.length - checkedCount}</p>
          </Card>
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

        {/* Grocery List */}
        {filteredGroceryItems.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Grocery List Yet</h3>
              <p className="text-muted-foreground">
                Create a meal plan first, and your grocery list will be automatically generated!
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* Group By Toggle */}
            <Card className="p-4 mb-6">
              <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as "category" | "aisle")}>
                <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
                  <TabsTrigger value="aisle">Group by Aisle</TabsTrigger>
                  <TabsTrigger value="category">Group by Category</TabsTrigger>
                </TabsList>
              </Tabs>
            </Card>

            <div className="space-y-6">
              {Object.entries(itemsByGroup).map(([group, items]) => {
                if (items.length === 0) return null;

                return (
                  <Card key={group} className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Badge variant="outline">{group}</Badge>
                      <span className="text-sm text-muted-foreground font-normal">
                        ({items.length})
                      </span>
                    </h3>
                    <div className="space-y-3">
                      {items.map(item => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                            item.checked 
                              ? "bg-safe-food/10 border border-safe-food/20" 
                              : "hover:bg-muted/50"
                          }`}
                        >
                          {/* Item Photo (if available) */}
                          {item.photo_url && (
                            <div className="shrink-0">
                              <img
                                src={item.photo_url}
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded-md border"
                              />
                            </div>
                          )}
                          
                          <Checkbox
                            checked={item.checked}
                            onCheckedChange={() => handleToggleItem(item.id)}
                            className="mt-1"
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                                  {item.name}
                                </p>
                                {item.brand_preference && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Brand: {item.brand_preference}
                                  </p>
                                )}
                                {item.barcode && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                    <Barcode className="h-3 w-3" />
                                    {item.barcode}
                                  </div>
                                )}
                                {item.notes && !item.checked && (
                                  <p className="text-xs text-muted-foreground mt-1 italic">
                                    Note: {item.notes}
                                  </p>
                                )}
                                {item.checked && (
                                  <p className="text-xs text-safe-food mt-1">
                                    ✓ Added to pantry
                                  </p>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground whitespace-nowrap">
                                {item.quantity} {item.unit}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

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
          
          {/* Store Layout Dialogs */}
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
          
          {/* Aisle Contribution Dialog */}
          <AisleContributionDialog
            open={showAisleContribution}
            onOpenChange={setShowAisleContribution}
            itemName={contributionItem || ""}
            storeLayoutId={selectedStoreLayoutId}
            userId={userId}
            onContribute={() => {
              // Reload mappings or update UI as needed
              toast.success("Thank you for helping the community! 🎉");
            }}
          />
          
          {/* Import Recipe Dialog */}
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
