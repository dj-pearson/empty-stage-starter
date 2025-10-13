import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FoodCategory } from "@/types";
import { Plus, Camera, Barcode, StickyNote, Search, Package, AlertTriangle, Sparkles, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";

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
    is_family_item?: boolean;
  }) => void;
}

interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
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
  const { foods } = useApp();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("servings");
  const [category, setCategory] = useState<FoodCategory>("snack");
  const [aisle, setAisle] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [barcode, setBarcode] = useState("");
  const [brandPreference, setBrandPreference] = useState("");
  const [isFamilyItem, setIsFamilyItem] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Barcode lookup states
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);
  const [lookupSource, setLookupSource] = useState<string | null>(null);
  
  // Pantry inventory states
  const [pantryItem, setPantryItem] = useState<PantryItem | null>(null);
  const [pantryQuantity, setPantryQuantity] = useState(0);
  const [additionalQuantity, setAdditionalQuantity] = useState("1");

  // Check pantry when name changes
  useEffect(() => {
    if (name.trim().length > 2) {
      const existingFood = foods.find(f => 
        f.name.toLowerCase() === name.trim().toLowerCase()
      );
      
      if (existingFood) {
        setPantryItem({
          id: existingFood.id,
          name: existingFood.name,
          quantity: existingFood.quantity || 0,
          unit: existingFood.unit || "servings",
          category: existingFood.category
        });
        setPantryQuantity(existingFood.quantity || 0);
        setUnit(existingFood.unit || "servings");
        setCategory(existingFood.category);
      } else {
        setPantryItem(null);
        setPantryQuantity(0);
      }
    } else {
      setPantryItem(null);
      setPantryQuantity(0);
    }
  }, [name, foods]);

  const handleBarcodeChange = (value: string) => {
    setBarcode(value);
    setLookupSource(null);
  };

  const handleLookupBarcode = async () => {
    if (!barcode.trim()) {
      toast.error("Please enter a barcode");
      return;
    }

    setIsLookingUpBarcode(true);
    try {
      const { data, error } = await supabase.functions.invoke('lookup-barcode', {
        body: { barcode: barcode.trim() }
      });

      if (error) throw error;

      if (data.success && data.food) {
        const food = data.food;
        setName(food.name);
        setCategory(food.category.toLowerCase() as FoodCategory);
        
        if (food.package_quantity) setUnit(food.package_quantity);
        if (food.allergens?.length > 0) {
          setNotes(prev => {
            const allergenNote = `Allergens: ${food.allergens.join(', ')}`;
            return prev ? `${prev}\n${allergenNote}` : allergenNote;
          });
        }
        
        setLookupSource(food.source);
        
        // If item exists in pantry, show the inventory info
        if (food.in_pantry && food.existing_quantity !== undefined) {
          toast.success(`Found in pantry! Current stock: ${food.existing_quantity} ${food.existing_unit}`, {
            description: `Add more to reach your desired quantity`
          });
        } else {
          toast.success(`Product found: ${food.name}`, {
            description: `Source: ${food.source}`
          });
        }
      } else {
        toast.error("Product not found", {
          description: "Try entering details manually or use a different barcode"
        });
      }
    } catch (error) {
      console.error('Barcode lookup error:', error);
      toast.error("Failed to lookup barcode");
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Please enter an item name");
      return;
    }

    let finalQuantity: number;
    
    if (pantryItem) {
      // If item exists in pantry, use the additional quantity
      const additionalQty = parseInt(additionalQuantity);
      if (isNaN(additionalQty) || additionalQty <= 0) {
        toast.error("Please enter a valid quantity to purchase");
        return;
      }
      finalQuantity = additionalQty;
    } else {
      // New item
      const qty = parseInt(quantity);
      if (isNaN(qty) || qty <= 0) {
        toast.error("Please enter a valid quantity");
        return;
      }
      finalQuantity = qty;
    }

    onAdd({
      name: name.trim(),
      quantity: finalQuantity,
      unit: unit.trim(),
      category,
      aisle: aisle.trim() || undefined,
      notes: notes.trim() || undefined,
      photo_url: photoUrl.trim() || undefined,
      barcode: barcode.trim() || undefined,
      brand_preference: brandPreference.trim() || undefined,
      is_family_item: isFamilyItem,
    });

    // Reset form
    setName("");
    setQuantity("1");
    setAdditionalQuantity("1");
    setUnit("servings");
    setCategory("snack");
    setAisle("");
    setNotes("");
    setPhotoUrl("");
    setBarcode("");
    setBrandPreference("");
    setIsFamilyItem(false);
    setShowAdvanced(false);
    setPantryItem(null);
    setPantryQuantity(0);
    setLookupSource(null);
    onOpenChange(false);
    toast.success("Item added to grocery list");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Add Grocery Item
          </DialogTitle>
          <DialogDescription>
            Scan barcode or enter manually. We'll check your pantry inventory automatically.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Barcode Lookup Section */}
          <Card className="p-4 bg-muted/50">
            <div className="space-y-3">
              <Label htmlFor="barcode-input" className="flex items-center gap-2 text-sm font-medium">
                <Barcode className="h-4 w-4" />
                Quick Barcode Lookup (Optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="barcode-input"
                  value={barcode}
                  onChange={(e) => handleBarcodeChange(e.target.value)}
                  placeholder="Enter or scan barcode"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLookupBarcode();
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={handleLookupBarcode}
                  disabled={!barcode.trim() || isLookingUpBarcode}
                  variant="secondary"
                >
                  {isLookingUpBarcode ? (
                    <>
                      <Search className="h-4 w-4 mr-2 animate-spin" />
                      Looking up...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Lookup
                    </>
                  )}
                </Button>
              </div>
              {lookupSource && (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  Found in {lookupSource}
                </Badge>
              )}
            </div>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="item-name">Item Name *</Label>
            <Input
              id="item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Milk, Bread, Eggs"
              autoFocus={!barcode}
            />
          </div>
          
          {/* Pantry Inventory Alert */}
          {pantryItem && (
            <Card className="p-4 border-primary/50 bg-primary/5">
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="font-medium text-sm">Found in Pantry!</div>
                  <div className="text-sm text-muted-foreground">
                    Current stock: <strong>{pantryQuantity} {unit}</strong>
                  </div>
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="pantry-adjust" className="text-xs">
                      Adjust current quantity or purchase additional:
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="pantry-quantity"
                        type="number"
                        min="0"
                        value={pantryQuantity}
                        onChange={(e) => setPantryQuantity(parseInt(e.target.value) || 0)}
                        className="w-24"
                      />
                      <span className="flex items-center text-sm text-muted-foreground">
                        +
                      </span>
                      <Input
                        id="additional-quantity"
                        type="number"
                        min="0"
                        value={additionalQuantity}
                        onChange={(e) => setAdditionalQuantity(e.target.value)}
                        className="w-24"
                        placeholder="Buy"
                      />
                      <span className="flex items-center text-sm text-muted-foreground">
                        = {pantryQuantity + parseInt(additionalQuantity || "0")} {unit} total
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      We'll add {additionalQuantity} {unit} to your grocery list
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {!pantryItem && (
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
          )}

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          {/* Family vs Kid Item Toggle */}
          <Card className="p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="family-toggle" className="text-sm font-medium cursor-pointer">
                  Family Item
                </Label>
                <p className="text-xs text-muted-foreground">
                  For household pantry (not tracked per child)
                </p>
              </div>
              <Button
                type="button"
                variant={isFamilyItem ? "default" : "outline"}
                size="sm"
                onClick={() => setIsFamilyItem(!isFamilyItem)}
              >
                {isFamilyItem ? "Family" : "Kid-Specific"}
              </Button>
            </div>
          </Card>

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
                  placeholder="e.g., Get the whole milk version, allergen info, etc."
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
