import { memo } from "react";
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
import { GripVertical, X } from "lucide-react";

export interface IngredientRowData {
  id: string;
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
  onUpdate: (updates: Partial<IngredientRowData>) => void;
  onRemove: () => void;
  dragHandleProps?: Record<string, unknown>;
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

export const IngredientRow = memo(function IngredientRow({
  ingredient,
  onUpdate,
  onRemove,
  dragHandleProps,
}: IngredientRowProps) {
  return (
    <div className="flex items-center gap-2 py-1.5 group">
      {/* Drag handle */}
      <div
        className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground"
        {...dragHandleProps}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <span className="text-sm truncate block">{ingredient.name}</span>
      </div>

      {/* Quantity */}
      <Input
        type="text"
        placeholder="Qty"
        value={ingredient.quantity}
        onChange={(e) => onUpdate({ quantity: e.target.value })}
        className="w-16 h-8 text-sm text-center"
      />

      {/* Unit */}
      <Select
        value={ingredient.unit}
        onValueChange={(v) => onUpdate({ unit: v })}
      >
        <SelectTrigger className="w-[90px] h-8 text-xs">
          <SelectValue placeholder="Unit" />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map((unit) => (
            <SelectItem key={unit} value={unit} className="text-xs">
              {unit}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Prep notes */}
      <Input
        placeholder="e.g. diced"
        value={ingredient.prepNotes}
        onChange={(e) => onUpdate({ prepNotes: e.target.value })}
        className="w-24 h-8 text-xs hidden sm:block"
      />

      {/* Optional toggle */}
      <label className="flex items-center gap-1 cursor-pointer shrink-0" title="Optional">
        <Checkbox
          checked={ingredient.isOptional}
          onCheckedChange={(checked) =>
            onUpdate({ isOptional: checked === true })
          }
          className="h-3.5 w-3.5"
        />
        <span className="text-[10px] text-muted-foreground">opt</span>
      </label>

      {/* Remove */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
        aria-label="Remove ingredient"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});
