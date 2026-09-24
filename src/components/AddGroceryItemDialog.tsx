import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FoodCategory } from "@/types";
import { Plus, Camera, Barcode, Package, ShoppingCart, Edit3, ListPlus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useFoods, useKids } from "@/contexts/AppContext";
import { GroceryImportTab } from "@/components/grocery/GroceryImportTab";
import type { FoodIdentification } from "@/components/ImageFoodCapture";
import type { GroceryAddInput } from "@/lib/groceryMerge";
import { findAllergenConflicts } from "@/lib/kidFit";
import {
  GROCERY_CATEGORIES,
  describeConflicts,
  matchPantryFood,
} from "@/components/grocery/groceryInputSchemas";

// Both pull in camera and scanner code the manual form never needs.
const BarcodeScannerDialog = lazy(() =>
  import("@/components/admin/BarcodeScannerDialog").then((m) => ({ default: m.BarcodeScannerDialog })),
);
const ImageFoodCapture = lazy(() =>
  import("@/components/ImageFoodCapture").then((m) => ({ default: m.ImageFoodCapture })),
);

export interface AddGroceryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Every add, from the manual form or the import tab, as one batch. Rows
   * carry the list on screen and an added_via tag.
   */
  onAddItems: (items: GroceryAddInput[]) => void;
  /**
   * US-714: the list currently on screen. Without it every add landed with a
   * null grocery_list_id, which filterItemsByList then hid under any named
   * list -- the item was saved and the shopper could not see it.
   */
  selectedListId?: string | null;
}

type TabValue = "manual" | "barcode" | "camera" | "import";
/** "auto" leaves the category to the row builder, which infers it from the name. */
type CategoryChoice = FoodCategory | "auto";

const isFoodCategory = (value: unknown): value is FoodCategory =>
  typeof value === "string" && (GROCERY_CATEGORIES as readonly string[]).includes(value);

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
};

export function AddGroceryItemDialog({ open, onOpenChange, onAddItems, selectedListId }: AddGroceryItemDialogProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { kids } = useKids();
  const nameRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("manual");

  // Form state
  const [name, setName] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [unit, setUnit] = useState("");
  const [unitTouched, setUnitTouched] = useState(false);
  const [category, setCategory] = useState<CategoryChoice>("auto");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [aisle, setAisle] = useState("");
  const [notes, setNotes] = useState("");
  const [barcode, setBarcode] = useState("");
  const [brandPreference, setBrandPreference] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allergenAcknowledged, setAllergenAcknowledged] = useState(false);
  // Default on: in the aisle, the next item is the usual next step.
  const [keepOpen, setKeepOpen] = useState(true);

  // Scanner dialog states
  const [scannerOpen, setScannerOpen] = useState(false);
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  /** The pantry food this name stands for: exact name first, then the match key. */
  const pantryFood = useMemo(() => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return undefined;
    const lower = trimmed.toLowerCase();
    return foods.find((f) => f.name.trim().toLowerCase() === lower) ?? matchPantryFood(trimmed, foods);
  }, [name, foods]);

  const conflicts = useMemo(
    () => (pantryFood ? findAllergenConflicts(kids, [pantryFood.id], foodById) : []),
    [pantryFood, kids, foodById],
  );
  const allergenBlocked = conflicts.length > 0 && !allergenAcknowledged;

  // Prefill from the pantry, but never over what the parent chose.
  // With no match, an untouched field goes back to empty rather than keeping
  // what the previous match filled in.
  useEffect(() => {
    if (!unitTouched) setUnit(pantryFood?.unit ?? "");
    if (!categoryTouched) setCategory(pantryFood?.category ?? "auto");
  }, [pantryFood, unitTouched, categoryTouched]);

  // A different item is a different decision.
  useEffect(() => {
    setAllergenAcknowledged(false);
  }, [pantryFood?.id]);

  /** Put the form back to empty. State only: no toast, no close. */
  const resetForm = useCallback(() => {
    setName("");
    setQuantityText("1");
    setUnit("");
    setUnitTouched(false);
    setCategory("auto");
    setCategoryTouched(false);
    setAisle("");
    setNotes("");
    setBarcode("");
    setBrandPreference("");
    setShowAdvanced(false);
    setAllergenAcknowledged(false);
    setActiveTab("manual");
    setScannerOpen(false);
    setImageCaptureOpen(false);
  }, []);

  /** Every way out (Cancel, the X, Escape, a tap outside) resets the form. */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm],
  );

  const announceAdded = useCallback(
    (items: GroceryAddInput[]) => {
      toast.success(
        t("grocery.input.add.added", {
          defaultValue: "Added {{count}} items to the list",
          count: items.length,
          name: items[0]?.name ?? "",
        }),
      );
    },
    [t],
  );

  // Handle food identified from the barcode scanner. With targetTable="foods"
  // the scanner saves to the pantry itself and may pass nothing back.
  const handleFoodFromBarcode = (food?: Record<string, unknown>) => {
    if (food) {
      const scannedName = readString(food, "name");
      if (scannedName) setName(scannedName);
      if (isFoodCategory(food.category)) {
        setCategory(food.category);
        setCategoryTouched(true);
      }
      const packageQuantity = readString(food, "package_quantity");
      if (packageQuantity) {
        setUnit(packageQuantity);
        setUnitTouched(true);
      }
      const allergens = Array.isArray(food.allergens)
        ? food.allergens.filter((a): a is string => typeof a === "string")
        : [];
      if (allergens.length > 0) {
        const allergenNote = t("grocery.input.add.allergenNote", {
          defaultValue: "Allergens: {{list}}",
          list: allergens.join(", "),
        });
        setNotes((prev) => (prev ? `${prev}\n${allergenNote}` : allergenNote));
        setShowAdvanced(true);
      }
      setBarcode(readString(food, "barcode") ?? "");
      if (scannedName) {
        toast.success(t("grocery.input.add.productFound", { defaultValue: "Product found: {{name}}", name: scannedName }));
      }
    }
    setScannerOpen(false);
    setActiveTab("manual");
  };

  // Handle food identified from an image
  const handleFoodFromImage = (foodData: FoodIdentification) => {
    setName(foodData.name);
    setCategory(foodData.category);
    setCategoryTouched(true);
    setQuantityText(String(foodData.quantity || 1));
    setUnit(foodData.servingSize || "");
    setUnitTouched(true);
    toast.success(t("grocery.input.add.foodIdentified", { defaultValue: "Food identified: {{name}}", name: foodData.name }));
    setImageCaptureOpen(false);
    setActiveTab("manual");
  };

  const submitManual = (acknowledged: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("grocery.input.add.nameRequired", "Enter an item name"));
      nameRef.current?.focus();
      return;
    }
    if (conflicts.length > 0 && !acknowledged) return;

    const quantity = parseFloat(quantityText);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error(t("grocery.input.add.quantityInvalid", "Enter a quantity above 0"));
      return;
    }

    const item: GroceryAddInput = {
      name: trimmed,
      quantity,
      unit: unit.trim(),
      ...(category !== "auto" ? { category } : {}),
      aisle: aisle.trim() || undefined,
      notes: notes.trim() || undefined,
      barcode: barcode.trim() || undefined,
      brand_preference: brandPreference.trim() || undefined,
      grocery_list_id: selectedListId ?? undefined,
      added_via: "manual",
    };
    onAddItems([item]);
    announceAdded([item]);
    resetForm();

    if (keepOpen) {
      // Name clears and keeps focus for the next item.
      requestAnimationFrame(() => nameRef.current?.focus());
    } else {
      onOpenChange(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitManual(allergenAcknowledged);
  };

  const handleImported = (items: GroceryAddInput[]) => {
    if (items.length === 0) return;
    const stamped = items.map((item) => ({ ...item, grocery_list_id: selectedListId ?? undefined }));
    onAddItems(stamped);
    announceAdded(stamped);
    resetForm();
    onOpenChange(false);
  };

  const hasName = name.trim().length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {t("grocery.input.add.title", "Add grocery item")}
            </DialogTitle>
            <DialogDescription>
              {t("grocery.input.add.description", "Type an item, paste a list, scan a barcode, or use your camera.")}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="manual" className="gap-2" aria-label={t("grocery.input.add.tabManual", "Type")}>
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("grocery.input.add.tabManual", "Type")}</span>
              </TabsTrigger>
              <TabsTrigger value="import" className="gap-2" aria-label={t("grocery.input.add.tabImport", "Paste list")}>
                <ListPlus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("grocery.input.add.tabImport", "Paste list")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="barcode"
                className="gap-2"
                onClick={() => setScannerOpen(true)}
                aria-label={t("grocery.input.add.tabBarcode", "Barcode")}
              >
                <Barcode className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("grocery.input.add.tabBarcode", "Barcode")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="camera"
                className="gap-2"
                onClick={() => setImageCaptureOpen(true)}
                aria-label={t("grocery.input.add.tabCamera", "Camera")}
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("grocery.input.add.tabCamera", "Camera")}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="import" className="flex-1 overflow-y-auto py-4 mt-0">
              <GroceryImportTab onAddItems={handleImported} />
            </TabsContent>

            {activeTab !== "import" && (
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4">
                <TabsContent value="manual" className="space-y-4 mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="item-name">{t("grocery.input.add.name", "Item name")}</Label>
                    <Input
                      id="item-name"
                      ref={nameRef}
                      value={name}
                      maxLength={120}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("grocery.input.add.namePlaceholder", "e.g. Milk, Bread, Eggs")}
                      autoComplete="off"
                      className="h-11"
                      autoFocus
                    />
                  </div>
                </TabsContent>

                <TabsContent value="barcode" className="space-y-4 mt-0">
                  <Card className="p-4 bg-muted/50 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("grocery.input.add.barcodeHint", "Scan a product's barcode to fill in the item.")}
                    </p>
                    <Button type="button" onClick={() => setScannerOpen(true)} variant="secondary" className="h-11">
                      <Barcode className="h-4 w-4 mr-2" aria-hidden="true" />
                      {t("grocery.input.add.openScanner", "Open barcode scanner")}
                    </Button>
                  </Card>
                </TabsContent>

                <TabsContent value="camera" className="space-y-4 mt-0">
                  <Card className="p-4 bg-muted/50 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("grocery.input.add.cameraHint", "Take a photo of the food to fill in the item.")}
                    </p>
                    <Button type="button" onClick={() => setImageCaptureOpen(true)} variant="secondary" className="h-11">
                      <Camera className="h-4 w-4 mr-2" aria-hidden="true" />
                      {t("grocery.input.add.openCamera", "Open camera")}
                    </Button>
                  </Card>
                </TabsContent>

                {pantryFood && hasName && (
                  <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p>
                      {t("grocery.input.add.inPantry", {
                        defaultValue: "In your pantry: {{quantity}} {{unit}}",
                        quantity: pantryFood.quantity ?? 0,
                        unit: pantryFood.unit ?? "",
                      })}
                    </p>
                  </div>
                )}

                {conflicts.length > 0 && hasName && (
                  <div
                    role="alert"
                    className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive sm:flex-row sm:items-center"
                  >
                    <div className="flex flex-1 items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p>
                        {t("grocery.input.add.allergenWarning", {
                          defaultValue: "{{name}} is an allergen for {{list}}.",
                          name: pantryFood?.name ?? name.trim(),
                          list: describeConflicts(conflicts),
                        })}
                      </p>
                    </div>
                    {!allergenAcknowledged && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-11 shrink-0"
                        onClick={() => {
                          setAllergenAcknowledged(true);
                          submitManual(true);
                        }}
                      >
                        {t("grocery.input.add.addAnyway", "Add anyway")}
                      </Button>
                    )}
                  </div>
                )}

                {hasName && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="quantity">{t("grocery.input.add.quantity", "Quantity")}</Label>
                        <Input
                          id="quantity"
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min={0}
                          className="h-11"
                          value={quantityText}
                          onChange={(e) => setQuantityText(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="unit">{t("grocery.input.add.unit", "Unit")}</Label>
                        <Input
                          id="unit"
                          className="h-11"
                          maxLength={24}
                          value={unit}
                          onChange={(e) => {
                            setUnit(e.target.value);
                            setUnitTouched(true);
                          }}
                          placeholder={t("grocery.input.add.unitPlaceholder", "e.g. lb, bag, gal")}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="category">{t("grocery.input.add.category", "Category")}</Label>
                        <Select
                          value={category}
                          onValueChange={(v) => {
                            // Radix reports "" when its hidden native select
                            // syncs; that is not a choice the parent made.
                            if (!v) return;
                            setCategory(v as CategoryChoice);
                            setCategoryTouched(true);
                          }}
                        >
                          <SelectTrigger id="category" className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">{t("grocery.input.category.auto", "Automatic")}</SelectItem>
                            {GROCERY_CATEGORIES.map((key) => (
                              <SelectItem key={key} value={key}>
                                {t(`grocery.input.category.${key}`, key)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="aisle">{t("grocery.input.add.aisle", "Aisle (optional)")}</Label>
                        <Input
                          id="aisle"
                          className="h-11"
                          maxLength={60}
                          value={aisle}
                          onChange={(e) => setAisle(e.target.value)}
                          placeholder={t("grocery.input.add.aislePlaceholder", "e.g. Produce")}
                        />
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowAdvanced((v) => !v)}
                      className="h-11 w-full justify-start text-sm"
                      aria-expanded={showAdvanced}
                    >
                      {showAdvanced
                        ? t("grocery.input.add.hideMore", "Hide brand and notes")
                        : t("grocery.input.add.showMore", "Brand and notes")}
                    </Button>

                    {showAdvanced && (
                      <div className="space-y-4 border-t pt-2">
                        <div className="space-y-2">
                          <Label htmlFor="brand">{t("grocery.input.add.brand", "Brand preference")}</Label>
                          <Input
                            id="brand"
                            className="h-11"
                            value={brandPreference}
                            onChange={(e) => setBrandPreference(e.target.value)}
                            placeholder={t("grocery.input.add.brandPlaceholder", "e.g. Horizon Organic")}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="notes">{t("grocery.input.add.notes", "Notes")}</Label>
                          <Textarea
                            id="notes"
                            value={notes}
                            maxLength={500}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder={t("grocery.input.add.notesPlaceholder", "Size, preferences, etc.")}
                            rows={3}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="keep-open" className="text-sm font-normal">
                    {t("grocery.input.add.keepOpen", "Keep open for next item")}
                  </Label>
                  <Switch id="keep-open" checked={keepOpen} onCheckedChange={setKeepOpen} />
                </div>

                <div className="flex gap-2 border-t pt-4">
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="h-11 flex-1">
                    {t("grocery.input.cancel", "Cancel")}
                  </Button>
                  <Button type="submit" className="h-11 flex-1" disabled={!hasName || allergenBlocked}>
                    <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                    {t("grocery.input.add.submit", "Add item")}
                  </Button>
                </div>
              </form>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        {scannerOpen && (
          <BarcodeScannerDialog
            open={scannerOpen}
            onOpenChange={setScannerOpen}
            onFoodAdded={handleFoodFromBarcode}
            targetTable="foods"
          />
        )}
        {imageCaptureOpen && (
          <ImageFoodCapture
            open={imageCaptureOpen}
            onOpenChange={setImageCaptureOpen}
            onFoodIdentified={handleFoodFromImage}
          />
        )}
      </Suspense>
    </>
  );
}
