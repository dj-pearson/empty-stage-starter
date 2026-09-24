import { useState, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Html5Qrcode, Html5QrcodeSupportedFormats, type Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import { isMobile } from '@/lib/platform';
import { Button } from "@/components/ui/button";
import '@/i18n/appLocale';

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
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DataSourceCredit } from "@/components/DataSourceCredit";
import { logger } from "@/lib/logger";
import { normalizeHouseholdId } from '@/lib/householdId';
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from "@/lib/foodSafetyDefault";
import type { Food, FoodCategory } from "@/types";

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
  /** The pantry row the scan matched, when the lookup names it. */
  food_id?: string;
  /** The grocery_product_catalog row, when the lookup names it (US-795). */
  canonical_id?: string | null;
};

/**
 * What a pantry scan asks the page to write. `delta` is always an amount to
 * ADD: a first scan creates the food with `delta` of it, a re-scan of a food
 * already in the pantry tops it up by `delta`. It is never the new total, so
 * the page can route it through the same ledger-aware top-up every other
 * capture path uses.
 */

/** Camera constraints html5-qrcode passes through that the DOM lib does not declare. */
type CameraConstraints = MediaTrackConstraints & {
  focusMode?: string;
  advanced?: Array<MediaTrackConstraintSet & { zoom?: number }>;
};

export interface BarcodePantryAdd {
  food: Omit<Food, "id">;
  barcode: string;
  existingFoodId?: string;
  delta: number;
  unit?: string;
}

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodAdded?: (food?: Record<string, unknown>) => void;
  /**
   * 'foods' adds to the signed-in household's pantry; 'catalog' adds to the
   * shared grocery_product_catalog from the admin screen. The third value
   * used to be 'nutrition', the table US-799 is retiring.
   */
  targetTable?: 'catalog' | 'foods';
  /**
   * The pantry write, owned by the page. When this is passed and targetTable
   * is 'foods', the dialog writes nothing itself: no getUser, no household
   * RPC, no supabase.from('foods'). A direct insert skipped the optimistic
   * state, the inventory ledger and the duplicate check, and set the stock to
   * an absolute number that raced whatever else moved it. Resolve to whether
   * the write landed; the dialog closes only on true. Without it (the admin
   * catalog screen, older callers) the dialog keeps its own direct path.
   */
  onAddToPantry?: (p: BarcodePantryAdd) => Promise<boolean>;
  /**
   * The household's pantry, used only to name `existingFoodId` for a product
   * already in it (lookup-barcode says "in your pantry" but not which row).
   * Matched by barcode, then by name.
   */
  pantryFoods?: ReadonlyArray<Pick<Food, "id" | "name" | "barcode">>;
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onFoodAdded,
  targetTable = 'catalog',
  onAddToPantry,
  pantryFoods,
}: BarcodeScannerDialogProps) {
  const { t } = useTranslation();
  const [isCommitting, setIsCommitting] = useState(false);
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

      // formatsToSupport / experimentalFeatures are read at runtime but not
      // declared on the start() config type; focusMode and zoom are camera
      // constraints the DOM lib does not declare.
      const config: Omit<Html5QrcodeCameraScanConfig, "videoConstraints"> & {
        videoConstraints: CameraConstraints;
        formatsToSupport: Html5QrcodeSupportedFormats[];
        experimentalFeatures: { useBarCodeDetectorIfSupported: boolean };
      } = {
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
          } catch {
            // Already stopped; nothing to clean up.
          }
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
      } catch {
        // Already stopped; nothing to clean up.
      }
      document.body.classList.remove('scanner-active');
      const embeddedMsg = isEmbedded ? ' (embedded preview blocks camera — open in new tab)' : '';
      setError((err instanceof Error ? err.message : 'Failed to start web scanner') + embeddedMsg);
      toast.error('Scan failed', { description: 'Unable to access camera. Check permissions' + embeddedMsg + '.' });
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
    toast.error('Scan failed', { description: errorMsg });
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
      const { data, error } = await invokeEdgeFunction<{
        success?: boolean;
        error?: string;
        food?: ScannedFood;
      }>('lookup-barcode', {
        body: { barcode }
      });

      if (error) throw error;

      if (data?.success && data.food) {
        setScannedFood(data.food);
        
        // Auto-select best unit based on product info
        if (data.food.servings_per_container && data.food.servings_per_container > 1) {
          setUnit('packages'); // Default to packages for multi-serving items
        }
        
        if (data.food.in_pantry) {
          // Not an error: re-scanning something you already have is how you
          // say "I bought another one". The dialog shows the current stock
          // inline and offers +1; `quantity` here is how many MORE to add.
          setQuantity(1);
          setUnit(data.food.existing_unit || 'packages');
        } else {
          toast("Product found!", { description: `Found ${data.food.name} in ${data.food.source}` });
        }
      } else {
        setError(data?.error || "Product not found in any database");
        toast.error("Product not found", { description: "Please add this product manually" });
      }
    } catch (err) {
      logger.error('Lookup error:', err);
      setError(err instanceof Error ? err.message : "Failed to lookup product");
      toast.error("Lookup failed", { description: "Unable to find product information" });
    } finally {
      setIsLookingUp(false);
    }
  };

  const resetScan = () => {
    setScannedFood(null);
    setScannedBarcode(null);
    setError(null);
    setQuantity(1);
    setUnit('packages');
  };

  /** The row this product already is in the pantry, when we can name it. */
  const resolveExistingFoodId = (food: ScannedFood, barcode: string | null): string | undefined => {
    if (food.food_id) return food.food_id;
    if (!pantryFoods) return undefined;
    const code = (barcode ?? '').trim();
    const byBarcode = code ? pantryFoods.find((f) => (f.barcode ?? '').trim() === code) : undefined;
    if (byBarcode) return byBarcode.id;
    if (!food.in_pantry) return undefined;
    const key = food.name.trim().toLowerCase();
    return pantryFoods.find((f) => f.name.trim().toLowerCase() === key)?.id;
  };

  /** Build the pantry payload without touching the database. */
  const buildPantryAdd = (food: ScannedFood, delta: number): BarcodePantryAdd => ({
    food: {
      name: food.name,
      category: mapToAllowedCategory(food.category, food.name) as FoodCategory,
      // No aisle: the provider's category ("Breakfast cereals", "en:snacks")
      // is not a store aisle, and writing it there filled the grocery list's
      // aisle grouping with nonsense.
      allergens: food.allergens ?? [],
      canonical_id: food.canonical_id ?? null,
      // US-803: a scanned product is a product, not a safe food.
      is_safe: ACQUIRED_FOOD_IS_SAFE,
      is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
      quantity: delta,
      unit,
      package_quantity: food.package_quantity,
      servings_per_container: food.servings_per_container,
      barcode: scannedBarcode || null,
    },
    barcode: scannedBarcode ?? '',
    existingFoodId: resolveExistingFoodId(food, scannedBarcode),
    delta,
    unit,
  });

  const commit = async (delta: number) => {
    if (!scannedFood || isCommitting) return;
    if (onAddToPantry && targetTable === 'foods') {
      setIsCommitting(true);
      try {
        const ok = await onAddToPantry(buildPantryAdd(scannedFood, delta));
        if (!ok) return; // The page said why; keep the scan on screen.
        onFoodAdded?.();
        onOpenChange(false);
        resetScan();
      } catch (err) {
        logger.error('Pantry add from scan failed:', err);
        toast.error(t("pantry.scan.barcode.addFailed", "Couldn't add it. Try again."));
      } finally {
        setIsCommitting(false);
      }
      return;
    }
    setIsCommitting(true);
    try {
      await addToDatabase(delta);
    } finally {
      setIsCommitting(false);
    }
  };

  /**
   * The direct write, for callers that pass no onAddToPantry: the admin
   * catalog screen, and any pantry caller not yet moved onto the page's
   * write path. `delta` is added to the stock, never written as the total.
   */
  const addToDatabase = async (delta: number) => {
    if (!scannedFood) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      if (targetTable === 'foods') {
        // Get household_id first
        const { data: householdIdRaw } = await supabase
          .rpc('get_user_household_id', { _user_id: user.id });
        // `if (!householdIdRaw)` alone would accept [], which is truthy and not
        // a household id. See src/lib/householdId.ts.
        const householdId = normalizeHouseholdId(householdIdRaw);

        if (!householdId) throw new Error("No household found");

        // Add to user's personal foods or update existing quantity
        // .limit(1).maybeSingle(), not .single(): two rows carrying the same
        // barcode (a double tap, an old import) made .single() throw, and the
        // scan failed with "multiple rows returned" for a product the family
        // plainly owns.
        const { data: existingFood, error: fetchError } = scannedFood.in_pantry
          ? await supabase
              .from('foods')
              .select('id, quantity')
              .eq('household_id', householdId)
              .eq('barcode', scannedBarcode ?? '')
              .limit(1)
              .maybeSingle()
          : { data: null, error: null };

        if (fetchError) throw fetchError;

        if (existingFood) {
          const next = Math.round(((existingFood.quantity ?? 0) + delta) * 100) / 100;
          const { error: updateError } = await supabase
            .from('foods')
            .update({
              quantity: next,
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
            // US-803: a scanned product is a product, not a safe food.
            is_safe: ACQUIRED_FOOD_IS_SAFE,
            is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
            quantity: delta,
            unit: unit,
            package_quantity: scannedFood.package_quantity,
            servings_per_container: scannedFood.servings_per_container,
            barcode: scannedBarcode || undefined,
          };
          const { error } = await supabase.from('foods').insert(foodData);
          if (error) throw error;
        }

        toast.success("Food Added", { description: `${scannedFood.name} has been added to your pantry.` });

        onFoodAdded?.();
      } else {
        // US-799 AC2: the shared catalog, written directly.
        //
        // lookup-barcode answers in PER 100 G. The previous round asserted the
        // opposite and it was wrong on both halves: iOS never calls that
        // function -- BarcodeService.swift reads Open Food Facts directly --
        // and all three of its external providers already return per-100g
        // figures under the per-serving key names (OFF reads
        // `energy-kcal_100g`; USDA and FoodRepo feed identical values into
        // `food.calories` and `catalogInput.caloriesKcal100`). The one
        // genuinely per-serving path was the `nutrition` read, which US-799
        // has now removed from that function.
        //
        // So there is nothing to convert, and routing these through
        // catalog_upsert_from_serving -- which divides by a serving mass --
        // would have made every scanned figure wrong by whatever the serving
        // weighed. That RPC stays for the CSV import, whose columns really are
        // per serving.
        //
        // The row lands unverified: one household's scan of one label, checked
        // by nobody. US-797 keeps it out of totals until an admin looks at it
        // in NutritionManager. name_normalized and serving_size_g are omitted
        // because 20260918000009 derives both.
        const { error } = await supabase
          .from("grocery_product_catalog")
          .upsert(
            {
              name: scannedFood.name,
              default_category: scannedFood.category,
              barcode: scannedBarcode || null,
              // A barcode means a specific manufactured product; without one
              // it is a generic name somebody typed. Same rule as the backfill.
              kind: scannedBarcode ? "branded" : "generic",
              source: "user",
              source_ref: scannedBarcode || null,
              // Stated rather than inherited from the column default. US-797
              // keeps unverified figures out of totals and the ladder, and a
              // file that writes the per-100g columns should say which side of
              // that line its rows land on -- src/components/FoodCard.catalog.
              // test.tsx fails any that does not.
              verification: "unverified",
              serving_size_text: scannedFood.serving_size ?? null,
              package_quantity_text: scannedFood.package_quantity ?? null,
              servings_per_container: scannedFood.servings_per_container ?? null,
              ingredients: scannedFood.ingredients ?? null,
              calories_kcal_100: scannedFood.calories ?? null,
              protein_g_100: scannedFood.protein_g ?? null,
              carbs_g_100: scannedFood.carbs_g ?? null,
              fat_g_100: scannedFood.fat_g ?? null,
              allergens: scannedFood.allergens ?? null,
            },
            // Two admins scanning the same product is a re-scan, not an error.
            // ignoreDuplicates so a row somebody corrected by hand is not
            // overwritten by the provider copy it came from.
            { onConflict: "name_normalized", ignoreDuplicates: true },
          );

        if (error) throw error;

        toast.success("Added to catalog", {
          description: `${scannedFood.name} added, unverified. Verify it in the catalog list to make its figures count.`,
        });

        onFoodAdded?.();
      }

      onOpenChange(false);
      resetScan();
    } catch (err) {
      logger.error('Add error:', err);
      toast.error("Failed to add", { description: err instanceof Error ? err.message : "Unable to add to database" });
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
                    {/* US-633: ODbL requires the credit wherever the data is
                        shown, so it sits with the record, not in a footer. */}
                    <DataSourceCredit source={scannedFood.source} className="text-xs mt-1" />
                  </AlertDescription>
                </Alert>

                <div className="border rounded-lg p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg break-words">{scannedFood.name}</h3>
                    <Badge variant="outline" className="mt-1">{scannedFood.category}</Badge>
                  </div>

                  {scannedFood.in_pantry && (
                    <div
                      role="status"
                      className="flex items-center justify-between gap-3 rounded-md bg-muted p-3"
                      data-testid="barcode-in-pantry"
                    >
                      <p className="text-sm font-medium">
                        {t("pantry.scan.barcode.youHave", {
                          count: scannedFood.existing_quantity ?? 0,
                          unit: scannedFood.existing_unit ?? "",
                          defaultValue: "You have {{count}} {{unit}}",
                        })}
                      </p>
                      <Button
                        type="button"
                        className="h-11 min-w-11 shrink-0"
                        onClick={() => void commit(1)}
                        disabled={isCommitting}
                        aria-label={t("pantry.scan.barcode.plusOneLabel", {
                          defaultValue: "Add 1 more {{name}}",
                          name: scannedFood.name,
                        })}
                      >
                        {isCommitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          t("pantry.scan.barcode.plusOne", "+1")
                        )}
                      </Button>
                    </div>
                  )}

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
                        {scannedFood.in_pantry
                          ? t("pantry.scan.barcode.trackExisting", "Add more than one")
                          : t("pantry.scan.barcode.track", "How to track this item")}
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
                        {scannedFood.in_pantry
                          ? t("pantry.scan.barcode.howManyMore", "How many more")
                          : t("pantry.scan.barcode.quantity", "Quantity")}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className="h-10 w-10"
                          aria-label="Decrease quantity"
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
                          aria-label="Increase quantity"
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
                  <Button
                    className="flex-1"
                    variant={scannedFood.in_pantry ? "secondary" : "default"}
                    onClick={() => void commit(quantity)}
                    disabled={isCommitting}
                  >
                    {targetTable !== 'foods'
                      ? t("pantry.scan.barcode.addToCatalog", "Add to catalog")
                      : scannedFood.in_pantry
                        ? t("pantry.scan.barcode.addMore", { count: quantity, defaultValue: "Add {{count}} more" })
                        : t("pantry.scan.barcode.addToPantry", "Add to pantry")}
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
