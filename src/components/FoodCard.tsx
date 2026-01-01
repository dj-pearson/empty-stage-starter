import { useState } from "react";
import { Food } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Package, AlertTriangle, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
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

const categoryColors: Record<string, string> = {
  protein: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  carb: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  dairy: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  fruit: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  vegetable: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  snack: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

export function FoodCard({ food, onEdit, onDelete, onQuantityChange, kidAllergens }: FoodCardProps) {
  const [showZeroQuantityDialog, setShowZeroQuantityDialog] = useState(false);

  // Filter allergens to only show those that match family member allergens
  const relevantAllergens = food.allergens?.filter(allergen =>
    kidAllergens?.includes(allergen)
  ) || [];

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
      // Show confirmation dialog when going from 1 to 0
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
    <Card className={cn(
      "p-4 hover:shadow-lg transition-shadow",
      hasAllergen && "border-2 border-destructive"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="font-semibold text-lg break-words">{food.name}</h3>
          </div>
          
          {/* Quick Quantity Adjuster */}
          {onQuantityChange && (
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="icon"
                variant="outline"
                onClick={handleDecrement}
                className="h-8 w-8"
                disabled={(food.quantity || 0) === 0}
                aria-label={`Decrease quantity of ${food.name}`}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <div className="flex items-center gap-2 min-w-[100px] justify-center">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-lg">
                  {food.quantity || 0}
                </span>
                <span className="text-sm text-muted-foreground">
                  {food.unit || 'qty'}
                </span>
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={handleIncrement}
                className="h-8 w-8"
                aria-label={`Increase quantity of ${food.name}`}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
          
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className={categoryColors[food.category]}>
              {food.category}
            </Badge>
            {food.is_safe && (
              <Badge className="bg-safe-food text-white">Safe Food</Badge>
            )}
            {food.is_try_bite && (
              <Badge className="bg-try-bite text-white">Try Bite</Badge>
            )}
            {hasAllergen && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <AlertTriangle className="h-3 w-3" />
                ALLERGEN WARNING
              </Badge>
            )}
            {/* Only show allergens that match family members */}
            {relevantAllergens.length > 0 && (
              <div className="flex flex-wrap gap-1 w-full mt-1">
                {relevantAllergens.map((allergen) => (
                  <Badge 
                    key={allergen} 
                    variant="destructive"
                    className="text-xs"
                  >
                    {allergen}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(food)}
            className="h-8 w-8"
            aria-label={`Edit ${food.name}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                aria-label={`Delete ${food.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {food.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove <strong>{food.name}</strong> from your pantry and all meal plans. This action cannot be undone.
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

      {/* Zero Quantity Confirmation Dialog */}
      <AlertDialog open={showZeroQuantityDialog} onOpenChange={setShowZeroQuantityDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quantity reaching zero</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{food.name}</strong> quantity will be 0. Would you like to delete it from your pantry or keep it at quantity 0?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={handleSetToZero}
            >
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
}
