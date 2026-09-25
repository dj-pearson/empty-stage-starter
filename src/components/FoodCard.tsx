import { useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { Food } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, AlertTriangle, Plus, Minus, PackageOpen, ShoppingCart, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCategoryConfig,
  getStockStatus,
  isLastUnit,
  stepDown,
  STOCK_TONE,
} from "@/components/pantry/pantryConstants";
import { ZeroQuantityDialog } from "@/components/pantry/ZeroQuantityDialog";
import { resolveFood, type CatalogEntry } from "@/lib/effectiveFood";
import { matchingAllergen } from "@/lib/allergens";
import type { ItemFit } from "@/lib/kidFit";
import { KidFitBadges } from "@/components/recipes/KidFitBadges";
import { DataSourceCredit } from "@/components/DataSourceCredit";
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
import "@/i18n/appLocale";

interface FoodCardProps {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (id: string) => void;
  onQuantityChange?: (id: string, newQuantity: number) => void;
  /**
   * US-672: "we threw this out", which the ledger records as waste rather than
   * as a correction. Optional, so a FoodCard rendered outside the pantry keeps
   * working without it.
   */
  onWaste?: (id: string, quantity: number) => void;
  /**
   * Legacy household allergen list. Ignored when `fit` is given, which is
   * computed per kid with the canonical matcher and names the kid.
   */
  kidAllergens?: string[];
  /**
   * The catalog row this food is linked to, when it is linked (US-797).
   *
   * A product promoted from a barcode scan lands `verification = 'unverified'`
   * -- nobody has checked it, it is one household's scan of one label. It is
   * deliberately usable for shopping, so the card says where the data came
   * from rather than hiding it. Optional, so a FoodCard rendered somewhere
   * without the catalog keeps working.
   */
  catalog?: CatalogEntry | null;
  /** How this food fits each kid (src/lib/kidFit.ts). Replaces the household Safe/Try Bite badges. */
  fit?: ItemFit;
  /** Offered on low and out cards. */
  onAddToGrocery?: (food: Food) => void;
  /** The food is already on the grocery list: show that instead of the add button. */
  onList?: boolean;
  /** Estimated days until this runs out, shown on low cards. */
  runsOutInDays?: number;
}

export const FoodCard = memo(function FoodCard({
  food,
  onEdit,
  onDelete,
  onQuantityChange,
  onWaste,
  kidAllergens,
  catalog,
  fit,
  onAddToGrocery,
  onList,
  runsOutInDays,
}: FoodCardProps) {
  const { t } = useTranslation();
  const [showZeroQuantityDialog, setShowZeroQuantityDialog] = useState(false);

  const config = getCategoryConfig(food.category);
  const categoryLabel = t(config.labelKey, config.label);
  // US-797: provenance for a catalog-linked food. `catalog` is undefined
  // wherever a FoodCard is rendered without it, and resolveFood treats that
  // the same as an unlinked food, so both cases render nothing extra.
  const effective = resolveFood(food, catalog);
  const showUnverified = effective.isCanonical && !effective.isVerified;
  const CategoryIcon = config.icon;
  const stockStatus = getStockStatus(food.quantity);
  const quantity = food.quantity ?? 0;

  // Legacy path only (no `fit`): canonical matching, so a kid's "Peanuts"
  // matches a food's "peanut". With `fit`, KidFitBadges names the kid.
  const legacyAllergens =
    fit || !kidAllergens?.length
      ? []
      : (food.allergens ?? []).filter((a) => matchingAllergen(kidAllergens, [a]));
  const hasAllergen = fit ? fit.allergenKids.length > 0 : legacyAllergens.length > 0;

  const handleIncrement = () => {
    if (onQuantityChange) {
      onQuantityChange(food.id, quantity + 1);
    }
  };

  const handleDecrement = () => {
    if (!onQuantityChange) return;
    if (isLastUnit(quantity)) {
      setShowZeroQuantityDialog(true);
    } else if (quantity > 1) {
      onQuantityChange(food.id, stepDown(quantity));
    }
  };

  const handleSetToZero = () => {
    if (onQuantityChange) onQuantityChange(food.id, 0);
  };

  const handleDeleteFromZero = () => {
    onDelete(food.id);
    setShowZeroQuantityDialog(false);
  };

  // The last one is gone because it was thrown out, which is a different fact
  // from the count having been wrong. Falls back to setting zero when no waste
  // handler is supplied, so the button never becomes a dead end.
  const handleThrewOut = () => {
    if (onWaste) onWaste(food.id, quantity > 0 ? quantity : 1);
    else handleSetToZero();
  };

  const showGroceryAction = Boolean(onAddToGrocery) && stockStatus !== "ok";
  const showRunsOut =
    stockStatus === "low" && typeof runsOutInDays === "number" && Number.isFinite(runsOutInDays);

  return (
    <Card
      /*
        The category used to be a 4px coloured left stripe (US-814). Two
        problems with that: it was the only thing on the card saying what
        category the food was, so the information was carried by colour alone
        and vanished for anyone who cannot separate red from amber; and a thick
        coloured border on one side of a card is the most recognisable tell of
        a generated interface. The icon below now carries the category, and the
        border is a 1px tint of the same hue.
      */
      className={cn(
        "transition-all duration-200 hover:shadow-md group relative overflow-hidden",
        config.border,
        hasAllergen && "ring-2 ring-destructive/50",
        // US-817: a muted surface, not opacity-70. Dimming the whole card
        // composites every colour inside it toward the page background, and
        // axe measured the result: the "Safe" badge's white label read 3.13:1
        // on a washed #579f70 that is really #117937 at 5.51:1, and the
        // quantity line read 3.23:1. Out-of-stock is already carried by the
        // destructive "Out" badge, the icon and the red quantity, so the dim
        // was decoration paid for in contrast.
        stockStatus !== "ok" && STOCK_TONE[stockStatus].surface
      )}
    >
      <div className="p-3.5">
        {/* Top row: Name + Actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <CategoryIcon
              className={cn("h-4 w-4 shrink-0", config.text)}
              aria-hidden="true"
            />
            <h3 className="font-semibold text-[15px] leading-tight truncate">
              {food.name}
            </h3>
            {/* The icon is the category; say so for anyone not seeing it. */}
            <span className="sr-only">{categoryLabel}</span>

          </div>
          <div className="flex gap-0.5 shrink-0 transition-opacity md:opacity-40 md:group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onEdit(food)}
              className="h-11 w-11 md:h-8 md:w-8"
              aria-label={t("pantry.item.edit", { defaultValue: "Edit {{name}}", name: food.name })}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11 md:h-8 md:w-8 text-destructive hover:text-destructive"
                  aria-label={t("pantry.item.delete", { defaultValue: "Delete {{name}}", name: food.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </AlertDialogTrigger>
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
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Badge
            variant="outline"
            className={cn("text-[11px] px-1.5 py-0 h-5", config.badgeBg, config.badgeText)}
          >
            {categoryLabel}
          </Badge>
          {/* Household flags, only when no per-kid fit is available. A safe
              flag never sits next to an allergen warning. */}
          {!fit && food.is_safe && !hasAllergen && (
            <Badge className="bg-safe-food text-white text-[11px] px-1.5 py-0 h-5">
              {t("pantry.item.safe", "Safe")}
            </Badge>
          )}
          {!fit && food.is_try_bite && (
            <Badge className="bg-try-bite text-white text-[11px] px-1.5 py-0 h-5">
              {t("pantry.item.tryBite", "Try Bite")}
            </Badge>
          )}
          {showUnverified && (
            // US-797: a scanned product promotes itself into the shared
            // catalog as `unverified` -- one household's scan of one label,
            // checked by nobody. It is fine to shop from, and should not be
            // presented as a confirmed fact, so the card says which it is.
            // Deliberately not a warning colour: this is provenance, not a
            // problem with the food.
            <Badge
              variant="outline"
              className="text-[11px] px-1.5 py-0 h-5 font-normal"
              title={t("pantry.item.unverifiedHint", "Added from a scanned barcode and not yet checked by anyone")}
            >
              {t("pantry.item.unverified", "Unverified")}
            </Badge>
          )}
          {stockStatus === "out" && (
            <Badge
              variant="outline"
              className={cn("text-[11px] px-1.5 py-0 h-5 gap-0.5", STOCK_TONE.out.chip)}
            >
              <PackageOpen className={cn("h-3 w-3", STOCK_TONE.out.icon)} aria-hidden="true" />
              {t("pantry.item.out", "Out")}
            </Badge>
          )}
          {stockStatus === "low" && (
            <Badge
              variant="outline"
              className={cn("text-[11px] px-1.5 py-0 h-5 gap-0.5", STOCK_TONE.low.chip)}
            >
              <AlertTriangle className={cn("h-3 w-3", STOCK_TONE.low.icon)} aria-hidden="true" />
              {t("pantry.item.low", "Low")}
            </Badge>
          )}
        </div>

        {fit && <KidFitBadges fit={fit} mode="compact" className="mt-1.5" />}

        {/* US-797 / US-633: Open Food Facts and FoodRepo are ODbL, and the
            licence wants the credit visible wherever the data is shown. Once a
            household food is linked to a promoted row that is here, not only
            the scanner dialog it arrived through. Renders nothing for our own
            sources. */}
        <DataSourceCredit source={effective.source} className="text-[11px] text-muted-foreground mt-1.5" />

        {/* Quantity stepper */}
        {onQuantityChange && (
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="icon"
              variant="outline"
              onClick={handleDecrement}
              className="h-11 w-11 md:h-8 md:w-8 shrink-0"
              disabled={quantity <= 0}
              aria-label={t("pantry.item.decrease", { defaultValue: "Decrease {{name}}", name: food.name })}
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <div className="flex items-center gap-1.5 flex-1 justify-center min-w-0">
              <span
                className={cn(
                  "font-bold text-lg tabular-nums leading-none",
                  stockStatus !== "ok" && STOCK_TONE[stockStatus].text
                )}
              >
                {quantity}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {food.unit || t("pantry.item.qtyFallback", "qty")}
              </span>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={handleIncrement}
              className="h-11 w-11 md:h-8 md:w-8 shrink-0"
              aria-label={t("pantry.item.increase", { defaultValue: "Increase {{name}}", name: food.name })}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}

        {(showRunsOut || showGroceryAction) && (
          <div className="flex items-center justify-between gap-2 mt-2">
            {showRunsOut ? (
              <p className="text-xs text-muted-foreground">
                {t("pantry.item.daysLeft", {
                  defaultValue_one: "about {{count}} day left",
                  defaultValue: "about {{count}} days left",
                  count: Math.max(0, Math.round(runsOutInDays as number)),
                })}
              </p>
            ) : (
              <span />
            )}
            {showGroceryAction &&
              (onList ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled
                  className="h-11 min-w-11 gap-1 text-muted-foreground"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("pantry.item.onList", "On list")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onAddToGrocery?.(food)}
                  className="h-11 w-11 shrink-0"
                  aria-label={t("pantry.item.addToList", { defaultValue: "Add {{name}} to grocery list", name: food.name })}
                  title={t("pantry.item.addToListShort", "Add to grocery list")}
                >
                  <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                </Button>
              ))}
          </div>
        )}

        {/* Legacy allergen warning, when no per-kid fit is available. */}
        {!fit && hasAllergen && (
          <div className="mt-2.5 flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium truncate">
              {legacyAllergens.join(", ")}
            </span>
          </div>
        )}
      </div>

      <ZeroQuantityDialog
        food={food}
        open={showZeroQuantityDialog}
        onOpenChange={setShowZeroQuantityDialog}
        onSetZero={handleSetToZero}
        onWaste={handleThrewOut}
        onDelete={handleDeleteFromZero}
      />
    </Card>
  );
});
