import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

export interface KidFilterOption {
  id: string;
  name: string;
}

interface KidFilterBarProps {
  /** Kids who have at least one row on this list. */
  kids: KidFilterOption[];
  selectedKidId: string | null;
  onChange: (kidId: string | null) => void;
  /** Rows the filter is keeping off screen, bought ones included. */
  hiddenCount: number;
}

/**
 * Item 42: "Show only Ava's items", one toggle per kid.
 *
 * The page used to filter to the kid selected elsewhere in the app, which hid
 * hand-added rows with no way back and left the progress bar counting rows
 * nobody could see. So this is opt-in, per list visit, and never quiet about
 * it: while it is on, a line says whose items these are and how many others
 * are hidden, with the way back right beside it.
 */
export const KidFilterBar = memo(function KidFilterBar({
  kids,
  selectedKidId,
  onChange,
  hiddenCount,
}: KidFilterBarProps) {
  const { t } = useTranslation();
  const selected = kids.find((k) => k.id === selectedKidId) ?? null;
  if (kids.length === 0 && !selected) return null;

  return (
    <div className="mb-3 print:hidden" data-testid="grocery-kid-filter">
      <div
        role="group"
        aria-label={t("grocery.kidFilter.label", { defaultValue: "Show one child's items" })}
        className="flex flex-wrap items-center gap-2"
      >
        {kids.map((kid) => {
          const on = kid.id === selectedKidId;
          return (
            <button
              key={kid.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : kid.id)}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              {t("grocery.kidFilter.only", { defaultValue: "Only {{name}}'s items", name: kid.name })}
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          role="status"
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
          data-testid="grocery-kid-filter-status"
        >
          <span className="min-w-0 flex-1">
            {hiddenCount > 0
              ? t("grocery.kidFilter.showingHidden", {
                  defaultValue: "Showing only {{name}}'s items. {{count}} other item hidden.",
                  defaultValue_other: "Showing only {{name}}'s items. {{count}} other items hidden.",
                  name: selected.name,
                  count: hiddenCount,
                })
              : t("grocery.kidFilter.showing", {
                  defaultValue: "Showing only {{name}}'s items. Nothing else is on this list.",
                  name: selected.name,
                })}
          </span>
          <Button variant="outline" size="sm" className="h-11 gap-1 md:h-9" onClick={() => onChange(null)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {t("grocery.kidFilter.showAll", { defaultValue: "Show all items" })}
          </Button>
        </div>
      )}
    </div>
  );
});
