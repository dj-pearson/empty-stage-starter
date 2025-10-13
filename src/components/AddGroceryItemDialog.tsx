import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FoodCategory } from "@/types";
import { Plus, Camera, Barcode, StickyNote } from "lucide-react";
import { toast } from "sonner";

interface AddGroceryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: {
    name: string;
    quantity: number;
    unit: string;
    category: FoodCategory;
    aisle?: string;
    notes?: string;
    photo_url?: string;
    barcode?: string;
    brand_preference?: string;
  }) => void;
}

const categoryLabels: Record<FoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  dairy: "Dairy",
  fruit: "Fruits",
  vegetable: "Vegetables",
  snack: "Snacks",
};

export function AddGroceryItemDialog({ open, onOpenChange, onAdd }: AddGroceryItemDialogProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("servings");
  const [category, setCategory] = useState<FoodCategory>("snack");
  const [aisle, setAisle] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [barcode, setBarcode] = useState("");
  const [brandPreference, setBrandPreference] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Please enter an item name");
      return;
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    onAdd({
      name: name.trim(),
      quantity: qty,
      unit: unit.trim(),
      category,
      aisle: aisle.trim() || undefined,
      notes: notes.trim() || undefined,
      photo_url: photoUrl.trim() || undefined,
      barcode: barcode.trim() || undefined,
      brand_preference: brandPreference.trim() || undefined,
    });

    // Reset form
    setName("");
    setQuantity("1");
    setUnit("servings");
    setCategory("snack");
    setAisle("");
    setNotes("");
    setPhotoUrl("");
    setBarcode("");
    setBrandPreference("");
    setShowAdvanced(false);
    onOpenChange(false);
    toast.success("Item added to grocery list");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Grocery Item</DialogTitle>
          <DialogDescription>
            Add custom items to your grocery list with photos, notes, and more
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item-name">Item Name *</Label>
            <Input
              id="item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Milk, Bread, Eggs"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g., lbs, bottles"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FoodCategory)}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aisle">Aisle (Optional)</Label>
            <Input
              id="aisle"
              value={aisle}
              onChange={(e) => setAisle(e.target.value)}
              placeholder="e.g., Produce, Dairy"
            />
          </div>

          {/* Advanced Options Toggle */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full justify-start text-sm text-muted-foreground hover:text-primary"
          >
            {showAdvanced ? "Hide" : "Show"} Advanced Options
            <span className="ml-2 text-xs">(photos, notes, barcode)</span>
          </Button>

          {showAdvanced && (
            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-2">
                <Label htmlFor="photo-url" className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Photo URL (Optional)
                </Label>
                <Input
                  id="photo-url"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  type="url"
                />
                <p className="text-xs text-muted-foreground">
                  Paste a URL to a product image
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="barcode" className="flex items-center gap-2">
                  <Barcode className="h-4 w-4" />
                  Barcode (Optional)
                </Label>
                <Input
                  id="barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="123456789012"
                />
                <p className="text-xs text-muted-foreground">
                  Enter UPC/EAN for quick scanning in-store
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand Preference (Optional)</Label>
                <Input
                  id="brand"
                  value={brandPreference}
                  onChange={(e) => setBrandPreference(e.target.value)}
                  placeholder="e.g., Horizon Organic"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Get the whole milk version, not 2%"
                  rows={3}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
