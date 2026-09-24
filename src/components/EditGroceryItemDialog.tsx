import { useState, useEffect, useId } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus } from "lucide-react";
import type { FoodCategory, GroceryItem } from "@/types";
import { stepQuantity } from "@/lib/groceryData";
import "@/i18n/appLocale";

const KNOWN_CATEGORIES: readonly FoodCategory[] = ["protein", "carb", "dairy", "fruit", "vegetable", "snack"];

/**
 * grocery_items.category is free text (see categoryLabel in groceryData), so a
 * row can hold "beverage" or "other" even though GroceryItem narrows it to
 * FoodCategory. The select offers "Other" for those; the cast only names a
 * value the column already holds.
 */
const OTHER = "other";
type CategoryChoice = FoodCategory | typeof OTHER;

function toChoice(category: string | null | undefined): CategoryChoice {
  return KNOWN_CATEGORIES.includes(category as FoodCategory) ? (category as FoodCategory) : OTHER;
}

const editGroceryItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().max(24),
  aisle: z.string().trim().max(60),
  notes: z.string().trim().max(500),
});

interface EditGroceryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: GroceryItem | null;
  onSave: (id: string, updates: Partial<GroceryItem>) => void;
  /** Aisle names already on the list, offered as suggestions. */
  aisleOptions?: string[];
}

export function EditGroceryItemDialog({ open, onOpenChange, item, onSave, aisleOptions = [] }: EditGroceryItemDialogProps) {
  const { t } = useTranslation();
  const aisleListId = useId();
  const [name, setName] = useState("");
  // Text until save, so "1." or an emptied box mid-edit is not snapped to 0.
  const [quantityText, setQuantityText] = useState("1");
  const [unit, setUnit] = useState("");
  const [aisle, setAisle] = useState("");
  const [category, setCategory] = useState<CategoryChoice>("snack");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setQuantityText(String(item.quantity));
      setUnit(item.unit || "");
      setAisle(item.aisle || "");
      setCategory(toChoice(item.category));
      setPriority(item.priority || "medium");
      setNotes(item.notes || "");
      setError(null);
    }
  }, [item]);

  const currentQuantity = (): number => {
    const parsed = parseFloat(quantityText);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : item?.quantity ?? 1;
  };

  const step = (delta: number) => setQuantityText(String(stepQuantity(currentQuantity(), delta)));

  const handleSave = () => {
    if (!item) return;
    const parsed = editGroceryItemSchema.safeParse({
      name,
      quantity: parseFloat(quantityText),
      unit,
      aisle,
      notes,
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setError(
        field === "name"
          ? t("grocery.edit.errors.name", "Name must be 1 to 120 characters.")
          : field === "notes"
            ? t("grocery.edit.errors.notes", "Notes can be up to 500 characters.")
            : field === "quantity"
              ? t("grocery.edit.errors.quantity", "Quantity must be a number above 0.")
              : t("grocery.edit.errors.generic", "Check the highlighted fields."),
      );
      return;
    }
    const data = parsed.data;
    const updates: Partial<GroceryItem> = {
      name: data.name,
      quantity: data.quantity,
      unit: data.unit,
      priority,
      // null, not undefined: undefined is dropped from the update, so clearing
      // the notes box never cleared the note.
      notes: data.notes || null,
    };
    // Empty string clears the aisle; the page files an empty aisle under
    // Uncategorized, as it does a missing one.
    if (data.aisle !== (item.aisle ?? "")) updates.aisle = data.aisle;
    // "Other" on a row that already held an unlisted category ("beverage")
    // leaves it alone rather than flattening it.
    if (category !== toChoice(item.category)) {
      updates.category = category as FoodCategory;
    }
    onSave(item.id, updates);
    onOpenChange(false);
  };

  const categoryOptions: { value: CategoryChoice; label: string }[] = [
    { value: "protein", label: t("grocery.input.category.protein", "Protein") },
    { value: "carb", label: t("grocery.input.category.carb", "Carbs") },
    { value: "dairy", label: t("grocery.input.category.dairy", "Dairy") },
    { value: "fruit", label: t("grocery.input.category.fruit", "Fruit") },
    { value: "vegetable", label: t("grocery.input.category.vegetable", "Vegetables") },
    { value: "snack", label: t("grocery.input.category.snack", "Snacks") },
    { value: OTHER, label: t("grocery.input.category.other", "Other") },
  ];

  const uniqueAisles = [...new Set(aisleOptions.map((a) => a.trim()).filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("grocery.edit.title", "Edit item")}</DialogTitle>
          <DialogDescription>
            {t("grocery.edit.description", "Change the amount, aisle, category, priority or notes.")}
          </DialogDescription>
        </DialogHeader>

        <form
          id="edit-grocery-item-form"
          className="space-y-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div>
            <Label htmlFor="edit-name">{t("grocery.edit.name", "Name")}</Label>
            <Input
              id="edit-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!name.trim()}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-qty">{t("grocery.edit.quantity", "Quantity")}</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => step(-1)}
                  aria-label={t("grocery.edit.decrease", "Decrease quantity")}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Input
                  id="edit-qty"
                  type="text"
                  inputMode="decimal"
                  className="h-11 min-w-0 text-center"
                  value={quantityText}
                  onChange={(e) => setQuantityText(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => step(1)}
                  aria-label={t("grocery.edit.increase", "Increase quantity")}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="edit-unit">{t("grocery.edit.unit", "Unit")}</Label>
              <Input
                id="edit-unit"
                className="h-11"
                maxLength={24}
                placeholder={t("grocery.edit.unitPlaceholder", "lb, oz, pc...")}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-aisle">{t("grocery.edit.aisle", "Aisle")}</Label>
              <Input
                id="edit-aisle"
                className="h-11"
                maxLength={60}
                list={uniqueAisles.length > 0 ? aisleListId : undefined}
                placeholder={t("grocery.edit.aislePlaceholder", "e.g. Produce")}
                value={aisle}
                onChange={(e) => setAisle(e.target.value)}
              />
              {uniqueAisles.length > 0 && (
                <datalist id={aisleListId}>
                  {uniqueAisles.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </datalist>
              )}
            </div>
            <div>
              <Label htmlFor="edit-category">{t("grocery.edit.category", "Category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CategoryChoice)}>
                <SelectTrigger id="edit-category" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="edit-priority">{t("grocery.edit.priority", "Priority")}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}>
              <SelectTrigger id="edit-priority" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("grocery.edit.priorityLow", "Low")}</SelectItem>
                <SelectItem value="medium">{t("grocery.edit.priorityMedium", "Medium")}</SelectItem>
                <SelectItem value="high">{t("grocery.edit.priorityHigh", "High - need soon")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="edit-notes">{t("grocery.edit.notes", "Notes")}</Label>
            <Textarea
              id="edit-notes"
              rows={2}
              maxLength={500}
              placeholder={t("grocery.edit.notesPlaceholder", "Brand preference, size, etc.")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("grocery.edit.cancel", "Cancel")}
          </Button>
          <Button type="submit" form="edit-grocery-item-form" disabled={!name.trim()}>
            {t("grocery.edit.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
