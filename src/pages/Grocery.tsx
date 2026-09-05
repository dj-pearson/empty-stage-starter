import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Helmet } from "react-helmet-async";
import { useFoods, useGrocery, useKids, usePlan, useRecipes, useInventory } from "@/contexts/AppContext";
import type { MovementItem, PurchasableGroceryItem } from "@/lib/movementBuilders";
import { countMissingForRecipe } from "@/lib/recipeShortfall";
import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AddGroceryItemDialog } from "@/components/AddGroceryItemDialog";
import { EditGroceryItemDialog } from "@/components/EditGroceryItemDialog";
import { SmartRestockSuggestions } from "@/components/SmartRestockSuggestions";
import { GroceryListSelector } from "@/components/GroceryListSelector";
import { CreateGroceryListDialog } from "@/components/CreateGroceryListDialog";
import { ManageGroceryListsDialog } from "@/components/ManageGroceryListsDialog";
import { CreateStoreLayoutDialog } from "@/components/CreateStoreLayoutDialog";
import { ManageStoreLayoutsDialog } from "@/components/ManageStoreLayoutsDialog";
import { ManageStoreAislesDialog } from "@/components/ManageStoreAislesDialog";
import { AisleContributionDialog } from "@/components/AisleContributionDialog";
import { ImportRecipeToGroceryDialog } from "@/components/ImportRecipeToGroceryDialog";
import { ScanReceiptDialog } from "@/components/ScanReceiptDialog";
import { generateGroceryList } from "@/lib/mealPlanner";
import { startOfWeek, endOfWeek, toISODate } from "@/lib/date-utils";
import {
  ShoppingCart, Trash2, Printer, Download, Plus, Share2, FileText,
  Sparkles, Store, Barcode, RefreshCw, ChevronDown, ChevronRight,
  X, Minus, Check, MoreHorizontal, PackageCheck, ShoppingBag, Pencil
} from "lucide-react";
import { toast } from "sonner";
import { GroceryItem } from "@/types";
import {
  categoryLabel,
  filterItemsByList,
  splitByChecked,
  computeProgressPercent,
  milestoneMessage,
  groupItems,
  flattenGroupedRows,
  planRegenerationFromPlan,
} from "@/lib/groceryData";
import { supabase } from "@/integrations/supabase/client";
import { parseGroceryItemRows } from "@/lib/normalizeEntities";
import { logger } from "@/lib/logger";

// Extended type for grocery items with additional database properties
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

// Grocery data derivations (labels, grouping, split, progress, flatten) live in
// src/lib/groceryData.ts (unit-tested) so they're separated from this JSX and
// the heavy list subtree can memoize on stable outputs (US-553 AC2).

/**
 * The check-off control, sized for a thumb (US-767).
 *
 * The shadcn Checkbox is h-4 w-4 by default and this page overrode it to h-6
 * w-6, which measured 24px against Apple's and Google's 44px floor -- on the
 * one control a shopper uses standing in an aisle holding a phone in one hand.
 * 44px below sm, back to a tidy 24 on a pointer device where precision is free.
 */
const GROCERY_CHECKBOX_CLASS = "shrink-0 h-11 w-11 sm:h-6 sm:w-6";

export default function Grocery() {
  const { t } = useTranslation();
  const { foods, addFood, updateFood } = useFoods();
  // US-672: with writes on, checkout appends purchase movements and the pantry
  // is credited by the ledger rather than by the per-item toggle.
  const { ledgerWritesEnabled, recordPurchases, recordPurchaseReversal } = useInventory();
  const { kids, activeKidId } = useKids();
  const { planEntries } = usePlan();
  const {
    groceryItems,
    setGroceryItems, addGroceryItem, toggleGroceryItem,
    updateGroceryItem, deleteGroceryItem, deleteGroceryItems,
    addGroceryItemsMerged, clearCheckedGroceryItems
  } = useGrocery();
  const { recipes } = useRecipes();

  const [groupBy, setGroupBy] = useState<"category" | "aisle">("aisle");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showScanReceipt, setShowScanReceipt] = useState(false);
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);
  const [isGeneratingRestock, setIsGeneratingRestock] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  // US-714: which list owns the rows whose grocery_list_id is null.
  const [defaultListId, setDefaultListId] = useState<string | null>(null);
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

  // US-712: there is deliberately no mount-time cleanup of checked rows.
  // This used to delete every checked item on load and toast "already added to
  // your pantry", which was false twice over: nothing had been credited, and a
  // shopper who reloaded mid-trip lost the record of what they had already put
  // in the cart. Checked rows now live in the Purchased section until the
  // explicit checkout below, which is the only path that credits the pantry and
  // the only path that removes them.

  const isFamilyMode = !activeKidId;
  const activeKid = kids.find(k => k.id === activeKidId);

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

  // Progress calculation
  const totalItems = filteredGroceryItems.length;
  const purchasedCount = purchasedItems.length;
  const progressPercent = useMemo(
    () => computeProgressPercent(totalItems, purchasedCount),
    [totalItems, purchasedCount]
  );

  // Milestone message based on progress percentage
  const milestone = useMemo(() => milestoneMessage(progressPercent), [progressPercent]);

  // US-713: the days a sync shops for. The Grocery page has no week picker, so
  // the visible week is the current one. When the planner grows range and month
  // views (US-743) this is the single place that has to learn about them.
  const shoppingWindow = useMemo(() => {
    const now = new Date();
    return { from: toISODate(startOfWeek(now)), to: toISODate(endOfWeek(now)) };
  }, []);

  // US-713: sync from the meal plan, persisted.
  //
  // This used to end in setGroceryItems, which is local state only: the list
  // looked right until a reload, never reached the server, and never reached a
  // partner's phone. New rows now go through addGroceryItemsMerged (one insert,
  // stamped with the list, auto_generated and the plan entry that caused them)
  // and rows the plan no longer calls for go through deleteGroceryItems.
  //
  // Quantities here are still one-per-meal counts, not recipe-aware amounts.
  // US-736 replaces the arithmetic; this story makes the path persist.
  const handleRegenerateFromPlan = useCallback(() => {
    if (planEntries.length === 0) {
      toast.info("No meal plan found", { description: "Create a meal plan first to generate a grocery list" });
      return;
    }
    const filteredEntries = isFamilyMode
      ? planEntries
      : planEntries.filter(e => e.kid_id === activeKidId);

    // Shop for the week on screen, not for the whole 120-day context window.
    const generated = generateGroceryList(filteredEntries, foods, shoppingWindow);
    if (generated.length === 0) {
      toast.info("Nothing to add", {
        description: "Every meal planned for this week is already covered by your pantry and list",
      });
      return;
    }

    const plan = planRegenerationFromPlan({
      existing: groceryItems,
      generated,
      selectedListId,
      defaultListId,
    });

    if (plan.retireIds.length > 0) deleteGroceryItems(plan.retireIds);
    const touched = plan.additions.length > 0
      ? addGroceryItemsMerged(plan.additions, { defaultListId })
      : 0;

    if (touched === 0 && plan.retireIds.length === 0) {
      toast.info("Already up to date", {
        description: `This week's plan is already on your list (${plan.preservedCount} item${plan.preservedCount === 1 ? '' : 's'} kept)`,
      });
      return;
    }

    toast.success(`Added ${touched} item${touched === 1 ? '' : 's'} from meal plan`, {
      description: plan.retireIds.length > 0
        ? `Removed ${plan.retireIds.length} no longer planned, kept ${plan.preservedCount}`
        : `Kept ${plan.preservedCount} existing item${plan.preservedCount === 1 ? '' : 's'}`,
    });
  }, [
    planEntries, isFamilyMode, activeKidId, foods, shoppingWindow, groceryItems,
    selectedListId, defaultListId, deleteGroceryItems, addGroceryItemsMerged,
  ]);

  const handleToggleItem = useCallback(async (itemId: string) => {
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

      // US-672 criterion 3: when the ledger is doing the crediting, checking a
      // row off is just marking it bought. The pantry is credited once, by the
      // same action that closes the rows (handleDoneShopping), rather than
      // drifting in item by item as the parent walks the aisles. Crediting here
      // as well would credit twice.
      if (ledgerWritesEnabled) return;

      // Add/update pantry inventory
      const existingFood = foods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
      let pantryUpdated = true;
      if (existingFood) {
        updateFood(existingFood.id, {
          ...existingFood,
          quantity: (existingFood.quantity || 0) + item.quantity,
          unit: item.unit
        });
      } else {
        pantryUpdated = await addFood({
          name: item.name,
          category: item.category,
          is_safe: true,
          is_try_bite: false,
          aisle: item.aisle,
          quantity: item.quantity,
          unit: item.unit
        });
      }

      if (pantryUpdated) {
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
      }
      // If pantry add was blocked by plan limit, the upgrade modal already fired.
      // The grocery item remains checked so the user can finish shopping; on upgrade
      // they can re-check to sync to pantry.
    } else {
      // Unchecking. Nothing to take back when nothing was credited yet.
      if (ledgerWritesEnabled) return;
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
  }, [groceryItems, toggleGroceryItem, selectedStoreLayoutId, userId, foods, updateFood, addFood, ledgerWritesEnabled]);

  const handleDeleteItem = useCallback((itemId: string) => {
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
  }, [groceryItems, deleteGroceryItem, addGroceryItem]);

  const handleQuantityChange = useCallback((itemId: string, delta: number) => {
    const item = groceryItems.find(i => i.id === itemId);
    if (!item) return;
    const newQty = Math.max(1, item.quantity + delta);
    updateGroceryItem(itemId, { quantity: newQty });
  }, [groceryItems, updateGroceryItem]);

  // US-282, amended by US-672: checkout.
  //
  // Two shapes, chosen by the writes flag.
  //
  //   flag OFF  the shipped behaviour. The per-item toggle already credited
  //             the pantry, so this only sweeps the bought rows off the list.
  //   flag ON   criterion 3. The toggle credited nothing; this one action
  //             appends a purchase movement per checked row AND closes the
  //             rows, so the pantry is credited before the car is unloaded
  //             instead of by a separate "move completed to pantry" chore.
  //
  // Rows the ledger cannot take (no matching pantry item, or a unit with no
  // conversion) fall back to the legacy credit rather than being dropped: a
  // shop that recorded half of itself would be worse than one that recorded
  // none of it.
  const handleDoneShopping = useCallback(async () => {
    if (ledgerWritesEnabled && purchasedItems.length > 0) {
      const { skipped } = await recordPurchases(
        purchasedItems as unknown as PurchasableGroceryItem[],
        foods as unknown as MovementItem[],
      );
      for (const failure of skipped) {
        logger.warn('US-672: grocery row not recorded as a purchase movement', {
          reason: failure.reason,
          itemId: failure.itemId,
        });
      }
      // The legacy credit, for exactly the rows the ledger declined.
      const skippedItemIds = new Set(skipped.map((f) => f.itemId).filter(Boolean));
      for (const item of purchasedItems) {
        const existingFood = foods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
        const wasSkipped = !existingFood || skippedItemIds.has(existingFood.id);
        if (!wasSkipped) continue;
        if (existingFood) {
          updateFood(existingFood.id, {
            ...existingFood,
            quantity: (existingFood.quantity || 0) + item.quantity,
            unit: item.unit,
          });
        } else {
          await addFood({
            name: item.name,
            category: item.category,
            is_safe: true,
            is_try_bite: false,
            aisle: item.aisle,
            quantity: item.quantity,
            unit: item.unit,
          });
        }
      }
    }

    const moved = purchasedItems.map(item => ({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      aisle: item.aisle,
      // US-713: is_manual was never a column -- it lived on a local interface
      // only, so this carried undefined and wrote nothing. The persisted pair
      // is what an undo has to restore, or a plan-generated row comes back as a
      // hand-added one that no later sync will retire.
      auto_generated: item.auto_generated,
      source_plan_entry_id: item.source_plan_entry_id,
      added_via: item.added_via,
      source_recipe_id: item.source_recipe_id,
      // US-714: without this an undone checkout puts every row back on the
      // default list, off whichever list the shopper actually bought it from.
      grocery_list_id: item.grocery_list_id,
    }));
    if (moved.length === 0) return;

    // US-292: snapshot missing-counts BEFORE the per-item toggle pantry sync
    // has fully drained, then re-derive AFTER. Plan entries that had
    // missingCount > 0 and now have 0 are the ones whose badges cleared.
    // The per-item toggle (handleToggleItem) updates `foods` synchronously,
    // so by the time `handleDoneShopping` is called the post-state is current.
    // We still need the pre-state — derive from the foods snapshot at the
    // moment the recipes / planEntries / foods closure was captured by this
    // useCallback. AppContext re-creates this closure when foods change, so
    // the "pre" state is what we have right now; we reconstruct a hypothetical
    // pre-state by subtracting the moved items from each matched food.
    const reconstructPreFoods = () => {
      const lookup = new Map(foods.map(f => [f.name.toLowerCase(), f]));
      const adjusted = foods.map(f => ({ ...f }));
      for (const item of moved) {
        const food = lookup.get(item.name.toLowerCase());
        if (!food) continue;
        const target = adjusted.find(f => f.id === food.id);
        if (target) {
          target.quantity = Math.max(0, (target.quantity ?? 0) - (item.quantity ?? 1));
        }
      }
      return adjusted;
    };
    const preFoods = reconstructPreFoods();

    const recipeIdsInPlan = new Set(
      planEntries.filter(p => p.recipe_id).map(p => p.recipe_id!)
    );
    let plan_entries_cleared = 0;
    for (const recipeId of recipeIdsInPlan) {
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) continue;
      const before = countMissingForRecipe(recipe, preFoods);
      const after = countMissingForRecipe(recipe, foods);
      if (before > 0 && after === 0) plan_entries_cleared++;
    }
    if (plan_entries_cleared > 0) {
      analytics.trackEvent("missing_flags_cleared_after_pantry_move", {
        plan_entries_cleared,
        items_moved: moved.length,
      });
    }

    clearCheckedGroceryItems();
    setPurchasedOpen(false);

    toast.success(`Moved ${moved.length} item${moved.length === 1 ? '' : 's'} to pantry`, {
      description: 'Bought items committed to your inventory',
      action: {
        label: 'Undo',
        onClick: () => {
          // US-672: when the ledger did the crediting, take it back the same
          // way -- an appended correction that negates each purchase. A direct
          // decrement of foods.quantity would be translated by the US-668
          // trigger into a correction of its own, so doing both would take the
          // shop back twice.
          // Re-insert each grocery row as active, so the user can re-check it.
          // One definition for both paths: duplicating the payload duplicates
          // every type error in it too, which is how US-672's first version
          // pushed the typecheck ratchet one over its baseline.
          const restoreGroceryRows = () => {
            moved.forEach(item => {
              addGroceryItem({
                name: item.name,
                category: item.category,
                quantity: item.quantity,
                unit: item.unit,
                aisle: item.aisle,
                auto_generated: item.auto_generated,
                source_plan_entry_id: item.source_plan_entry_id,
                added_via: item.added_via,
                source_recipe_id: item.source_recipe_id,
                grocery_list_id: item.grocery_list_id,
              });
            });
          };

          if (ledgerWritesEnabled) {
            // purchasedItems, not `moved`: `moved` is a projection that drops
            // the grocery row id, and without it the reversal loses the
            // ref_id that ties it back to the purchase it cancels.
            void recordPurchaseReversal(
              purchasedItems as unknown as PurchasableGroceryItem[],
              foods as unknown as MovementItem[],
            );
            restoreGroceryRows();
            return;
          }

          // Legacy path: restore the rows AND decrement the pantry food the
          // toggle incremented. Best-effort: name-based pantry match is
          // consistent with the toggle path; if no matching food is found we
          // skip the decrement and just restore the grocery row.
          restoreGroceryRows();
          moved.forEach(item => {
            const food = foods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
            if (food && food.quantity) {
              updateFood(food.id, {
                ...food,
                quantity: Math.max(0, food.quantity - item.quantity),
              });
            }
          });
        },
      },
    });
  }, [purchasedItems, clearCheckedGroceryItems, addGroceryItem, foods, updateFood, addFood, recipes, planEntries, ledgerWritesEnabled, recordPurchases, recordPurchaseReversal]);

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
        setGroceryItems(parseGroceryItemRows(groceryData));
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
        `${categoryLabel(item.category)},"${item.name}",${item.quantity},${item.unit},"${item.aisle || ""}","To Buy"`
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
      .map(item => `"${item.name}","${item.quantity} ${item.unit}","${item.aisle || categoryLabel(item.category)}"`)
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
  const activeItemsByGroup = useMemo(
    () => groupItems(activeItems, groupBy),
    [activeItems, groupBy]
  );

  // Virtualization for large grocery lists (>50 items): flatten grouped items
  // into rows (each row is either a group header or an item).
  const flattenedRows = useMemo(
    () => flattenGroupedRows(activeItemsByGroup),
    [activeItemsByGroup]
  );

  const useVirtualGrocery = activeItems.length > 50;
  const groceryListParentRef = useRef<HTMLDivElement>(null);
  const groceryVirtualizer = useVirtualizer({
    count: useVirtualGrocery ? flattenedRows.length : 0,
    getScrollElement: () => groceryListParentRef.current,
    // US-636: first-paint guess only. Rows report their real height back via
    // measureElement, because no constant covers all of them. Measured in
    // Chromium: an item row is 53px bare, 65px with a w-10 photo, and 69px on
    // a coarse pointer, where src/index.css:215 forces every button to a 44px
    // minimum. Against this 56px guess that used to place each row closer than
    // it rendered, and the error compounded down the list: 11 overlapping row
    // pairs with a mouse, and all 22 on touch, the worst by 13px.
    estimateSize: (index) => {
      if (!useVirtualGrocery) return 0;
      const row = flattenedRows[index];
      return row.type === "header" ? 48 : 56;
    },
    overscan: 10,
  });

  const isEmpty = activeItems.length === 0 && purchasedItems.length === 0;

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <Helmet>
        <title>Grocery List - EatPal</title>
        <meta name="description" content="Manage your grocery shopping list with smart suggestions and store organization" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto px-4 py-6 max-w-3xl">

        {/* ─── Header ─── */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{t('grocery.title')}</h1>
                <p className="text-sm text-muted-foreground">
                  {isFamilyMode ? t('grocery.subtitleFamily') : t('grocery.subtitleChild', { name: activeKid?.name || 'your child' })}
                </p>
              </div>
            </div>

            {/* More options menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0" aria-label="More options">
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
                onDefaultListChange={setDefaultListId}
              />
            </div>
          )}

          {/* Progress Bar - only show when shopping */}
          {totalItems > 0 && (
            <div className="mb-4" aria-live="polite">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Shopping progress
                </span>
                <span className="text-sm font-semibold">
                  {purchasedCount} of {totalItems} items ({progressPercent}%)
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center justify-between mt-2">
                {milestone && (
                  <p className={`text-sm font-medium ${progressPercent >= 100 ? "text-primary" : "text-muted-foreground"}`}>
                    {milestone}
                  </p>
                )}
                {progressPercent === 100 && (
                  <p className="text-sm text-primary font-medium">
                    Tap "Done Shopping" below to clear your list.
                  </p>
                )}
              </div>
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
          <Button onClick={() => setShowScanReceipt(true)} variant="secondary" size="sm">
            <Barcode className="h-4 w-4 mr-1.5" />
            Scan Receipt
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
                // US-714: stamp the list on screen, or the row lands with a
                // null list id and is hidden the moment a list is selected.
                items.forEach(item =>
                  addGroceryItem({ ...item, grocery_list_id: selectedListId ?? undefined }),
                );
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
              useVirtualGrocery ? (
              /* Virtualized rendering for large lists (>50 items) */
              <div
                ref={groceryListParentRef}
                className="mb-6 overflow-auto rounded-xl border"
                style={{ maxHeight: "70vh" }}
                aria-live="polite"
              >
                <div
                  style={{
                    height: `${groceryVirtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  {groceryVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = flattenedRows[virtualRow.index];
                    if (row.type === "header") {
                      return (
                        <div
                          key={`header-${row.group}`}
                          data-index={virtualRow.index}
                          ref={groceryVirtualizer.measureElement}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{row.group}</span>
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {row.count}
                            </Badge>
                          </div>
                        </div>
                      );
                    }
                    const item = row.item;
                    return (
                      <div
                        key={item.id}
                        data-index={virtualRow.index}
                        ref={groceryVirtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group border-b"
                      >
                        <Checkbox
                          checked={false}
                          onCheckedChange={() => handleToggleItem(item.id)}
                          aria-label={`Check off ${item.name}`}
                          className={GROCERY_CHECKBOX_CLASS}
                        />
                        {item.photo_url && (
                          <img
                            src={item.photo_url}
                            alt={item.name}
                            className="w-10 h-10 object-cover rounded-md border shrink-0"
                          />
                        )}
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
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 sm:h-7 sm:w-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity"
                            onClick={() => handleQuantityChange(item.id, -1)}
                            disabled={item.quantity <= 1}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium w-16 text-center tabular-nums">
                            {item.quantity} {item.unit}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 sm:h-7 sm:w-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity"
                            onClick={() => handleQuantityChange(item.id, 1)}
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 sm:h-7 sm:w-7 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingItem(item)}
                          aria-label="Edit item"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 sm:h-7 sm:w-7 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteItem(item.id)}
                          aria-label="Delete item"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              ) : (
              /* Non-virtualized rendering for small lists (<=50 items) */
              <div className="space-y-3 mb-6" aria-live="polite">
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
                              aria-label={`Check off ${item.name}`}
                              className={GROCERY_CHECKBOX_CLASS}
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
                                className="h-11 w-11 sm:h-7 sm:w-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity"
                                onClick={() => handleQuantityChange(item.id, -1)}
                                disabled={item.quantity <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-sm font-medium w-16 text-center tabular-nums">
                                {item.quantity} {item.unit}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 sm:h-7 sm:w-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity"
                                onClick={() => handleQuantityChange(item.id, 1)}
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>

                            {/* Edit button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 sm:h-7 sm:w-7 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                              onClick={() => setEditingItem(item)}
                              aria-label="Edit item"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {/* Delete button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 sm:h-7 sm:w-7 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteItem(item.id)}
                              aria-label="Delete item"
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
            )
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
                  Move {purchasedItems.length} to pantry
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
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDoneShopping();
                      }}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Move to pantry
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
                            aria-label={`Put ${item.name} back on the list`}
                            className={GROCERY_CHECKBOX_CLASS}
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

            {/* ─── US-282: Move completed to pantry (floating) ─── */}
            {purchasedItems.length > 0 && activeItems.length > 0 && (
              <div className="fixed bottom-24 md:bottom-8 left-0 right-0 flex justify-center z-30 pointer-events-none">
                <Button
                  onClick={handleDoneShopping}
                  size="lg"
                  className="shadow-lg pointer-events-auto rounded-full px-6"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Move {purchasedItems.length} to pantry
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
        selectedListId={selectedListId}
      />

      <EditGroceryItemDialog
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
        item={editingItem}
        onSave={(id, updates) => updateGroceryItem(id, updates)}
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

      <ScanReceiptDialog
        open={showScanReceipt}
        onClose={() => setShowScanReceipt(false)}
      />
    </div>
  );
}
