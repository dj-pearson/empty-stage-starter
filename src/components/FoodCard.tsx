import { useState, memo } from "react";
import { Food } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, AlertTriangle, Plus, Minus, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG, getStockStatus } from "@/components/pantry/pantryConstants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface FoodCardProps {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (id: string) => void;
  onQuantityChange?: (id: string, newQuantity: number) => void;
  kidAllergens?: string[];
}

export const FoodCard = memo(function FoodCard({
  food,
  onEdit,
  onDelete,
  onQuantityChange,
  kidAllergens,
}: FoodCardProps) {
  const [showZeroQuantityDialog, setShowZeroQuantityDialog] = useState(false);

  const config = CATEGORY_CONFIG[food.category];
  const stockStatus = getStockStatus(food.quantity);

  const relevantAllergens =
    food.allergens?.filter((allergen) => kidAllergens?.includes(allergen)) || [];
  const hasAllergen = relevantAllergens.length > 0;

  const handleIncrement = () => {
    if (onQuantityChange) {
      onQuantityChange(food.id, (food.quantity || 0) + 1);
    }
  };

  const handleDecrement = () => {
    if (!onQuantityChange) return;
    const currentQuantity = food.quantity || 0;
    if (currentQuantity === 1) {
      setShowZeroQuantityDialog(true);
    } else if (currentQuantity > 1) {
      onQuantityChange(food.id, currentQuantity - 1);
    }
  };

  const handleSetToZero = () => {
    if (onQuantityChange) {
      onQuantityChange(food.id, 0);
    }
    setShowZeroQuantityDialog(false);
  };

  const handleDeleteFromZero = () => {
    onDelete(food.id);
    setShowZeroQuantityDialog(false);
  };

  return (
    <Card
      className={cn(
        "border-l-4 transition-all duration-200 hover:shadow-md group relative overflow-hidden",
        config.borderLeft,
        hasAllergen && "ring-2 ring-destructive/50",
        stockStatus === "out" && "opacity-70",
        stockStatus === "low" && "bg-amber-50/50 dark:bg-amber-950/10"
      )}
    >
      <div className="p-3.5">
        {/* Top row: Name + Actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-tight truncate">
              {food.name}
            </h3>
          </div>
          <div className="flex gap-0.5 shrink-0 transition-opacity md:opacity-40 md:group-hover:opacity-100">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onEdit(food)}
              className="h-7 w-7"
              aria-label={`Edit ${food.name}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label={`Delete ${food.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {food.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove{" "}
                    <strong>{food.name}</strong> from your pantry and all
                    meal plans. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(food.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Badge
            variant="outline"
            className={cn("text-[11px] px-1.5 py-0 h-5", config.badgeBg, config.badgeText)}
          >
            {config.label}
          </Badge>
          {food.is_safe && (
            <Badge className="bg-safe-food text-white text-[11px] px-1.5 py-0 h-5">
              Safe
            </Badge>
          )}
          {food.is_try_bite && (
            <Badge className="bg-try-bite text-white text-[11px] px-1.5 py-0 h-5">
              Try Bite
            </Badge>
          )}
          {stockStatus === "out" && (
            <Badge
              variant="destructive"
              className="text-[11px] px-1.5 py-0 h-5 gap-0.5"
            >
              <PackageOpen className="h-3 w-3" />
              Out
            </Badge>
          )}
          {stockStatus === "low" && (
            <Badge
              variant="outline"
              className="text-[11px] px-1.5 py-0 h-5 gap-0.5 border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700"
            >
              Low
            </Badge>
          )}
        </div>

        {/* Quantity stepper */}
        {onQuantityChange && (
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="icon"
              variant="outline"
              onClick={handleDecrement}
              className="h-8 w-8 shrink-0"
              disabled={(food.quantity || 0) === 0}
              aria-label={`Decrease quantity of ${food.name}`}
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <div className="flex items-center gap-1.5 flex-1 justify-center min-w-0">
              <span
                className={cn(
                  "font-bold text-lg tabular-nums leading-none",
                  stockStatus === "out" && "text-destructive",
                  stockStatus === "low" && "text-amber-600 dark:text-amber-400"
                )}
              >
                {food.quantity ?? 0}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {food.unit || "qty"}
              </span>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={handleIncrement}
              className="h-8 w-8 shrink-0"
              aria-label={`Increase quantity of ${food.name}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}

        {/* Allergen warning */}
        {hasAllergen && (
          <div className="mt-2.5 flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium truncate">
              {relevantAllergens.join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Zero Quantity Confirmation Dialog */}
      <AlertDialog
        open={showZeroQuantityDialog}
        onOpenChange={setShowZeroQuantityDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quantity reaching zero</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{food.name}</strong> quantity will be 0. Would you like
              to delete it from your pantry or keep it at quantity 0?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={handleSetToZero}>
              Keep at 0
            </Button>
            <AlertDialogAction
              onClick={handleDeleteFromZero}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Food
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
});
