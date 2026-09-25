import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

export type GroceryGroupBy = "aisle" | "category";

interface GroupByToggleProps {
  value: GroceryGroupBy;
  onChange: (value: GroceryGroupBy) => void;
  className?: string;
}

/**
 * "By aisle" / "By category".
 *
 * US-778: a group of toggle buttons, not Tabs: nothing here is a tab panel,
 * and Tabs' aria-controls pointed at none. Shared by the inline row on a
 * desktop and the List view sheet on a phone, so both are the same control.
 */
export const GroupByToggle = memo(function GroupByToggle({ value, onChange, className }: GroupByToggleProps) {
  const { t } = useTranslation();
  const options: ReadonlyArray<readonly [GroceryGroupBy, string]> = [
    ["aisle", t("grocery.groupBy.aisle", { defaultValue: "By aisle" })],
    ["category", t("grocery.groupBy.category", { defaultValue: "By category" })],
  ];
  return (
    <div
      role="group"
      aria-label={t("grocery.groupBy.label", { defaultValue: "Group items by" })}
      className={cn(
        "grid h-11 w-full max-w-[16rem] grid-cols-2 items-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
    >
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "inline-flex h-full items-center justify-center whitespace-nowrap rounded-sm px-3 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            value === option && "bg-background text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
});
