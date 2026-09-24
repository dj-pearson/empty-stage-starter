import { memo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, CloudOff, Info, Minus, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KidFitBadges } from "@/components/recipes/KidFitBadges";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatQuantity } from "@/lib/groceryMerge";
import type { ItemFit } from "@/lib/kidFit";
import { cn } from "@/lib/utils";
import type { GroceryItem } from "@/types";

export interface GroceryRowProps {
  item: GroceryItem;
  /**
   * Rendered state, separate from item.checked so the page can keep a
   * just-checked row crossed out in place for a moment.
   */
  checked: boolean;
  /** Other measures of the same ingredient, already joined ("3 cups"). */
  measureNote?: string;
  /** Kid fit for the row; shown as grocery-mode chips (allergens, dislikes). */
  fit?: ItemFit;
  /** Which kids the plan puts this food in front of. */
  forKidNames?: string[];
  /** Who added it, when that is somebody other than the viewer. */
  addedByName?: string;
  /** The row's last change is still in the offline queue. */
  pending?: boolean;
  /** Phone layout: name first, controls behind a tap on the row. */
  compact: boolean;
  onToggle: (item: GroceryItem) => void;
  onOpen: (item: GroceryItem) => void;
  onQuantityStep?: (item: GroceryItem, delta: number) => void;
  onDelete?: (item: GroceryItem) => void;
}

/** "×3" for servings, "2 lb" for a unit, "2" for a bare count; null for a plain 1. */
function quantityText(item: GroceryItem, t: ReturnType<typeof useTranslation>["t"]): string | null {
  const qty = Number(item.quantity);
  const unit = (item.unit ?? "").trim();
  if (!Number.isFinite(qty)) return null;
  const quantity = formatQuantity(qty);
  if (unit.toLowerCase() === "servings") {
    return t("grocery.row.servings", { defaultValue: "×{{count}}", count: quantity });
  }
  if (!unit) return qty === 1 ? null : quantity;
  return t("grocery.row.quantityUnit", { defaultValue: "{{quantity}} {{unit}}", quantity, unit });
}

/**
 * One line on the grocery list.
 *
 * Built for a phone held in one hand over a trolley: a 44px checkbox, then the
 * name, then one meta line answering "how much, for whom, is it safe, has it
 * synced". Everything that edits the row lives behind a tap on the name
 * (onOpen) on a phone, and inline from sm up, where there is room for it
 * without pushing the name off the line.
 */
export const GroceryRow = memo(function GroceryRow({
  item,
  checked,
  measureNote,
  fit,
  forKidNames,
  addedByName,
  pending,
  compact,
  onToggle,
  onOpen,
  onQuantityStep,
  onDelete,
}: GroceryRowProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const name = item.name;
  const qty = quantityText(item, t);

  const meta: ReactNode[] = [];
  if (qty) {
    meta.push(
      <span key="qty" className="tabular-nums">
        {qty}
      </span>,
    );
  }
  if (forKidNames && forKidNames.length > 0) {
    meta.push(
      <span key="kids" className="truncate">
        {t("grocery.row.forKids", { defaultValue: "For {{names}}", names: forKidNames.join(", ") })}
      </span>,
    );
  }
  if (addedByName) {
    meta.push(
      <span key="by" className="truncate">
        {t("grocery.row.addedBy", { defaultValue: "Added by {{name}}", name: addedByName })}
      </span>,
    );
  }

  const transition = reducedMotion ? undefined : "transition-colors duration-150";

  return (
    <div
      className={cn(
        "flex items-center gap-1 border-b border-border bg-background pr-2 sm:gap-2 sm:pr-4",
        transition,
      )}
      data-checked={checked ? "true" : "false"}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={
          checked
            ? t("grocery.row.uncheck", { defaultValue: "Uncheck {{name}}", name })
            : t("grocery.row.check", { defaultValue: "Check off {{name}}", name })
        }
        onClick={() => onToggle(item)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md border-2",
            transition,
            checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground bg-background",
          )}
        >
          {checked && <Check className="h-4 w-4" />}
        </span>
      </button>

      {/*
        The whole body opens the row, but only the name is the button: the meta
        line holds a list of chips, which is not valid inside a <button>, and
        reading it as part of the button's name would make every row a
        paragraph. The name's ::after stretches over the body instead, so a tap
        anywhere on it still lands.
      */}
      <div className="relative flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className={cn(
            "truncate rounded-md text-left text-base font-medium sm:text-sm",
            "after:absolute after:inset-0 after:content-['']",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            checked ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {name}
        </button>
        {(meta.length > 0 || fit || pending) && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {meta.map((node, i) => (
              <span key={i} className="flex min-w-0 items-center gap-2">
                {i > 0 && <span aria-hidden="true">·</span>}
                {node}
              </span>
            ))}
            <KidFitBadges fit={fit} mode="grocery" />
            {pending && (
              <span className="inline-flex items-center" title={t("grocery.row.notSynced", { defaultValue: "Not synced yet" })}>
                <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{t("grocery.row.notSynced", { defaultValue: "Not synced yet" })}</span>
              </span>
            )}
          </span>
        )}
        {measureNote && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t("grocery.row.alsoNeeded", { defaultValue: "Also needed: {{list}}", list: measureNote })}
            </span>
          </span>
        )}
      </div>

      {!compact && (
        <div className="flex shrink-0 items-center gap-1">
          {onQuantityStep && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => onQuantityStep(item, -1)}
                disabled={Number(item.quantity) <= 0.25}
                aria-label={t("grocery.row.decrease", { defaultValue: "Decrease {{name}}", name })}
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => onQuantityStep(item, 1)}
                aria-label={t("grocery.row.increase", { defaultValue: "Increase {{name}}", name })}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={() => onOpen(item)}
            aria-label={t("grocery.row.edit", { defaultValue: "Edit {{name}}", name })}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(item)}
              aria-label={t("grocery.row.delete", { defaultValue: "Delete {{name}}", name })}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
