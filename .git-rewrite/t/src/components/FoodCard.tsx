import { Food } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FoodCardProps {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (id: string) => void;
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

export function FoodCard({ food, onEdit, onDelete, kidAllergens }: FoodCardProps) {
  // Check if food contains any allergens for the kid
  const hasAllergen = kidAllergens && food.allergens && 
    food.allergens.some(allergen => kidAllergens.includes(allergen));
  
  const matchingAllergens = hasAllergen && food.allergens 
    ? food.allergens.filter(allergen => kidAllergens?.includes(allergen))
    : [];

  return (
    <Card className={cn(
      "p-4 hover:shadow-lg transition-shadow",
      hasAllergen && "border-2 border-destructive"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="font-semibold text-lg break-words">{food.name}</h3>
            {(food.quantity ?? 0) > 0 && (
              <Badge variant="secondary" className="gap-1 shrink-0">
                <Package className="h-3 w-3" />
                {food.quantity} {food.unit || 'servings'}
              </Badge>
            )}
            {(food.quantity ?? 0) === 0 && (
              <Badge variant="destructive" className="gap-1 shrink-0">
                <Package className="h-3 w-3" />
                Out of stock
              </Badge>
            )}
          </div>
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
            {food.allergens && food.allergens.length > 0 && (
              <div className="flex flex-wrap gap-1 w-full mt-1">
                {food.allergens.map((allergen) => (
                  <Badge 
                    key={allergen} 
                    variant={matchingAllergens.includes(allergen) ? "destructive" : "secondary"}
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
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(food.id)}
            className="h-8 w-8 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
