import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FoodCategory } from "@/types";
import { Plus, Camera, Barcode, StickyNote, Search, Package, Sparkles, ShoppingCart, Loader2, Scan, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

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
  const [activeTab, setActiveTab] = useState<"manual" | "barcode" | "camera">("manual");
  
  // Form states
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
  
  // Barcode/API lookup states
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupSource, setLookupSource] = useState<string | null>(null);
  
  // Camera/barcode scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const webScannerRef = useRef<Html5Qrcode | null>(null);
  
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

  // Cleanup scanner on unmount or dialog close
  useEffect(() => {
    if (!open) {
      stopScanner();
    }
  }, [open]);

  const handleBarcodeChange = (value: string) => {
    setBarcode(value);
    setLookupSource(null);
  };

  const handleLookupBarcode = async () => {
    if (!barcode.trim()) {
      toast.error("Please enter a barcode");
      return;
    }

    setIsLookingUp(true);
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
        
        toast.success(`Product found: ${food.name}`, {
          description: `Source: ${food.source}`
        });
      } else {
        toast.error("Product not found", {
          description: "Try entering details manually"
        });
      }
    } catch (error) {
      console.error('Barcode lookup error:', error);
      toast.error("Failed to lookup barcode");
    } finally {
      setIsLookingUp(false);
    }
  };

  const startBarcodeScanner = async () => {
    setIsScanning(true);
    setIsProcessingScan(false);

    // Wait for DOM
    await new Promise((r) => setTimeout(r, 100));

    try {
      const scanner = new Html5Qrcode('barcode-scanner');
      webScannerRef.current = scanner;

      const container = document.getElementById('barcode-scanner');
      const containerWidth = Math.min((container?.clientWidth || window.innerWidth) - 24, 640);
      const qrboxWidth = Math.round(containerWidth * 0.95);
      const qrboxHeight = Math.max(160, Math.round(qrboxWidth * 0.4));

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) throw new Error('No cameras found');
      
      const backCamera = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

      await scanner.start(
        backCamera.id,
        {
          fps: 10,
          qrbox: { width: qrboxWidth, height: qrboxHeight },
        },
        async (decodedText) => {
          if (isProcessingScan) return;
          
          setIsProcessingScan(true);
          try {
            await scanner.stop();
            await scanner.clear();
          } catch {}
          webScannerRef.current = null;
          
          setBarcode(decodedText);
          setIsScanning(false);
          
          // Auto-lookup after scanning
          setTimeout(() => {
            handleLookupBarcode();
          }, 100);
        },
        () => {} // Ignore scan errors
      );
    } catch (err) {
      console.error('Scanner error:', err);
      toast.error('Failed to start scanner', {
        description: 'Please check camera permissions'
      });
      setIsScanning(false);
      try {
        if (webScannerRef.current) {
          await webScannerRef.current.stop();
          await webScannerRef.current.clear();
        }
      } catch {}
    }
  };

  const stopScanner = async () => {
    try {
      if (webScannerRef.current) {
        await webScannerRef.current.stop();
        await webScannerRef.current.clear();
        webScannerRef.current = null;
      }
    } catch {}
    setIsScanning(false);
    setIsProcessingScan(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Please enter an item name");
      return;
    }

    let finalQuantity: number;
    
    if (pantryItem) {
      const additionalQty = parseInt(additionalQuantity);
      if (isNaN(additionalQty) || additionalQty <= 0) {
        toast.error("Please enter a valid quantity to purchase");
        return;
      }
      finalQuantity = additionalQty;
    } else {
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
    resetForm();
  };

  const resetForm = () => {
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
    setActiveTab("manual");
    stopScanner();
    onOpenChange(false);
    toast.success("Item added to grocery list");
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        stopScanner();
        resetForm();
      }
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Add Grocery Item
          </DialogTitle>
          <DialogDescription>
            Add items manually, scan barcodes, or use your camera
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual" className="gap-2">
              <Edit3 className="h-4 w-4" />
              <span className="hidden sm:inline">Manual</span>
            </TabsTrigger>
            <TabsTrigger value="barcode" className="gap-2">
              <Barcode className="h-4 w-4" />
              <span className="hidden sm:inline">Barcode</span>
            </TabsTrigger>
            <TabsTrigger value="camera" className="gap-2">
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Camera</span>
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4">
            <TabsContent value="manual" className="space-y-4 mt-0">
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
            </TabsContent>

            <TabsContent value="barcode" className="space-y-4 mt-0">
              <Card className="p-4 bg-muted/50">
                <div className="space-y-3">
                  <Label htmlFor="barcode-input" className="flex items-center gap-2 text-sm font-medium">
                    <Barcode className="h-4 w-4" />
                    Enter or Scan Barcode
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="barcode-input"
                      value={barcode}
                      onChange={(e) => handleBarcodeChange(e.target.value)}
                      placeholder="Enter barcode number"
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
                      disabled={!barcode.trim() || isLookingUp}
                      variant="secondary"
                    >
                      {isLookingUp ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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

              {name && (
                <div className="space-y-2">
                  <Label>Product Found</Label>
                  <div className="p-3 border rounded-lg bg-background">
                    <p className="font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">{categoryLabels[category]}</p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="camera" className="space-y-4 mt-0">
              {!isScanning ? (
                <Button
                  type="button"
                  onClick={startBarcodeScanner}
                  className="w-full"
                  size="lg"
                  variant="secondary"
                >
                  <Scan className="h-5 w-5 mr-2" />
                  Start Camera Scanner
                </Button>
              ) : (
                <div className="space-y-3">
                  <div id="barcode-scanner" className="w-full h-[300px] rounded-lg overflow-hidden bg-black" />
                  <Button
                    type="button"
                    onClick={stopScanner}
                    variant="outline"
                    className="w-full"
                  >
                    Stop Scanner
                  </Button>
                  <p className="text-sm text-center text-muted-foreground">
                    Point camera at product barcode
                  </p>
                </div>
              )}

              {barcode && !isScanning && (
                <div className="space-y-2">
                  <Label>Scanned Barcode</Label>
                  <div className="p-3 border rounded-lg bg-background">
                    <p className="font-mono text-sm">{barcode}</p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Pantry Inventory Alert */}
            {pantryItem && name && (
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
                        Adjust current quantity or add additional purchase:
                      </Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          id="pantry-quantity"
                          type="number"
                          min="0"
                          value={pantryQuantity}
                          onChange={(e) => setPantryQuantity(parseInt(e.target.value) || 0)}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">+</span>
                        <Input
                          id="additional-quantity"
                          type="number"
                          min="0"
                          value={additionalQuantity}
                          onChange={(e) => setAdditionalQuantity(e.target.value)}
                          className="w-24"
                          placeholder="Buy"
                        />
                        <span className="text-sm text-muted-foreground">
                          = {pantryQuantity + parseInt(additionalQuantity || "0")} {unit}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Adding {additionalQuantity} {unit} to grocery list
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {!pantryItem && name && (
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
                    placeholder="e.g., packages, lbs"
                  />
                </div>
              </div>
            )}

            {name && (
              <>
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
                      placeholder="e.g., Produce"
                    />
                  </div>
                </div>

                <Card className="p-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Family Item</Label>
                      <p className="text-xs text-muted-foreground">
                        For household pantry (not child-specific)
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

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full justify-start text-sm"
                >
                  {showAdvanced ? "Hide" : "Show"} Advanced Options
                </Button>

                {showAdvanced && (
                  <div className="space-y-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="brand">Brand Preference</Label>
                      <Input
                        id="brand"
                        value={brandPreference}
                        onChange={(e) => setBrandPreference(e.target.value)}
                        placeholder="e.g., Horizon Organic"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Allergen info, preferences, etc."
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      stopScanner();
                      onOpenChange(false);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </>
            )}
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}