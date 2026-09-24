import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Group foods by category, excluding already-selected. A Set keeps this
  // linear in the pantry size instead of pantry x selected.
  const groupedFoods = useMemo(() => {
    const selected = new Set(selectedFoodIds);
    const byCategory = new Map<FoodCategory, Food[]>();
    for (const food of foods) {
      if (selected.has(food.id)) continue;
      const list = byCategory.get(food.category);
      if (list) list.push(food);
      else byCategory.set(food.category, [food]);
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => ({
      category,
      label: t(`recipes.builder.category.${category}`, { defaultValue: CATEGORY_LABELS[category] }),
      foods: byCategory.get(category) ?? [],
    }));
  }, [foods, selectedFoodIds, t]);

  const trimmedSearch = search.trim();

  const addTyped = () => {
    if (!trimmedSearch) return;
    onAddCustom(trimmedSearch);
    setSearch("");
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
        <Button type="button" variant="outline" size="sm" className="gap-1.5 h-11 sm:h-9">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("recipes.builder.addIngredient", { defaultValue: "Add Ingredient" })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(300px,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={t("recipes.builder.searchFoods", { defaultValue: "Search foods..." })}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              <p className="py-2 text-center text-sm text-muted-foreground">
                {t("recipes.builder.noFood", { defaultValue: "No food found" })}
              </p>
            </CommandEmpty>

            {/* One tap to add exactly what was typed, whatever else matches. */}
            {trimmedSearch && (
              <CommandGroup forceMount>
                <CommandItem forceMount value={`__add__${trimmedSearch}`} onSelect={addTyped}>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("recipes.builder.addTyped", { defaultValue: 'Add "{{name}}"', name: trimmedSearch })}
                </CommandItem>
              </CommandGroup>
            )}

            {groupedFoods.map((group) => (
              <CommandGroup key={group.category} heading={group.label}>
                {group.foods.map((food) => (
                  <CommandItem
                    key={food.id}
                    value={food.name}
                    onSelect={() => onSelectFood(food)}
                    className="flex items-center justify-between"
                  >
                    <span>{food.name}</span>
                    {food.quantity !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Package className="h-3 w-3" aria-hidden="true" />
                        {food.quantity}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {!trimmedSearch && (
              <CommandGroup heading={t("recipes.builder.other", { defaultValue: "Other" })}>
                <CommandItem value="__add_custom__" onSelect={() => setShowCustomInput(true)}>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("recipes.builder.addCustom", { defaultValue: "Add custom ingredient" })}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        {/* Custom name input */}
        {showCustomInput && (
          <div className="p-2 border-t flex gap-2">
            <Input
              placeholder={t("recipes.builder.customPlaceholder", { defaultValue: "e.g. salt, olive oil..." })}
              aria-label={t("recipes.builder.customLabel", { defaultValue: "Custom ingredient" })}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
              className="h-10 text-sm"
              autoFocus
            />
            <Button type="button" size="sm" className="h-10" onClick={handleAddCustom}>
              {t("recipes.builder.add", { defaultValue: "Add" })}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
