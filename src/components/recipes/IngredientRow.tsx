import { memo, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X } from "lucide-react";
import "@/i18n/appLocale";

export interface IngredientRowData {
  id: string;
  /** US-721: recipe_ingredients.id when this row came from a saved recipe. */
  rowId?: string;
  food_id?: string;
  name: string;
  quantity: string;
  unit: string;
  prepNotes: string;
  isOptional: boolean;
  section?: string;
}

interface IngredientRowProps {
  ingredient: IngredientRowData;
  /**
   * Stable callbacks keyed by row id, so the parent can pass one useCallback
   * to every row and memo() actually skips the rows that did not change.
   */
  onUpdate: (id: string, updates: Partial<IngredientRowData>) => void;
  onRemove: (id: string) => void;
}

const UNITS = [
  "cups",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "g",
  "kg",
  "ml",
  "L",
  "pieces",
  "slices",
  "cloves",
  "whole",
  "pinch",
  "to taste",
];

/**
 * One ingredient. Below `sm` it is two lines: the name with its optional and
 * remove controls, then quantity, unit and prep notes. At `sm` and up it is a
 * single row in DOM order (every `order-*` resets and the line break hides).
 */
export const IngredientRow = memo(function IngredientRow({
  ingredient,
  onUpdate,
  onRemove,
}: IngredientRowProps) {
  const { t } = useTranslation();
  const { id, name, unit } = ingredient;
  const optionalId = useId();

  // An imported or older row can carry a unit outside the list ("can",
  // "handful"). Radix renders nothing for a value with no matching item, so
  // it is offered first rather than silently shown as blank.
  const units = useMemo(() => (unit && !UNITS.includes(unit) ? [unit, ...UNITS] : UNITS), [unit]);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 border-b last:border-b-0 sm:flex-nowrap sm:border-b-0 sm:py-1.5">
      {/* Name */}
      <div className="order-1 flex-1 min-w-0 sm:order-none">
        <span className="text-sm font-medium sm:font-normal truncate block">{name}</span>
      </div>

      {/* Quantity */}
      <Input
        type="text"
        inputMode="decimal"
        placeholder={t("recipes.builder.qty", { defaultValue: "Qty" })}
        aria-label={t("recipes.builder.qtyFor", { defaultValue: "Quantity of {{name}}", name })}
        value={ingredient.quantity}
        onChange={(e) => onUpdate(id, { quantity: e.target.value })}
        className="order-5 w-20 h-10 text-sm text-center sm:order-none sm:w-16 sm:h-8"
      />

      {/* Unit */}
      <Select value={unit} onValueChange={(v) => onUpdate(id, { unit: v })}>
        <SelectTrigger
          className="order-6 w-[96px] h-10 text-xs sm:order-none sm:w-[90px] sm:h-8"
          aria-label={t("recipes.builder.unitFor", { defaultValue: "Unit for {{name}}", name })}
        >
          <SelectValue placeholder={t("recipes.builder.unit", { defaultValue: "Unit" })} />
        </SelectTrigger>
        <SelectContent>
          {units.map((u) => (
            <SelectItem key={u} value={u} className="text-xs">
              {u}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Prep notes: visible on a phone too, on the second line. */}
      <Input
        placeholder={t("recipes.builder.prepPlaceholder", { defaultValue: "e.g. diced" })}
        aria-label={t("recipes.builder.prepFor", { defaultValue: "Prep notes for {{name}}", name })}
        value={ingredient.prepNotes}
        onChange={(e) => onUpdate(id, { prepNotes: e.target.value })}
        className="order-7 flex-1 min-w-[6rem] h-10 text-xs sm:order-none sm:flex-none sm:w-24 sm:h-8"
      />

      {/* Optional toggle */}
      <label
        htmlFor={optionalId}
        className="order-2 flex min-h-[44px] items-center gap-1.5 px-1 cursor-pointer shrink-0 sm:order-none sm:min-h-0"
      >
        <Checkbox
          id={optionalId}
          checked={ingredient.isOptional}
          onCheckedChange={(checked) => onUpdate(id, { isOptional: checked === true })}
        />
        <span className="text-xs text-muted-foreground">
          {t("recipes.builder.optional", { defaultValue: "Optional" })}
        </span>
      </label>

      {/* Remove */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="order-3 h-11 w-11 shrink-0 sm:order-none sm:h-8 sm:w-8"
        onClick={() => onRemove(id)}
        aria-label={t("recipes.builder.removeIngredient", { defaultValue: "Remove {{name}}", name })}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>

      {/* Line break below sm. */}
      <div className="order-4 basis-full h-0 sm:hidden" aria-hidden="true" />
    </div>
  );
});
