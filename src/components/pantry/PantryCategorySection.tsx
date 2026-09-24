import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Food } from "@/types";
import { FoodCard } from "@/components/FoodCard";
import type { CatalogEntry } from "@/lib/effectiveFood";
import type { ItemFit } from "@/lib/kidFit";
import { computeStockStats } from "@/lib/pantryData";
import { ingredientMatchKey } from "@/lib/groceryMerge";
import { PantryListItem } from "./PantryListItem";
import {
  getCategoryConfig,
  STOCK_TONE,
  type PantryCategoryKey,
  type ViewMode,
} from "./pantryConstants";
import "@/i18n/appLocale";

interface PantryCategorySectionProps {
  category: PantryCategoryKey;
  items: Food[];
  isOpen: boolean;
  /** Receives the category, so the parent can pass one stable callback. */
  onToggle: (cat: PantryCategoryKey) => void;
  viewMode: ViewMode;
  onEdit: (food: Food) => void;
  onDelete: (id: string) => void;
  onQuantityChange: (id: string, newQuantity: number) => void;
  /** US-672: the last of it was thrown out. */
  onWaste?: (id: string, quantity: number) => void;
  onAddToGrocery?: (food: Food) => void;
  /** Legacy household allergen list; superseded per item by `fitByFoodId`. */
  kidAllergens: string[];
  /** US-797: the catalog row a food is linked to, for provenance and credit. */
  getCatalog?: (food: Food) => CatalogEntry | null;
  /** Per-kid fit, keyed by food id. */
  fitByFoodId?: Map<string, ItemFit>;
  /**
   * What is already on the grocery list. Matched on the food id and on
   * ingredientMatchKey(food.name), the key the grocery merge stacks on.
   */
  onListKeys?: Set<string>;
  /** Estimated days until each food runs out, keyed by food id. */
  runsOutInDays?: Map<string, number>;
  /** Item 21: list rows' "used up" (button and left swipe). */
  onUsedUp?: (food: Food) => void;
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
  onWaste,
  onAddToGrocery,
  kidAllergens,
  getCatalog,
  fitByFoodId,
  onListKeys,
  runsOutInDays,
  onUsedUp,
}: PantryCategorySectionProps) {
  const { t } = useTranslation();
  const config = getCategoryConfig(category);
  const Icon = config.icon;
  // Same rule as the stats everywhere else: out is <= 0, low is 1..threshold.
  // A zero-quantity item used to count as "low" here.
  const { lowStock, outOfStock } = useMemo(() => computeStockStats(items), [items]);
  const handleOpenChange = useCallback(() => onToggle(category), [onToggle, category]);

  if (items.length === 0) return null;

  const isOnList = (food: Food): boolean | undefined =>
    onListKeys ? onListKeys.has(food.id) || onListKeys.has(ingredientMatchKey(food.name)) : undefined;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200",
            "hover:shadow-sm",
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
            <Icon className={cn("h-4 w-4", config.iconOnDot)} aria-hidden="true" />
          </div>
          <span className={cn("font-semibold text-sm", config.text)}>
            {t(config.labelKey, config.label)}
          </span>
          <Badge
            variant="secondary"
            className="ml-0.5 text-xs h-5 px-1.5 tabular-nums"
          >
            {items.length}
          </Badge>
          {outOfStock > 0 && (
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 h-[18px]", STOCK_TONE.out.chip)}
            >
              {t("pantry.item.sectionOut", {
                defaultValue_one: "{{count}} out",
                defaultValue: "{{count}} out",
                count: outOfStock,
              })}
            </Badge>
          )}
          {lowStock > 0 && (
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 h-[18px]", STOCK_TONE.low.chip)}
            >
              {t("pantry.item.sectionLow", {
                defaultValue_one: "{{count}} low",
                defaultValue: "{{count}} low",
                count: lowStock,
              })}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 ml-auto transition-transform duration-200 text-muted-foreground motion-reduce:transition-none",
              isOpen && "rotate-180"
            )}
            aria-hidden="true"
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
                onWaste={onWaste}
                kidAllergens={kidAllergens}
                catalog={getCatalog?.(food) ?? null}
                fit={fitByFoodId?.get(food.id)}
                onAddToGrocery={onAddToGrocery}
                onList={isOnList(food)}
                runsOutInDays={runsOutInDays?.get(food.id)}
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
                onWaste={onWaste}
                onAddToGrocery={onAddToGrocery}
                kidAllergens={kidAllergens}
                catalog={getCatalog?.(food) ?? null}
                fit={fitByFoodId?.get(food.id)}
                onList={isOnList(food)}
                runsOutInDays={runsOutInDays?.get(food.id)}
                onUsedUp={onUsedUp}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
});
