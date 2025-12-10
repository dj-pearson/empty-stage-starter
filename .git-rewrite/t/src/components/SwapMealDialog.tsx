import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { Food, PlanEntry } from "@/types";

type SwapMealDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PlanEntry | null;
  foods: Food[];
  onSwap: (newFoodId: string) => void;
};

export const SwapMealDialog = ({ open, onOpenChange, entry, foods, onSwap }: SwapMealDialogProps) => {
  const [searchTerm, setSearchTerm] = useState("");

  if (!entry) return null;

  // Determine which foods to show based on meal slot
  const isTryBite = entry.meal_slot === "try_bite";
  const availableFoods = foods.filter(food => 
    isTryBite ? food.is_try_bite : food.is_safe
  );

  // Filter by search term
  const filteredFoods = availableFoods.filter(food =>
    food.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    food.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group by category
  const foodsByCategory: Record<string, Food[]> = {};
  filteredFoods.forEach(food => {
    if (!foodsByCategory[food.category]) {
      foodsByCategory[food.category] = [];
    }
    foodsByCategory[food.category].push(food);
  });

  const handleSwap = (foodId: string) => {
    onSwap(foodId);
    onOpenChange(false);
    setSearchTerm("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Swap {entry.meal_slot === "try_bite" ? "Try Bite" : "Meal"}</DialogTitle>
          <DialogDescription>
            Choose a {isTryBite ? "try bite" : "safe food"} to replace this meal
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search foods..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Foods by category */}
          <div className="space-y-4">
            {Object.keys(foodsByCategory).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No {isTryBite ? "try bite" : "safe"} foods found. Add some in the Pantry first.
              </p>
            ) : (
              Object.entries(foodsByCategory).map(([category, categoryFoods]) => (
                <div key={category}>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Badge variant="outline">{category}</Badge>
                    <span className="text-sm text-muted-foreground">
                      ({categoryFoods.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {categoryFoods.map(food => (
                      <Button
                        key={food.id}
                        variant="outline"
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => handleSwap(food.id)}
                      >
                        <div className="text-left">
                          <div className="font-medium">{food.name}</div>
                          {food.allergens && food.allergens.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              ⚠️ {food.allergens.join(", ")}
                            </div>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
