import { memo } from "react";
import { Food } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, AlertTriangle, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG, getStockStatus } from "./pantryConstants";

interface PantryListItemProps {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (id: string) => void;
  onQuantityChange?: (id: string, newQuantity: number) => void;
  kidAllergens?: string[];
}

export const PantryListItem = memo(function PantryListItem({
  food,
  onEdit,
  onDelete,
  onQuantityChange,
  kidAllergens,
}: PantryListItemProps) {
  const config = CATEGORY_CONFIG[food.category];
  const stockStatus = getStockStatus(food.quantity);
  const relevantAllergens =
    food.allergens?.filter((a) => kidAllergens?.includes(a)) || [];
  const hasAllergen = relevantAllergens.length > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors group",
        stockStatus === "out" && "opacity-60 bg-muted/20",
        stockStatus === "low" && "bg-amber-50/30 dark:bg-amber-950/10",
        hasAllergen && "bg-destructive/5"
      )}
    >
      {/* Category dot */}
      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", config.dot)} />

      {/* Name */}
      <span
        className={cn(
          "font-medium text-sm flex-1 truncate min-w-0",
          stockStatus === "out" && "text-muted-foreground line-through"
        )}
      >
        {food.name}
      </span>

      {/* Status badges */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {food.is_safe && (
          <Badge className="bg-safe-food text-white text-[10px] px-1.5 py-0 h-[18px]">
            Safe
          </Badge>
        )}
        {food.is_try_bite && (
          <Badge className="bg-try-bite text-white text-[10px] px-1.5 py-0 h-[18px]">
            Try
          </Badge>
        )}
        {hasAllergen && (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        )}
      </div>

      {/* Quantity stepper */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            if (!onQuantityChange) return;
            const qty = food.quantity || 0;
            if (qty > 0) onQuantityChange(food.id, qty - 1);
          }}
          className="h-6 w-6"
          disabled={(food.quantity || 0) === 0}
          aria-label={`Decrease ${food.name}`}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span
          className={cn(
            "w-8 text-center font-semibold text-sm tabular-nums",
            stockStatus === "out" && "text-destructive",
            stockStatus === "low" && "text-amber-600 dark:text-amber-400"
          )}
        >
          {food.quantity ?? 0}
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            if (onQuantityChange) {
              onQuantityChange(food.id, (food.quantity || 0) + 1);
            }
          }}
          className="h-6 w-6"
          aria-label={`Increase ${food.name}`}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Unit */}
      <span className="text-xs text-muted-foreground w-12 truncate hidden sm:block">
        {food.unit || "qty"}
      </span>

      {/* Actions */}
      <div className="flex gap-0.5 shrink-0 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onEdit(food)}
          className="h-7 w-7"
          aria-label={`Edit ${food.name}`}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(food.id)}
          className="h-7 w-7 text-destructive hover:text-destructive"
          aria-label={`Delete ${food.name}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
});
