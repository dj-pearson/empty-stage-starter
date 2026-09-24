import { memo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Food } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, AlertTriangle, Plus, Minus, ShoppingCart, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchingAllergen } from "@/lib/allergens";
import { resolveFood, type CatalogEntry } from "@/lib/effectiveFood";
import type { ItemFit } from "@/lib/kidFit";
import { KidFitBadges } from "@/components/recipes/KidFitBadges";
import { DataSourceCredit } from "@/components/DataSourceCredit";
import {
  getCategoryConfig,
  getStockStatus,
  isLastUnit,
  parseQuantityInput,
  stepDown,
  STOCK_TONE,
} from "./pantryConstants";
import { ZeroQuantityDialog } from "./ZeroQuantityDialog";
import "@/i18n/appLocale";

interface PantryListItemProps {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (id: string) => void;
  onQuantityChange?: (id: string, newQuantity: number) => void;
  /** US-672: the last of it was thrown out (ledger waste, not a correction). */
  onWaste?: (id: string, quantity: number) => void;
  onAddToGrocery?: (food: Food) => void;
  /** The food is already on the grocery list. */
  onList?: boolean;
  /** Legacy household allergen list. Ignored when `fit` is given. */
  kidAllergens?: string[];
  /** How this food fits each kid (src/lib/kidFit.ts). */
  fit?: ItemFit;
  /** US-797: the linked catalog row, for the ODbL credit. */
  catalog?: CatalogEntry | null;
  /** Estimated days until this runs out, shown on low rows. */
  runsOutInDays?: number;
}

const PRESETS = [-5, -2, 2, 5] as const;

export const PantryListItem = memo(function PantryListItem({
  food,
  onEdit,
  onDelete,
  onQuantityChange,
  onWaste,
  onAddToGrocery,
  onList,
  kidAllergens,
  fit,
  catalog,
  runsOutInDays,
}: PantryListItemProps) {
  const { t } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showZeroDialog, setShowZeroDialog] = useState(false);
  const [qtyPopoverOpen, setQtyPopoverOpen] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<string>(String(food.quantity ?? 0));
  const quantity = food.quantity ?? 0;

  useEffect(() => {
    if (qtyPopoverOpen) setQtyDraft(String(food.quantity ?? 0));
  }, [qtyPopoverOpen, food.quantity]);

  /**
   * Every write goes through here. Reaching zero from a positive count asks
   * the same question the grid card asks (used up, thrown out, or remove),
   * whichever control got it there.
   */
  const commitQty = (value: number) => {
    if (!onQuantityChange || !Number.isFinite(value)) return;
    const next = Math.max(0, Math.round(value * 100) / 100);
    if (next <= 0 && quantity > 0) {
      setShowZeroDialog(true);
      return;
    }
    if (next !== quantity) onQuantityChange(food.id, next);
  };

  const handleDecrement = () => {
    if (!onQuantityChange) return;
    commitQty(isLastUnit(quantity) ? 0 : stepDown(quantity));
  };

  const adjustBy = (delta: number) => {
    commitQty(quantity + delta);
    setQtyPopoverOpen(false);
  };

  const commitDraft = () => {
    const parsed = parseQuantityInput(qtyDraft);
    if (parsed === null) return;
    commitQty(parsed);
    setQtyPopoverOpen(false);
  };

  const config = getCategoryConfig(food.category);
  const stockStatus = getStockStatus(food.quantity);
  const effective = resolveFood(food, catalog);
  const legacyAllergens =
    fit || !kidAllergens?.length
      ? []
      : (food.allergens ?? []).filter((a) => matchingAllergen(kidAllergens, [a]));
  const hasAllergen = fit ? fit.allergenKids.length > 0 : legacyAllergens.length > 0;
  const unit = food.unit || t("pantry.item.qtyFallback", "qty");
  const showRunsOut =
    stockStatus === "low" && typeof runsOutInDays === "number" && Number.isFinite(runsOutInDays);

  const groceryButton = onAddToGrocery ? (
    onList ? (
      <Button
        size="icon"
        variant="ghost"
        disabled
        className="h-11 w-11 text-muted-foreground"
        aria-label={t("pantry.item.onListLabel", { defaultValue: "{{name}} is on your list", name: food.name })}
        title={t("pantry.item.onList", "On list")}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    ) : (
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onAddToGrocery(food)}
        className="h-11 w-11 text-primary hover:text-primary"
        aria-label={t("pantry.item.addToList", { defaultValue: "Add {{name}} to grocery list", name: food.name })}
        title={t("pantry.item.addToListShort", "Add to grocery list")}
      >
        <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    )
  ) : null;

  return (
    <>
    <div
      className={cn(
        "flex items-center gap-2 sm:gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors group",
        stockStatus !== "ok" && STOCK_TONE[stockStatus].surface,
        hasAllergen && "bg-destructive/5"
      )}
    >
      {/* Category dot; the label is for anyone not seeing the colour. */}
      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", config.dot)} aria-hidden="true" />
      <span className="sr-only">{t(config.labelKey, config.label)}</span>

      {/* Name, with the kid fit and any secondary line under it */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium text-sm truncate min-w-0">{food.name}</span>
          {stockStatus === "out" && (
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 h-[18px] shrink-0", STOCK_TONE.out.chip)}
            >
              {t("pantry.item.out", "Out")}
            </Badge>
          )}
        </div>
        {fit && <KidFitBadges fit={fit} mode="compact" className="mt-0.5" />}
        {showRunsOut && (
          <p className="text-xs text-muted-foreground">
            {t("pantry.item.daysLeft", {
              defaultValue_one: "about {{count}} day left",
              defaultValue: "about {{count}} days left",
              count: Math.max(0, Math.round(runsOutInDays as number)),
            })}
          </p>
        )}
        <DataSourceCredit source={effective.source} className="text-[11px] text-muted-foreground truncate" />
      </div>

      {/* Household flags, only when no per-kid fit is available */}
      {!fit && (
        <div className="flex items-center gap-1 shrink-0">
          {food.is_safe && !hasAllergen && (
            <Badge className="bg-safe-food text-white text-[10px] px-1 sm:px-1.5 py-0 h-[18px]">
              {t("pantry.item.safe", "Safe")}
            </Badge>
          )}
          {food.is_try_bite && (
            <Badge className="bg-try-bite text-white text-[10px] px-1 sm:px-1.5 py-0 h-[18px]">
              {t("pantry.item.tryShort", "Try")}
            </Badge>
          )}
          {hasAllergen && (
            <AlertTriangle
              className="h-3.5 w-3.5 text-destructive"
              role="img"
              aria-label={t("pantry.item.allergenWarning", {
                defaultValue: "Contains {{list}}",
                list: legacyAllergens.join(", "),
              })}
            />
          )}
        </div>
      )}

      {/* Quantity stepper. An out row offers the grocery list where '-' was. */}
      <div className="flex items-center shrink-0">
        {stockStatus === "out" && groceryButton ? (
          groceryButton
        ) : (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDecrement}
            className="h-11 w-11"
            disabled={quantity <= 0}
            aria-label={t("pantry.item.decrease", { defaultValue: "Decrease {{name}}", name: food.name })}
          >
            <Minus className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
        <Popover open={qtyPopoverOpen} onOpenChange={setQtyPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "min-w-11 h-11 px-1 flex flex-col items-center justify-center rounded hover:bg-muted leading-none",
                stockStatus !== "ok" && STOCK_TONE[stockStatus].text
              )}
              aria-label={t("pantry.item.adjust", {
                defaultValue: "Adjust {{name}} quantity, now {{quantity}} {{unit}}",
                name: food.name,
                quantity,
                unit,
              })}
            >
              <span className="font-semibold text-sm tabular-nums">{quantity}</span>
              <span className="text-[10px] text-muted-foreground max-w-14 truncate">{unit}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="center">
            <p className="text-xs font-semibold mb-2">{food.name}</p>
            <form
              className="flex items-center gap-2 mb-2"
              onSubmit={(e) => {
                e.preventDefault();
                commitDraft();
              }}
            >
              <Input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={qtyDraft}
                onChange={(e) => setQtyDraft(e.target.value)}
                className="h-11"
                aria-label={t("pantry.item.quantityInput", {
                  defaultValue: "Quantity of {{name}}",
                  name: food.name,
                })}
              />
              <Button type="submit" size="sm" className="h-11">
                {t("pantry.item.set", "Set")}
              </Button>
            </form>
            <div className="grid grid-cols-4 gap-1">
              {PRESETS.map((delta) => (
                <Button
                  key={delta}
                  variant="outline"
                  size="sm"
                  className="h-11"
                  onClick={() => adjustBy(delta)}
                >
                  {delta > 0 ? `+${delta}` : String(delta)}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            if (onQuantityChange) onQuantityChange(food.id, quantity + 1);
          }}
          className="h-11 w-11"
          aria-label={t("pantry.item.increase", { defaultValue: "Increase {{name}}", name: food.name })}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>

      {/* Actions */}
      <div className="flex gap-0.5 shrink-0 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100 pointer-coarse:opacity-100">
        {stockStatus !== "out" && groceryButton}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onEdit(food)}
          className="h-11 w-11"
          aria-label={t("pantry.item.edit", { defaultValue: "Edit {{name}}", name: food.name })}
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setShowDeleteConfirm(true)}
          className="h-11 w-11 text-destructive hover:text-destructive"
          aria-label={t("pantry.item.delete", { defaultValue: "Delete {{name}}", name: food.name })}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>
    </div>

    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("pantry.item.deleteTitle", { defaultValue: "Delete {{name}}?", name: food.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("pantry.item.deleteBody", {
              defaultValue: "This permanently removes {{name}} from your pantry. You can't undo it.",
              name: food.name,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("pantry.item.cancel", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onDelete(food.id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("pantry.item.deleteConfirm", "Delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <ZeroQuantityDialog
      food={food}
      open={showZeroDialog}
      onOpenChange={setShowZeroDialog}
      onSetZero={() => onQuantityChange?.(food.id, 0)}
      onWaste={() => {
        if (onWaste) onWaste(food.id, quantity > 0 ? quantity : 1);
        else onQuantityChange?.(food.id, 0);
      }}
      onDelete={() => {
        onDelete(food.id);
        setShowZeroDialog(false);
      }}
    />
    </>
  );
});
