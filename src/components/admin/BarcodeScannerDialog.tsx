import { useState, useRef, lazy, Suspense } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { isMobile } from '@/lib/platform';
import { Button } from "@/components/ui/button";

// Lazy load the native scanner for mobile platforms
const NativeBarcodeScanner = lazy(() => import('@/components/mobile/NativeBarcodeScanner'));
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Scan, AlertCircle, CheckCircle2, Loader2, Minus, Plus, Package2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { logger } from "@/lib/logger";

type ScannedFood = {
  name: string;
  category: string;
  serving_size?: string;
  package_quantity?: string;
  servings_per_container?: number;
  ingredients?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  allergens?: string[];
  source: string;
  in_pantry?: boolean;
  existing_quantity?: number;
  existing_unit?: string;
};

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodAdded?: (food?: Record<string, unknown>) => void;
  targetTable?: 'nutrition' | 'foods';
}

export function BarcodeScannerDialog({ open, onOpenChange, onFoodAdded, targetTable = 'nutrition' }: BarcodeScannerDialogProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [scannedFood, setScannedFood] = useState<ScannedFood | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<string>('packages');
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [useNativeScanner, setUseNativeScanner] = useState(false);
  const isNative = isMobile(); // Use native scanner on mobile platforms
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  const webScannerRef = useRef<Html5Qrcode | null>(null);

  // Normalize incoming category strings from external sources to our allowed set
  const allowedCategories = ['protein','carb','dairy','fruit','vegetable','snack'] as const;
  function mapToAllowedCategory(input?: string, name?: string) {
    const raw = (input || '').toLowerCase().trim();
    const text = `${raw} ${name || ''}`.toLowerCase();
    const is = (re: RegExp) => re.test(text);

    if ((allowedCategories as readonly string[]).includes(raw)) return raw;
    if (is(/\b(yogurt|milk|cheese|butter|dairy)\b/)) return 'dairy';
    if (is(/\b(steak|meat|chicken|turkey|beef|pork|bacon|fish|tuna|salmon|egg|tofu|tempeh|bean|lentil|pea|peanut butter|almond butter|protein)\b/)) return 'protein';
    if (is(/\b(bread|pasta|rice|grain|cereal|cracker|tortilla|oat|noodle|bagel|bun|wrap)\b/)) return 'carb';
    if (is(/\b(vegetable|veggie|broccoli|carrot|spinach|pepper|lettuce|cucumber|tomato|zucchini|corn|pea|bean|potato)\b/)) return 'vegetable';
    if (is(/\b(fruit|apple|banana|berries?|grape|orange|pear|peach|mango|melon|strawberry|blueberry)\b/)) return 'fruit';
    if (is(/\b(snack|chips|cookie|candy|bar|snacks)\b/)) return 'snack';
    return 'snack';
  }

  const _checkPermissions = async () => {
    // Web scanner uses browser permissions via getUserMedia
    // No special permission check needed for web
    return true;
  };

  const startWebScan = async () => {
    setIsScanning(true);
    setError(null);
    setScannedFood(null);

    // Wait for the DOM to render the #web-scanner element
    await new Promise((r) => setTimeout(r, 50));

    try {
      const scanner = new Html5Qrcode('web-scanner');
      webScannerRef.current = scanner;

      // Compute a larger scan region optimized for 1D barcodes
      const container = document.getElementById('web-scanner');
      const containerWidth = Math.min((container?.clientWidth || window.innerWidth) - 24, 640);
      const qrboxWidth = Math.round(containerWidth * 0.95);
      const qrboxHeight = Math.max(160, Math.round(qrboxWidth * 0.4));

      const config: any = {
        fps: 10,
        aspectRatio: 1.777,
        qrbox: { width: qrboxWidth, height: qrboxHeight },
        disableFlip: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
        ],
        experimentalFeatures: { 
          useBarCodeDetectorIfSupported: true 
        },
        videoConstraints: {
          facingMode: "environment",
          focusMode: "continuous",
          advanced: [{ zoom: 2.0 }]
        }
      };

      // Prefer back camera when available (improves iOS reliability)
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error('No cameras found');
      }
      const back = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

      await scanner.start(
        back.id,
        config,
        async (decodedText) => {
          // Prevent processing the same scan multiple times
          if (isProcessingScan) {
            logger.debug('Already processing a scan, ignoring duplicate');
            return;
          }
          
          setIsProcessingScan(true);
          try {
            await scanner.stop();
            await scanner.clear();
          } catch {}
          webScannerRef.current = null;
          document.body.classList.remove('scanner-active');
          await lookupBarcode(decodedText);
          setIsScanning(false);
          setIsProcessingScan(false);
        },
        (errMsg) => {
          if (typeof errMsg === 'string') logger.debug('decode failure:', errMsg);
        }
      );

      document.body.classList.add('scanner-active');
    } catch (err) {
      logger.error('Web scan error:', err);
      try {
        if (webScannerRef.current) {
          await webScannerRef.current.stop();
          await webScannerRef.current.clear();
          webScannerRef.current = null;
        }
      } catch {}
      document.body.classList.remove('scanner-active');
      const embeddedMsg = isEmbedded ? ' (embedded preview blocks camera — open in new tab)' : '';
      setError((err instanceof Error ? err.message : 'Failed to start web scanner') + embeddedMsg);
      toast({
        title: 'Scan failed',
        description: 'Unable to access camera. Check permissions' + embeddedMsg + '.',
        variant: 'destructive',
      });
      setIsScanning(false);
    }
  };

  const startNativeScan = () => {
    setIsScanning(true);
    setError(null);
    setScannedFood(null);
    setUseNativeScanner(true);
  };

  const handleNativeBarcodeScanned = async (barcode: string) => {
    setUseNativeScanner(false);
    setIsScanning(false);
    await lookupBarcode(barcode);
  };

  const handleNativeScanError = (errorMsg: string) => {
    setUseNativeScanner(false);
    setIsScanning(false);
    setError(errorMsg);
    toast({
      title: 'Scan failed',
      description: errorMsg,
      variant: 'destructive',
    });
  };

  const handleNativeScanCancel = () => {
    setUseNativeScanner(false);
    setIsScanning(false);
  };

  const startScan = async () => {
    // Use native scanner on mobile, web scanner otherwise
    if (isNative) {
      startNativeScan();
    } else {
      await startWebScan();
    }
  };

  const lookupBarcode = async (barcode: string) => {
    setScannedBarcode(barcode);
    setIsLookingUp(true);
    setError(null);
    setQuantity(1);
    setUnit('packages'); // Reset to default

    try {
      const { data, error } = await invokeEdgeFunction('lookup-barcode', {
        body: { barcode }
      });

      if (error) throw error;

      if (data.success && data.food) {
        setScannedFood(data.food);
        
        // Auto-select best unit based on product info
        if (data.food.servings_per_container && data.food.servings_per_container > 1) {
          setUnit('packages'); // Default to packages for multi-serving items
        }
        
        if (data.food.in_pantry) {
          setQuantity((data.food.existing_quantity || 0) + 1);
          setUnit(data.food.existing_unit || 'packages');
          toast({
            title: "Already in your pantry!",
            description: `${data.food.name} - Current stock: ${data.food.existing_quantity} ${data.food.existing_unit}`,
          });
        } else {
          toast({
            title: "Product found!",
            description: `Found ${data.food.name} in ${data.food.source}`,
          });
        }
      } else {
        setError(data.error || "Product not found in any database");
        toast({
          title: "Product not found",
          description: "Please add this product manually",
          variant: "destructive",
        });
      }
    } catch (err) {
      logger.error('Lookup error:', err);
      setError(err instanceof Error ? err.message : "Failed to lookup product");
      toast({
        title: "Lookup failed",
        description: "Unable to find product information",
        variant: "destructive",
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const addToDatabase = async () => {
    if (!scannedFood) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      if (targetTable === 'foods') {
        // Get household_id first
        const { data: householdId } = await supabase
          .rpc('get_user_household_id', { _user_id: user.id });
        
        if (!householdId) throw new Error("No household found");

        // Add to user's personal foods or update existing quantity
        if (scannedFood.in_pantry) {
          // Update existing food quantity
          const { data: existingFood, error: fetchError } = await supabase
            .from('foods')
            .select('id, quantity')
            .eq('household_id', householdId)
            .eq('barcode', scannedBarcode)
            .single();
          
          if (fetchError) throw fetchError;
          
          const { error: updateError } = await supabase
            .from('foods')
            .update({ 
              quantity: quantity,
              unit: unit
            })
            .eq('id', existingFood.id);
          
          if (updateError) throw updateError;
        } else {
          // Insert new food
          const foodData = {
            user_id: user.id,
            household_id: householdId,
            name: scannedFood.name,
            category: mapToAllowedCategory(scannedFood.category, scannedFood.name),
            aisle: scannedFood.category,
            allergens: scannedFood.allergens || [],
            is_safe: true, // Default to Safe Foods
            is_try_bite: false,
            quantity: quantity,
            unit: unit,
            package_quantity: scannedFood.package_quantity,
            servings_per_container: scannedFood.servings_per_container,
            barcode: scannedBarcode || undefined,
          };
          const { error } = await supabase.from('foods').insert(foodData);
          if (error) throw error;
        }

        toast({
          title: "Food Added",
          description: `${scannedFood.name} has been added to your pantry.`,
        });

        onFoodAdded?.();
      } else {
        // Add to admin nutrition table
        const { error } = await supabase
          .from("nutrition")
          .insert({
            name: scannedFood.name,
            category: scannedFood.category,
            serving_size: scannedFood.serving_size,
            package_quantity: scannedFood.package_quantity,
            servings_per_container: scannedFood.servings_per_container,
            ingredients: scannedFood.ingredients,
            calories: scannedFood.calories,
            protein_g: scannedFood.protein_g,
            carbs_g: scannedFood.carbs_g,
            fat_g: scannedFood.fat_g,
            allergens: scannedFood.allergens,
            barcode: scannedBarcode || undefined,
            created_by: user?.id,
          });

        if (error) throw error;

        toast({
          title: "Success",
          description: `${scannedFood.name} added to nutrition database`,
        });

        onFoodAdded?.();
      }

      onOpenChange(false);
      setScannedFood(null);
      setError(null);
    } catch (err) {
      logger.error('Add error:', err);
      toast({
        title: "Failed to add",
        description: err instanceof Error ? err.message : "Unable to add to database",
        variant: "destructive",
      });
    }
  };

  const handleClose = async () => {
    // Stop web scanner if running
    try {
      if (webScannerRef.current) {
        await webScannerRef.current.stop();
        await webScannerRef.current.clear();
        webScannerRef.current = null;
      }
    } catch (err) {
      logger.error('Error stopping web scanner on close:', err);
    }

    document.body.classList.remove('scanner-active');
    document.querySelector('.dialog-content')?.classList.remove('scanner-ui');

    onOpenChange(false);
    setScannedFood(null);
    setScannedBarcode(null);
    setError(null);
    setIsScanning(false);
    setIsLookingUp(false);
    setQuantity(1);
    setUnit('packages');
    setIsProcessingScan(false);
  };

  return (
    <>
      <style>{`
        .scanner-active {
          --background: transparent !important;
          background: transparent !important;
        }
        .scanner-active body {
          background: transparent !important;
        }
        .scanner-ui {
          visibility: hidden;
        }
      `}</style>
      
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px] dialog-content max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Scan Product Barcode</DialogTitle>
            <DialogDescription>
              Scan a product barcode to automatically look up nutrition information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            {!scannedFood && !error && !isScanning && !isLookingUp && (
              <Button onClick={startScan} className="w-full" size="lg">
                <Scan className="h-5 w-5 mr-2" />
                Start Camera Scan
              </Button>
            )}

            {isScanning && (
              <>
                {isNative && useNativeScanner ? (
                  <Suspense fallback={
                    <div className="flex items-center justify-center h-[60vh] bg-black/60 rounded-lg">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  }>
                    <div className="h-[60vh] rounded-lg overflow-hidden">
                      <NativeBarcodeScanner
                        isActive={useNativeScanner}
                        onBarcodeScanned={handleNativeBarcodeScanned}
                        onError={handleNativeScanError}
                        onCancel={handleNativeScanCancel}
                      />
                    </div>
                  </Suspense>
                ) : !isNative && (
                  <div className="space-y-3">
                    <div id="web-scanner" className="w-full h-[56vh] md:h-[60vh] rounded-lg overflow-hidden bg-black/60" />
                    {isEmbedded && (
                      <Button variant="secondary" onClick={() => window.open(window.location.href, '_blank')}>
                        Open Full Page Scanner
                      </Button>
                    )}
                  </div>
                )}
                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>
                    Point your camera at the barcode...
                  </AlertDescription>
                </Alert>
              </>
            )}

            {isLookingUp && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Looking up product in databases...
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {scannedFood && (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    Product found in <strong>{scannedFood.source}</strong>
                  </AlertDescription>
                </Alert>

                <div className="border rounded-lg p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg break-words">{scannedFood.name}</h3>
                    <Badge variant="outline" className="mt-1">{scannedFood.category}</Badge>
                  </div>

                  {scannedFood.serving_size && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Serving: </span>
                      <span className="break-words">{scannedFood.serving_size}</span>
                    </div>
                  )}

                  {scannedFood.package_quantity && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Package: </span>
                      <span className="break-words">{scannedFood.package_quantity}</span>
                      {scannedFood.servings_per_container && (
                        <span className="ml-2">({scannedFood.servings_per_container} servings)</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Calories</div>
                      <div className="font-medium">{scannedFood.calories || "-"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Protein</div>
                      <div className="font-medium">{scannedFood.protein_g || 0}g</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Carbs</div>
                      <div className="font-medium">{scannedFood.carbs_g || 0}g</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Fat</div>
                      <div className="font-medium">{scannedFood.fat_g || 0}g</div>
                    </div>
                  </div>

                  {/* Unit & Quantity Selector */}
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Package2 className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">
                        How to track this item {scannedFood.in_pantry && "(will update existing)"}
                      </Label>
                    </div>
                    
                    {/* Unit Selector */}
                    <div className="space-y-2">
                      <Label htmlFor="unit" className="text-xs text-muted-foreground">
                        Track by
                      </Label>
                      <Select value={unit} onValueChange={(value) => {
                        setUnit(value);
                        // Auto-adjust quantity when switching units
                        if (value === 'servings' && scannedFood.servings_per_container) {
                          setQuantity(scannedFood.servings_per_container);
                        } else if (value === 'packages') {
                          setQuantity(1);
                        }
                      }}>
                        <SelectTrigger id="unit" className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="packages">
                            Packages/Boxes
                            {scannedFood.servings_per_container && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({scannedFood.servings_per_container} servings each)
                              </span>
                            )}
                          </SelectItem>
                          <SelectItem value="servings">
                            Individual Servings
                            {scannedFood.serving_size && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({scannedFood.serving_size})
                              </span>
                            )}
                          </SelectItem>
                          <SelectItem value="items">Individual Items/Pieces</SelectItem>
                          <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                          <SelectItem value="oz">Ounces (oz)</SelectItem>
                        </SelectContent>
                      </Select>
                      {scannedFood.servings_per_container && unit === 'packages' && (
                        <p className="text-xs text-muted-foreground">
                          1 package = {scannedFood.servings_per_container} servings
                        </p>
                      )}
                    </div>

                    {/* Quantity Controls */}
                    <div className="space-y-2">
                      <Label htmlFor="quantity" className="text-xs text-muted-foreground">
                        Quantity
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className="h-10 w-10"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          id="quantity"
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          className="text-center h-10"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setQuantity(quantity + 1)}
                          className="h-10 w-10"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {unit === 'servings' && scannedFood.servings_per_container 
                          ? [scannedFood.servings_per_container, scannedFood.servings_per_container * 2, scannedFood.servings_per_container * 3].map((num) => (
                              <Button
                                key={num}
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setQuantity(num)}
                                className="text-xs"
                              >
                                {num}
                              </Button>
                            ))
                          : [1, 2, 3, 5, 10].map((num) => (
                              <Button
                                key={num}
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setQuantity(num)}
                                className="text-xs"
                              >
                                {num}
                              </Button>
                            ))
                        }
                      </div>
                    </div>
                  </div>

                  {scannedFood.allergens && scannedFood.allergens.length > 0 && (
                    <div className="text-sm">
                      <div className="text-muted-foreground mb-1">Allergens:</div>
                      <div className="flex flex-wrap gap-1">
                        {scannedFood.allergens.map((allergen) => (
                          <Badge key={allergen} variant="secondary" className="text-xs">
                            {allergen}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {scannedFood.ingredients && (
                    <div className="text-sm">
                      <div className="text-muted-foreground mb-1">Ingredients:</div>
                      <div className="text-xs">{scannedFood.ingredients}</div>
                    </div>
                  )}
                </div>

                {/* Sticky actions for mobile */}
                <div className="sticky bottom-0 -mx-4 bg-background/85 backdrop-blur-md border-t p-3 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
                  <Button className="flex-1" onClick={addToDatabase}>
                    {targetTable === 'foods' ? 'Add to Pantry' : 'Add to Nutrition Database'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {!scannedFood && (
              <>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                {!isScanning && !isLookingUp && (
                  <Button onClick={startScan}>Scan Again</Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
