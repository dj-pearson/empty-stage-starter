import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { generateGroceryList } from "@/lib/mealPlanner";
import { ShoppingCart, Copy, Trash2, Printer, Download } from "lucide-react";
import { toast } from "sonner";
import { FoodCategory } from "@/types";

const categoryLabels: Record<FoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  dairy: "Dairy",
  fruit: "Fruits",
  vegetable: "Vegetables",
  snack: "Snacks",
};

export default function Grocery() {
  const { foods, kids, activeKidId, planEntries, groceryItems, setGroceryItems, toggleGroceryItem, clearCheckedGroceryItems } = useApp();
  const [groupBy, setGroupBy] = useState<"category" | "aisle">("aisle");

  const activeKid = kids.find(k => k.id === activeKidId);

  useEffect(() => {
    if (planEntries.length > 0 && activeKidId) {
      // Filter plan entries for active kid only
      const kidPlanEntries = planEntries.filter(e => e.kid_id === activeKidId);
      const newList = generateGroceryList(kidPlanEntries, foods);
      setGroceryItems(newList);
    }
  }, [planEntries, foods, activeKidId]);

  const handleCopyList = () => {
    const text = groceryItems
      .map(item => `${item.checked ? "☑" : "☐"} ${item.name} (${item.quantity} ${item.unit})`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("List copied to clipboard!");
  };

  const handleClearChecked = () => {
    clearCheckedGroceryItems();
    toast.success("Checked items cleared");
  };

  const handlePrint = () => {
    window.print();
    toast.success("Print dialog opened");
  };

  const handleExport = () => {
    const csv = [
      "Category,Item,Quantity,Unit,Checked",
      ...groceryItems.map(item => 
        `${categoryLabels[item.category]},"${item.name}",${item.quantity},${item.unit},${item.checked ? "Yes" : "No"}`
      )
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grocery-list-${activeKid?.name || "list"}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Grocery list exported!");
  };

  // Group by category or aisle
  const itemsByGroup: Record<string, typeof groceryItems> = {};

  if (groupBy === "category") {
    // Group by category
    const categoryGroups: Record<FoodCategory, typeof groceryItems> = {
      protein: [],
      carb: [],
      dairy: [],
      fruit: [],
      vegetable: [],
      snack: [],
    };
    
    groceryItems.forEach(item => {
      categoryGroups[item.category].push(item);
    });

    Object.entries(categoryGroups).forEach(([category, items]) => {
      if (items.length > 0) {
        itemsByGroup[categoryLabels[category as FoodCategory]] = items;
      }
    });
  } else {
    // Group by aisle
    groceryItems.forEach(item => {
      const aisle = item.aisle || "Uncategorized";
      if (!itemsByGroup[aisle]) {
        itemsByGroup[aisle] = [];
      }
      itemsByGroup[aisle].push(item);
    });
  }

  const checkedCount = groceryItems.filter(i => i.checked).length;

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Grocery List
              {activeKid && <span className="text-primary"> - {activeKid.name}</span>}
            </h1>
            <p className="text-muted-foreground">
              Auto-generated from your meal plan
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleCopyList} variant="outline" disabled={groceryItems.length === 0}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button onClick={handleExport} variant="outline" disabled={groceryItems.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={handlePrint} variant="outline" disabled={groceryItems.length === 0}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
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
            <p className="text-2xl font-bold">{groceryItems.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Checked</p>
            <p className="text-2xl font-bold text-safe-food">{checkedCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Remaining</p>
            <p className="text-2xl font-bold text-accent">{groceryItems.length - checkedCount}</p>
          </Card>
        </div>

        {/* Grocery List */}
        {groceryItems.length === 0 ? (
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
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            checked={item.checked}
                            onCheckedChange={() => toggleGroceryItem(item.id)}
                          />
                          <div className="flex-1">
                            <p className={`font-medium ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                              {item.name}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.quantity} {item.unit}
                          </p>
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
    </div>
  );
}
