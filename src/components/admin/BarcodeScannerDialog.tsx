import { useState } from "react";
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

  const startScan = async () => {
    const hasPermission = await checkPermissions();
    if (!hasPermission) return;

    setIsScanning(true);
    setError(null);
    setScannedFood(null);

    try {
      // Hide background to show camera
      document.body.classList.add('scanner-active');
      
      const result = await BarcodeScanner.startScan();
      
      // Remove scanner styling
      document.body.classList.remove('scanner-active');
      
      if (result.hasContent) {
        console.log('Scanned barcode:', result.content);
        await lookupBarcode(result.content);
      }
    } catch (err) {
      console.error('Scan error:', err);
      document.body.classList.remove('scanner-active');
      setError(err instanceof Error ? err.message : "Failed to scan barcode");
      toast({
        title: "Scan failed",
        description: "Unable to scan barcode. Please try again.",
        variant: "destructive",
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
        // Add to user's personal foods
        const foodData = {
          user_id: user.id,
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

  const handleClose = () => {
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
        }
      `}</style>
      
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Scan Product Barcode</DialogTitle>
            <DialogDescription>
              Scan a product barcode to automatically look up nutrition information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!scannedFood && !error && !isScanning && !isLookingUp && (
              <Button onClick={startScan} className="w-full" size="lg">
                <Scan className="h-5 w-5 mr-2" />
                Start Camera Scan
              </Button>
            )}

            {isScanning && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Point your camera at the barcode...
                </AlertDescription>
              </Alert>
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
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {scannedFood && (
              <Button onClick={addToDatabase}>
                {targetTable === 'foods' ? 'Add to Pantry' : 'Add to Nutrition Database'}
              </Button>
            )}
            {!scannedFood && !isScanning && !isLookingUp && (
              <Button onClick={startScan}>
                Scan Again
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
