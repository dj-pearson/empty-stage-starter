import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Food, FoodCategory } from "@/types";

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

export function AddFoodDialog({
  open,
  onOpenChange,
  onSave,
  editFood,
}: AddFoodDialogProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FoodCategory>("protein");
  const [isSafe, setIsSafe] = useState(true);
  const [isTryBite, setIsTryBite] = useState(false);
  const [aisle, setAisle] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState("servings");

  useEffect(() => {
    if (editFood) {
      setName(editFood.name);
      setCategory(editFood.category);
      setIsSafe(editFood.is_safe);
      setIsTryBite(editFood.is_try_bite);
      setAisle(editFood.aisle || "");
      setQuantity(editFood.quantity || 0);
      setUnit(editFood.unit || "servings");
    } else {
      setName("");
      setCategory("protein");
      setIsSafe(true);
      setIsTryBite(false);
      setAisle("");
      setQuantity(0);
      setUnit("servings");
    }
  }, [editFood, open]);

  const handleSave = () => {
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      category,
      is_safe: isSafe,
      is_try_bite: isTryBite,
      aisle: aisle.trim() || undefined,
      quantity,
      unit,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editFood ? "Edit Food" : "Add New Food"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Food Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Chicken Nuggets"
            />
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity in Stock</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="servings">Servings</SelectItem>
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
          <Button onClick={handleSave} disabled={!name.trim()}>
            {editFood ? "Update" : "Add Food"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
