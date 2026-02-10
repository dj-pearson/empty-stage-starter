import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Package } from "lucide-react";
import { Food, FoodCategory } from "@/types";

interface IngredientSelectorProps {
  foods: Food[];
  selectedFoodIds: string[];
  onSelectFood: (food: Food) => void;
  onAddCustom: (name: string) => void;
}

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  dairy: "Dairy",
  fruit: "Fruit",
  vegetable: "Vegetables",
  snack: "Snacks",
};

const CATEGORY_ORDER: FoodCategory[] = [
  "protein",
  "vegetable",
  "fruit",
  "carb",
  "dairy",
  "snack",
];

export function IngredientSelector({
  foods,
  selectedFoodIds,
  onSelectFood,
  onAddCustom,
}: IngredientSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Group foods by category, excluding already-selected
  const availableFoods = foods.filter((f) => !selectedFoodIds.includes(f.id));

  const groupedFoods = CATEGORY_ORDER.reduce((acc, category) => {
    const catFoods = availableFoods.filter((f) => f.category === category);
    if (catFoods.length > 0) {
      acc.push({ category, label: CATEGORY_LABELS[category], foods: catFoods });
    }
    return acc;
  }, [] as { category: FoodCategory; label: string; foods: Food[] }[]);

  const handleSelectFood = (food: Food) => {
    onSelectFood(food);
    // Keep open for multi-select
  };

  const handleAddCustom = () => {
    if (customName.trim()) {
      onAddCustom(customName.trim());
      setCustomName("");
      setShowCustomInput(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Ingredient
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search foods..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              <div className="py-2 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  No food found
                </p>
                {!showCustomInput ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCustomInput(true);
                      setCustomName(search);
                    }}
                  >
                    Add "{search}" as custom
                  </Button>
                ) : null}
              </div>
            </CommandEmpty>

            {groupedFoods.map((group) => (
              <CommandGroup key={group.category} heading={group.label}>
                {group.foods.map((food) => (
                  <CommandItem
                    key={food.id}
                    value={food.name}
                    onSelect={() => handleSelectFood(food)}
                    className="flex items-center justify-between"
                  >
                    <span>{food.name}</span>
                    {food.quantity !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Package className="h-3 w-3" />
                        {food.quantity}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {/* Custom ingredient option */}
            <CommandGroup heading="Other">
              <CommandItem
                value="__add_custom__"
                onSelect={() => setShowCustomInput(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add custom ingredient
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>

        {/* Custom name input */}
        {showCustomInput && (
          <div className="p-2 border-t flex gap-2">
            <Input
              placeholder="e.g. salt, olive oil..."
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" className="h-8" onClick={handleAddCustom}>
              Add
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
