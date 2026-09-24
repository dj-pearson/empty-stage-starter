import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, Minus, Plus, X } from "lucide-react";
import { Food, FoodCategory } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { isTrustedForTotals } from "@/lib/catalogNutrition";
import { NEW_FOOD_SAFETY, safetyFromFlags, type SafetyChoice } from "@/lib/foodSafetyChoice";
import "@/i18n/appLocale";

interface AddFoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Resolves to whether the save landed. The dialog closes and resets only
   * when it did; on `false` it stays open with everything the parent typed,
   * and the caller says why (plan limit, offline, a server error). A caller
   * that returns nothing is treated as success, as before.
   */
  onSave: (food: Omit<Food, "id">) => Promise<boolean | void> | boolean | void;
  editFood?: Food | null;
}

const CATEGORY_VALUES: FoodCategory[] = ["protein", "carb", "dairy", "fruit", "vegetable", "snack"];
const UNIT_VALUES = ["servings", "packages", "count", "oz", "lbs", "cups", "tbsp"] as const;
const QUICK_QUANTITIES = [1, 2, 3, 5, 10];

/**
 * A row from the canonical catalog (US-799). This dialog reads no nutrition
 * FIGURES -- only the name, the category and the two serving/package strings
 * it prefills the form with -- so moving it off the `nutrition` table loses
 * nothing, now that 20260918000008 gave the catalog somewhere to keep the
 * free text.
 */
type NutritionItem = {
  id: string;
  name: string;
  default_category: string | null;
  serving_size_text?: string | null;
  package_quantity_text?: string | null;
  servings_per_container?: number | null;
  allergens?: string[] | null;
  /** 'verified' | 'unverified' | 'rejected' (gpc_verification_check). */
  verification?: string | null;
};

const roundQty = (n: number) => Math.round(n * 100) / 100;

export function AddFoodDialog({
  open,
  onOpenChange,
  onSave,
  editFood,
}: AddFoodDialogProps) {
  const { t } = useTranslation();
  const nameRequiredMsg = t("pantry.addDialog.nameRequired", "Food name is required");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<NutritionItem[]>([]);
  const [selectedNutrition, setSelectedNutrition] = useState<NutritionItem | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<FoodCategory>("protein");
  const [safety, setSafety] = useState<SafetyChoice>(NEW_FOOD_SAFETY);
  const [aisle, setAisle] = useState("");
  // Text, not a number: "0.5" has to survive being typed as "0." first.
  const [quantityText, setQuantityText] = useState("1");
  const [unit, setUnit] = useState("servings");
  const [servingsPerContainer, setServingsPerContainer] = useState<number | undefined>();
  const [packageQuantity, setPackageQuantity] = useState("");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [canonicalId, setCanonicalId] = useState<string | null>(null);

  // Validation state
  const [nameError, setNameError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const parsedQuantity = Number.parseFloat(quantityText);
  const quantity = Number.isFinite(parsedQuantity) && parsedQuantity >= 0 ? roundQty(parsedQuantity) : null;

  // Search nutrition database as user types
  useEffect(() => {
    // US-829: the debounce cleanup cancels the TIMER, not a query already in
    // flight. Typing "ch" then "chicken" fires both; `%ch%` matches far more
    // rows than `%chicken%`, so the broader, staler query is the one more
    // likely to finish last -- and it used to win, leaving results for "ch"
    // under a box reading "chicken". This flag makes the newest request the
    // only one that can write, and stops a setState after the dialog closes.
    let superseded = false;

    const searchNutrition = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        // US-799: the canonical catalog. name_normalized is what US-796's
        // matcher and the trigram index are built on, so the search hits the
        // index rather than scanning every name.
        const { data, error } = await supabase
          .from('grocery_product_catalog')
          .select('id, name, default_category, serving_size_text, package_quantity_text, servings_per_container, allergens, verification')
          // Normalized the same way the column is (lower, trim, collapse
          // whitespace runs -- normalize_product_name in
          // 20260908000000). Searching the raw string would miss
          // "chicken  breast" against a stored "chicken breast".
          .ilike('name_normalized', `%${searchQuery.toLowerCase().trim().replace(/\s+/g, ' ')}%`)
          .limit(10);

        if (error) throw error;
        if (superseded) return;
        setSearchResults(data || []);
      } catch (error) {
        if (superseded) return;
        logger.error('Search error:', error);
      } finally {
        // Guarded too: a stale request finishing would otherwise clear the
        // spinner while the current search is still running.
        if (!superseded) setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchNutrition, 300);
    return () => {
      superseded = true;
      clearTimeout(debounce);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (editFood) {
      setName(editFood.name);
      setCategory(editFood.category);
      setSafety(safetyFromFlags(editFood.is_safe, editFood.is_try_bite));
      setAisle(editFood.aisle || "");
      setQuantityText(String(editFood.quantity ?? 0));
      setUnit(editFood.unit || "servings");
      setServingsPerContainer(editFood.servings_per_container);
      setPackageQuantity(editFood.package_quantity || "");
      setAllergens(editFood.allergens ?? []);
      setCanonicalId(editFood.canonical_id ?? null);
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
    // US-803: a new food is not safe until the parent says so.
    setSafety(NEW_FOOD_SAFETY);
    setAisle("");
    setQuantityText("1");
    setUnit("servings");
    setServingsPerContainer(undefined);
    setPackageQuantity("");
    setAllergens([]);
    setCanonicalId(null);
    setShowConfirmation(false);
    setSelectedNutrition(null);
    setSearchQuery("");
    setSearchResults([]);
    setNameError("");
  };

  const handleSelectNutrition = (item: NutritionItem) => {
    setSelectedNutrition(item);
    setName(item.name);
    setCategory(mapCategoryToFoodCategory(item.default_category ?? ''));
    setPackageQuantity(item.package_quantity_text || "");
    setServingsPerContainer(item.servings_per_container ?? undefined);
    // Kept, not just shown: the catalog's allergens are what the kid-fit
    // badges match against, and canonical_id links the food to the catalog
    // row (US-795) so the next scan or receipt line stacks onto it.
    setAllergens((item.allergens ?? []).filter(Boolean));
    setCanonicalId(item.id);
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

  const stepQuantity = (delta: number) => {
    const base = quantity ?? 0;
    setQuantityText(String(roundQty(Math.max(0, base + delta))));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError(nameRequiredMsg);
      return;
    }
    if (quantity === null) return;
    setNameError("");
    setIsSaving(true);

    try {
      const result = await onSave({
        name: name.trim(),
        category,
        is_safe: safety === "safe",
        is_try_bite: safety === "try",
        aisle: aisle.trim() || undefined,
        quantity,
        unit,
        servings_per_container: servingsPerContainer,
        package_quantity: packageQuantity || undefined,
        allergens,
        canonical_id: canonicalId,
      });

      if (result === false) return;
      resetForm();
      onOpenChange(false);
    } catch (err) {
      // The caller reports its own failures; the form stays as typed.
      logger.error("AddFoodDialog save failed:", err);
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
          <DialogTitle>
            {editFood ? t("pantry.addDialog.editTitle", "Edit food") : t("pantry.addDialog.addTitle", "Add a food")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("pantry.addDialog.description", "Add or edit a food with its stock, allergens and whether your kids eat it")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!editFood && !showConfirmation && (
            <div className="space-y-2">
              {/* cmdk assigns the input its own id and points aria-labelledby
                  at the label it renders from `label`, so a Label htmlFor
                  cannot reach it. The accessible name comes from `label`;
                  the visible one is for sighted users only. */}
              <Label aria-hidden="true">{t("pantry.addDialog.searchLabel", "Search the food catalog")}</Label>
              <Command
                className="border rounded-md"
                shouldFilter={false}
                label={t("pantry.addDialog.searchLabel", "Search the food catalog")}
              >
                <CommandInput
                  placeholder={t("pantry.addDialog.searchPlaceholder", "Type at least 2 letters...")}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  {searchQuery.length < 2 && (
                    <CommandEmpty>{t("pantry.addDialog.searchStart", "Start typing to search")}</CommandEmpty>
                  )}
                  {searchQuery.length >= 2 && isSearching && (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                  {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                    <CommandEmpty>{t("pantry.addDialog.searchNone", "No foods found.")}</CommandEmpty>
                  )}
                  {searchQuery.length >= 2 && !isSearching && searchResults.length > 0 && (
                    <CommandGroup>
                      {searchResults.map((item) => (
                        <CommandItem
                          key={item.id}
                          onSelect={() => handleSelectNutrition(item)}
                          className="cursor-pointer min-h-11"
                          value={item.name}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {[item.default_category, item.serving_size_text, item.package_quantity_text]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
              <p className="text-xs text-muted-foreground">
                {t("pantry.addDialog.searchHint", "Pick a match to fill in the details, or type them below.")}
              </p>
            </div>
          )}

          {showConfirmation && selectedNutrition && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    {t("pantry.addDialog.found", { defaultValue: "Found in the catalog: {{name}}", name: selectedNutrition.name })}
                  </p>
                  {/* The catalog column is package_quantity_text; the old
                      `nutrition` table's was package_quantity, and this line
                      kept the old name, so the Package row never rendered. */}
                  {selectedNutrition.package_quantity_text && (
                    <p className="text-sm">
                      {t("pantry.addDialog.package", {
                        defaultValue: "Package: {{value}}",
                        value: selectedNutrition.package_quantity_text,
                      })}
                    </p>
                  )}
                  {selectedNutrition.servings_per_container && (
                    <p className="text-sm">
                      {t("pantry.addDialog.servingsPer", {
                        defaultValue: "Servings per container: {{value}}",
                        value: selectedNutrition.servings_per_container,
                      })}
                    </p>
                  )}
                  {/*
                    US-797: a barcode scan promotes itself into the shared
                    catalog as 'unverified', checked by nobody. The search still
                    finds those rows -- a product you just scanned should be
                    findable -- but an allergen badge from one is somebody's
                    photo of a label, and an EMPTY allergen list from one is not
                    a statement that the food is safe. Say which it is.
                  */}
                  {!isTrustedForTotals(selectedNutrition) && (
                    <p className="text-xs">
                      {t(
                        "pantry.addDialog.unverified",
                        "Added by another household and not checked yet. Confirm the details against the packet."
                      )}
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">{t("pantry.addDialog.nameLabel", "Food name *")}</Label>
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
                  setNameError(nameRequiredMsg);
                }
              }}
              placeholder={t("pantry.addDialog.namePlaceholder", "e.g., Chicken nuggets")}
              className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
              autoFocus
            />
            {nameError && (
              <p id="name-error" className="text-sm text-destructive mt-1">
                {nameError}
              </p>
            )}
          </div>

          {/* US-803: one question, three answers. Nothing is picked for the parent. */}
          <div className="space-y-2">
            <Label id="add-food-safety-label">{t("pantry.addDialog.safetyLabel", "Do your kids eat it?")}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={safety}
              onValueChange={(v) => {
                // Radix clears a single group when the pressed item is tapped
                // again; "Not set" is the explicit way back, so ignore that.
                if (v === "none" || v === "safe" || v === "try") setSafety(v);
              }}
              aria-labelledby="add-food-safety-label"
              className="grid grid-cols-3 gap-2"
              data-testid="add-food-safety"
            >
              <ToggleGroupItem value="none" className="min-h-11">
                {t("pantry.addDialog.safetyNone", "Not set")}
              </ToggleGroupItem>
              <ToggleGroupItem value="safe" className="min-h-11">
                {t("pantry.addDialog.safetySafe", "Safe food")}
              </ToggleGroupItem>
              <ToggleGroupItem value="try" className="min-h-11">
                {t("pantry.addDialog.safetyTry", "Try bite")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t("pantry.addDialog.categoryLabel", "Category")}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FoodCategory)}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_VALUES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {t(`pantry.addDialog.category.${cat}`, cat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p id="add-food-allergens-label" className="text-sm font-medium leading-none">
              {t("pantry.addDialog.allergensLabel", "Allergens")}
            </p>
            {allergens.length > 0 ? (
              <ul aria-labelledby="add-food-allergens-label" className="flex flex-wrap gap-1.5" data-testid="add-food-allergens">
                {allergens.map((allergen) => (
                  <li key={allergen}>
                    <Badge variant="destructive" className="gap-1 pr-1 text-xs">
                      {allergen}
                      <button
                        type="button"
                        className="-my-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-destructive-foreground/20"
                        onClick={() => setAllergens((prev) => prev.filter((a) => a !== allergen))}
                        aria-label={t("pantry.addDialog.removeAllergen", {
                          defaultValue: "Remove allergen {{name}}",
                          name: allergen,
                        })}
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("pantry.addDialog.allergensNone", "None recorded")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="aisle">{t("pantry.addDialog.aisleLabel", "Grocery aisle (optional)")}</Label>
            <Input
              id="aisle"
              value={aisle}
              onChange={(e) => setAisle(e.target.value)}
              placeholder={t("pantry.addDialog.aislePlaceholder", "e.g., Frozen, Produce, Dairy")}
            />
          </div>

          {packageQuantity && (
            <div className="space-y-2">
              <Label htmlFor="package">{t("pantry.addDialog.packageLabel", "Package details")}</Label>
              <Input
                id="package"
                value={packageQuantity}
                onChange={(e) => setPackageQuantity(e.target.value)}
                placeholder={t("pantry.addDialog.packagePlaceholder", "e.g., 20 nuggets, 16 oz")}
              />
            </div>
          )}

          {servingsPerContainer !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="servings">{t("pantry.addDialog.servingsLabel", "Servings per container")}</Label>
              <Input
                id="servings"
                type="number"
                min="1"
                value={servingsPerContainer}
                onChange={(e) => setServingsPerContainer(parseInt(e.target.value) || undefined)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity">{t("pantry.addDialog.quantityLabel", "Quantity in stock")}</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="quantity"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.25"
                  value={quantityText}
                  onChange={(e) => setQuantityText(e.target.value)}
                  aria-invalid={quantity === null}
                  className="flex-1"
                />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => stepQuantity(-1)}
                    disabled={(quantity ?? 0) <= 0}
                    className="h-11 w-11"
                    aria-label={t("pantry.addDialog.decrease", "Decrease quantity")}
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => stepQuantity(1)}
                    className="h-11 w-11"
                    aria-label={t("pantry.addDialog.increase", "Increase quantity")}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap">
                {QUICK_QUANTITIES.map(num => (
                  <Button
                    key={num}
                    type="button"
                    variant={quantity === num ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setQuantityText(String(num))}
                    aria-pressed={quantity === num}
                    className="h-11 min-w-11 px-3 text-xs"
                  >
                    {num}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">{t("pantry.addDialog.unitLabel", "Unit")}</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* A unit the list doesn't know (from a scan or a receipt)
                      still shows, instead of rendering an empty trigger. */}
                  {!(UNIT_VALUES as readonly string[]).includes(unit) && unit && (
                    <SelectItem value={unit}>{unit}</SelectItem>
                  )}
                  {UNIT_VALUES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {t(`pantry.addDialog.unit.${u}`, u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("pantry.addDialog.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || quantity === null || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSaving
              ? t("pantry.addDialog.saving", "Saving...")
              : editFood
                ? t("pantry.addDialog.update", "Update")
                : t("pantry.addDialog.save", "Add food")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
