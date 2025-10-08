import { useState, useRef } from "react";
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { Capacitor } from '@capacitor/core';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Scan, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

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
};

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodAdded?: (food?: any) => void;
  targetTable?: 'nutrition' | 'foods';
}

export function BarcodeScannerDialog({ open, onOpenChange, onFoodAdded, targetTable = 'nutrition' }: BarcodeScannerDialogProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [scannedFood, setScannedFood] = useState<ScannedFood | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isNative = Capacitor.isNativePlatform();
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  const webScannerRef = useRef<Html5Qrcode | null>(null);

  const checkPermissions = async () => {
    const status = await BarcodeScanner.checkPermission({ force: true });
    
    if (status.granted) {
      return true;
    }
    
    if (status.denied) {
      toast({
        title: "Camera permission denied",
        description: "Please enable camera permissions in your device settings",
        variant: "destructive",
      });
      return false;
    }
    
    return false;
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
      const qrboxWidth = Math.round(containerWidth * 0.9);
      const qrboxHeight = Math.max(140, Math.round(qrboxWidth * 0.35)); // short stripe works better for 1D

      const config: any = {
        fps: 18,
        aspectRatio: 1.777, // Widescreen helps autofocus
        qrbox: { width: qrboxWidth, height: qrboxHeight },
        disableFlip: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
        ],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
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
          try {
            await scanner.stop();
            await scanner.clear();
          } catch {}
          webScannerRef.current = null;
          document.body.classList.remove('scanner-active');
          await lookupBarcode(decodedText);
          setIsScanning(false);
        },
        (errMsg) => {
          if (typeof errMsg === 'string') console.debug('decode failure:', errMsg);
        }
      );

      document.body.classList.add('scanner-active');
    } catch (err) {
      console.error('Web scan error:', err);
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

  const startScan = async () => {
    // Use web fallback if not running natively (e.g., iOS Chrome)
    if (!isNative) {
      await startWebScan();
      return;
    }

    const hasPermission = await checkPermissions();
    if (!hasPermission) return;

    setIsScanning(true);
    setError(null);
    setScannedFood(null);

    try {
      await BarcodeScanner.prepare();
      document.body.classList.add('scanner-active');
      document.querySelector('.dialog-content')?.classList.add('scanner-ui');
      const result = await BarcodeScanner.startScan();
      await BarcodeScanner.stopScan();
      document.body.classList.remove('scanner-active');
      document.querySelector('.dialog-content')?.classList.remove('scanner-ui');
      if (result.hasContent) {
        await lookupBarcode(result.content);
      }
    } catch (err) {
      console.error('Scan error:', err);
      try { await BarcodeScanner.stopScan(); } catch {}
      document.body.classList.remove('scanner-active');
      document.querySelector('.dialog-content')?.classList.remove('scanner-ui');
      setError(err instanceof Error ? err.message : 'Failed to scan barcode');
      toast({
        title: 'Scan failed',
        description: 'Unable to scan barcode. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const lookupBarcode = async (barcode: string) => {
    setIsLookingUp(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('lookup-barcode', {
        body: { barcode }
      });

      if (error) throw error;

      if (data.success && data.food) {
        setScannedFood(data.food);
        toast({
          title: "Product found!",
          description: `Found ${data.food.name} in ${data.food.source}`,
        });
      } else {
        setError(data.error || "Product not found in any database");
        toast({
          title: "Product not found",
          description: "Please add this product manually",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error('Lookup error:', err);
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

        // Add to user's personal foods
        const foodData = {
          user_id: user.id,
          household_id: householdId,
          name: scannedFood.name,
          category: scannedFood.category,
          aisle: scannedFood.category,
          allergens: scannedFood.allergens || [],
          is_safe: false,
          is_try_bite: false,
        };

        const { error } = await supabase.from('foods').insert(foodData);
        if (error) throw error;

        toast({
          title: "Food Added",
          description: `${scannedFood.name} has been added to your pantry.`,
        });

        onFoodAdded?.(foodData);
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
      console.error('Add error:', err);
      toast({
        title: "Failed to add",
        description: err instanceof Error ? err.message : "Unable to add to database",
        variant: "destructive",
      });
    }
  };

  const handleClose = async () => {
    // Stop native scanner if it's running
    if (isScanning) {
      try {
        await BarcodeScanner.stopScan();
      } catch (err) {
        // ignore
      }
    }

    // Stop web scanner if running
    try {
      if (webScannerRef.current) {
        await webScannerRef.current.stop();
        await webScannerRef.current.clear();
        webScannerRef.current = null;
      }
    } catch (err) {
      console.error('Error stopping web scanner on close:', err);
    }

    document.body.classList.remove('scanner-active');
    document.querySelector('.dialog-content')?.classList.remove('scanner-ui');

    onOpenChange(false);
    setScannedFood(null);
    setError(null);
    setIsScanning(false);
    setIsLookingUp(false);
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
                {!isNative && (
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
                    <h3 className="font-semibold text-lg">{scannedFood.name}</h3>
                    <Badge variant="outline" className="mt-1">{scannedFood.category}</Badge>
                  </div>

                  {scannedFood.serving_size && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Serving: </span>
                      {scannedFood.serving_size}
                    </div>
                  )}

                  {scannedFood.package_quantity && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Package: </span>
                      {scannedFood.package_quantity}
                      {scannedFood.servings_per_container && (
                        <span className="ml-2">({scannedFood.servings_per_container} servings)</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground">Calories</div>
                      <div className="font-medium">{scannedFood.calories || "-"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Protein</div>
                      <div className="font-medium">{scannedFood.protein_g || 0}g</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Carbs</div>
                      <div className="font-medium">{scannedFood.carbs_g || 0}g</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Fat</div>
                      <div className="font-medium">{scannedFood.fat_g || 0}g</div>
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
