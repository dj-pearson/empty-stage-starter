import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Food, FoodCategory } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface AddFoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (food: Omit<Food, "id">) => void;
  editFood?: Food | null;
}

const categories: { value: FoodCategory; label: string }[] = [
  { value: "protein", label: "Protein" },
  { value: "carb", label: "Carb" },
  { value: "dairy", label: "Dairy" },
  { value: "fruit", label: "Fruit" },
  { value: "vegetable", label: "Vegetable" },
  { value: "snack", label: "Snack" },
];

type NutritionItem = {
  id: string;
  name: string;
  category: string;
  serving_size?: string;
  package_quantity?: string;
  servings_per_container?: number;
  allergens?: string[];
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export function AddFoodDialog({
  open,
  onOpenChange,
  onSave,
  editFood,
}: AddFoodDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<NutritionItem[]>([]);
  const [selectedNutrition, setSelectedNutrition] = useState<NutritionItem | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<FoodCategory>("protein");
  const [isSafe, setIsSafe] = useState(true);
  const [isTryBite, setIsTryBite] = useState(false);
  const [aisle, setAisle] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("servings");
  const [servingsPerContainer, setServingsPerContainer] = useState<number | undefined>();
  const [packageQuantity, setPackageQuantity] = useState("");

  // Validation state
  const [nameError, setNameError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Search nutrition database as user types
  useEffect(() => {
    const searchNutrition = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('nutrition')
          .select('*')
          .ilike('name', `%${searchQuery}%`)
          .limit(10);

        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        logger.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchNutrition, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  useEffect(() => {
    if (editFood) {
      setName(editFood.name);
      setCategory(editFood.category);
      setIsSafe(editFood.is_safe);
      setIsTryBite(editFood.is_try_bite);
      setAisle(editFood.aisle || "");
      setQuantity(editFood.quantity || 0);
      setUnit(editFood.unit || "servings");
      setServingsPerContainer(editFood.servings_per_container);
      setPackageQuantity(editFood.package_quantity || "");
      setShowConfirmation(false);
      setSelectedNutrition(null);
      setSearchQuery("");
    } else {
      resetForm();
    }
  }, [editFood, open]);

  const resetForm = () => {
    setName("");
    setCategory("protein");
    setIsSafe(true); // Default to Safe Foods
    setIsTryBite(false);
    setAisle("");
    setQuantity(1);
    setUnit("servings");
    setServingsPerContainer(undefined);
    setPackageQuantity("");
    setShowConfirmation(false);
    setSelectedNutrition(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSelectNutrition = (item: NutritionItem) => {
    setSelectedNutrition(item);
    setName(item.name);
    setCategory(mapCategoryToFoodCategory(item.category));
    setPackageQuantity(item.package_quantity || "");
    setServingsPerContainer(item.servings_per_container);
    setSearchQuery("");
    setSearchResults([]);
    setShowConfirmation(true);
  };

  const mapCategoryToFoodCategory = (cat: string): FoodCategory => {
    const lower = cat.toLowerCase();
    if (lower.includes('protein') || lower.includes('meat')) return 'protein';
    if (lower.includes('carb') || lower.includes('pasta') || lower.includes('bread')) return 'carb';
    if (lower.includes('dairy') || lower.includes('cheese') || lower.includes('milk')) return 'dairy';
    if (lower.includes('fruit')) return 'fruit';
    if (lower.includes('veg')) return 'vegetable';
    return 'snack';
  };

  const handleSave = async () => {
    // Validate name
    if (!name.trim()) {
      setNameError("Food name is required");
      return;
    }
    setNameError("");
    setIsSaving(true);

    try {
      await onSave({
        name: name.trim(),
        category,
        is_safe: isSafe,
        is_try_bite: isTryBite,
        aisle: aisle.trim() || undefined,
        quantity,
        unit,
        servings_per_container: servingsPerContainer,
        package_quantity: packageQuantity || undefined,
      });

      resetForm();
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editFood ? "Edit Food" : "Add New Food"}</DialogTitle>
          <DialogDescription className="sr-only">Add or edit a food item with nutrition details and safety settings</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!editFood && !showConfirmation && (
            <div className="space-y-2">
              <Label>Search Nutrition Database</Label>
              <Command className="border rounded-md" shouldFilter={false}>
                <CommandInput
                  placeholder="Type at least 2 characters..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  {searchQuery.length < 2 && (
                    <CommandEmpty>Start typing to search…</CommandEmpty>
                  )}
                  {searchQuery.length >= 2 && isSearching && (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                  {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                    <CommandEmpty>No foods found.</CommandEmpty>
                  )}
                  {searchQuery.length >= 2 && !isSearching && searchResults.length > 0 && (
                    <CommandGroup>
                      {searchResults.map((item) => (
                        <CommandItem
                          key={item.id}
                          onSelect={() => handleSelectNutrition(item)}
                          className="cursor-pointer"
                          value={item.name}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.category}
                              {item.serving_size && ` • ${item.serving_size}`}
                              {item.package_quantity && ` • ${item.package_quantity}`}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
              <p className="text-xs text-muted-foreground">
                Search our nutrition database or manually enter food details below
              </p>
            </div>
          )}

          {showConfirmation && selectedNutrition && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Found in database: {selectedNutrition.name}</p>
                  {selectedNutrition.package_quantity && (
                    <p className="text-sm">Package: {selectedNutrition.package_quantity}</p>
                  )}
                  {selectedNutrition.servings_per_container && (
                    <p className="text-sm">Servings per container: {selectedNutrition.servings_per_container}</p>
                  )}
                  {selectedNutrition.allergens && selectedNutrition.allergens.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedNutrition.allergens.map(allergen => (
                        <Badge key={allergen} variant="destructive" className="text-xs">
                          {allergen}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Food Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError && e.target.value.trim()) {
                  setNameError("");
                }
              }}
              onBlur={() => {
                if (!name.trim()) {
                  setNameError("Food name is required");
                }
              }}
              placeholder="e.g., Chicken Nuggets"
              className={nameError ? "border-red-500 focus-visible:ring-red-500" : ""}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
              autoFocus
            />
            {nameError && (
              <p id="name-error" className="text-sm text-red-500 mt-1">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FoodCategory)}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aisle">Grocery Aisle (Optional)</Label>
            <Input
              id="aisle"
              value={aisle}
              onChange={(e) => setAisle(e.target.value)}
              placeholder="e.g., Frozen, Produce, Dairy"
            />
          </div>

          {packageQuantity && (
            <div className="space-y-2">
              <Label htmlFor="package">Package Details</Label>
              <Input
                id="package"
                value={packageQuantity}
                onChange={(e) => setPackageQuantity(e.target.value)}
                placeholder="e.g., 20 nuggets, 16 oz"
              />
            </div>
          )}

          {servingsPerContainer !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="servings">Servings Per Container</Label>
              <Input
                id="servings"
                type="number"
                min="1"
                value={servingsPerContainer}
                onChange={(e) => setServingsPerContainer(parseInt(e.target.value) || undefined)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity in Stock</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="quantity"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1"
                />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="h-10 w-10 p-0"
                  >
                    −
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity(q => q + 1)}
                    className="h-10 w-10 p-0"
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap">
                {[1, 2, 3, 5, 10].map(num => (
                  <Button
                    key={num}
                    type="button"
                    variant={quantity === num ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setQuantity(num)}
                    className="h-7 px-2 text-xs"
                  >
                    {num}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="servings">Servings</SelectItem>
                  <SelectItem value="packages">Packages</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                  <SelectItem value="oz">Ounces</SelectItem>
                  <SelectItem value="lbs">Pounds</SelectItem>
                  <SelectItem value="cups">Cups</SelectItem>
                  <SelectItem value="tbsp">Tablespoons</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="safe">Safe Food</Label>
            <Switch id="safe" checked={isSafe} onCheckedChange={setIsSafe} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="try">Try Bite</Label>
            <Switch id="try" checked={isTryBite} onCheckedChange={setIsTryBite} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSaving ? "Saving..." : editFood ? "Update" : "Add Food"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
