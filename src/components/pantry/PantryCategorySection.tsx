import { memo } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Food, FoodCategory } from "@/types";
import { FoodCard } from "@/components/FoodCard";
import { PantryListItem } from "./PantryListItem";
import { CATEGORY_CONFIG, type ViewMode } from "./pantryConstants";

interface PantryCategorySectionProps {
  category: FoodCategory;
  items: Food[];
  isOpen: boolean;
  onToggle: () => void;
  viewMode: ViewMode;
  onEdit: (food: Food) => void;
  onDelete: (id: string) => void;
  onQuantityChange: (id: string, newQuantity: number) => void;
  kidAllergens: string[];
}

export const PantryCategorySection = memo(function PantryCategorySection({
  category,
  items,
  isOpen,
  onToggle,
  viewMode,
  onEdit,
  onDelete,
  onQuantityChange,
  kidAllergens,
}: PantryCategorySectionProps) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  const lowStockCount = items.filter(
    (f) => (f.quantity ?? 0) <= 2
  ).length;

  if (items.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
            "hover:shadow-sm active:scale-[0.99]",
            config.bgLight,
            config.bgDark,
            config.border,
            "border"
          )}
        >
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              config.dot
            )}
          >
            <Icon className="h-4 w-4 text-white" />
          </div>
          <span className={cn("font-semibold text-sm", config.text)}>
            {config.label}
          </span>
          <Badge
            variant="secondary"
            className="ml-0.5 text-xs h-5 px-1.5 tabular-nums"
          >
            {items.length}
          </Badge>
          {lowStockCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-[18px] border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700"
            >
              {lowStockCount} low
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 ml-auto transition-transform duration-200 text-muted-foreground",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2.5 mb-5">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map((food) => (
              <FoodCard
                key={food.id}
                food={food}
                onEdit={onEdit}
                onDelete={onDelete}
                onQuantityChange={onQuantityChange}
                kidAllergens={kidAllergens}
              />
            ))}
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden divide-y">
            {items.map((food) => (
              <PantryListItem
                key={food.id}
                food={food}
                onEdit={onEdit}
                onDelete={onDelete}
                onQuantityChange={onQuantityChange}
                kidAllergens={kidAllergens}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
});
