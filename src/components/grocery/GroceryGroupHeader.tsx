import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

export interface GroceryGroupHeaderProps {
  /** DOM id of the group's item container, for aria-controls. */
  id: string;
  label: string;
  /** Items in the group, read out alongside the label. */
  count: number;
  expanded: boolean;
  collapsible: boolean;
  onToggle?: () => void;
  /** The store's aisle number, when the list's layout knows it. */
  aisleNumber?: string | null;
  /** 1-based place of this group in the walk, with `total`. */
  position?: number;
  total?: number;
}

/**
 * One aisle or category heading on the grocery list.
 *
 * An <h3> either way, so screen-reader heading navigation walks the shop one
 * aisle at a time. Collapsible, the heading wraps a button carrying
 * aria-expanded; otherwise it is plain text.
 */
export const GroceryGroupHeader = memo(function GroceryGroupHeader({
  id,
  label,
  count,
  expanded,
  collapsible,
  onToggle,
  aisleNumber,
  position,
  total,
}: GroceryGroupHeaderProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  const title = aisleNumber
    ? t("grocery.group.aisleLabel", { defaultValue: "Aisle {{number}} - {{label}}", number: aisleNumber, label })
    : label;
  const where =
    position !== undefined && total !== undefined && total > 1
      ? t("grocery.group.position", { defaultValue: "{{position}} of {{total}}", position, total })
      : null;
  const countText = t("grocery.group.itemCount", {
    defaultValue: "{{count}} items",
    defaultValue_one: "{{count}} item",
    count,
  });

  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
        <span className="sr-only">{countText}</span>
        {where && <span>{where}</span>}
        {!where && <span aria-hidden="true">{count}</span>}
      </span>
    </>
  );

  if (!collapsible) {
    return (
      <h3 className="flex min-h-11 items-center gap-2 px-4 text-sm font-semibold text-foreground">
        {body}
      </h3>
    );
  }

  return (
    <h3 className="text-sm font-semibold text-foreground">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground",
            !reducedMotion && "transition-transform duration-150",
            !expanded && "-rotate-90",
          )}
        />
        {body}
      </button>
    </h3>
  );
});
