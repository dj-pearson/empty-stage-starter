import { memo } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import "@/i18n/appLocale";

interface GroceryViewIndicatorProps {
  /** The kid the list is filtered to, or null for everyone's items. */
  kidName: string | null;
  /** Rows still to buy that the kid filter keeps off screen. */
  hiddenCount: number;
  /** True when grouped by category rather than the default, by aisle. */
  byCategory: boolean;
  /** The chosen store's name, or null for the typical store. */
  storeName: string | null;
  onClearKid: () => void;
  onClearGroup: () => void;
  onClearStore: () => void;
  /** Opens the List view sheet. */
  onEdit: () => void;
}

/**
 * One line on a phone that says what the List view sheet has changed.
 *
 * Moving the kid filter, grouping and store into a sheet must not make them
 * quiet: a list filtered to one kid looks like a short list. So whenever one
 * is off its default this row names it, with a clear button beside each. It
 * renders nothing at the defaults, which is the case the first-screen budget
 * in tests/responsive/grocery-phone.spec.ts is measured against.
 */
export const GroceryViewIndicator = memo(function GroceryViewIndicator({
  kidName,
  hiddenCount,
  byCategory,
  storeName,
  onClearKid,
  onClearGroup,
  onClearStore,
  onEdit,
}: GroceryViewIndicatorProps) {
  const { t } = useTranslation();
  if (!kidName && !byCategory && !storeName) return null;

  return (
    <div
      role="group"
      aria-label={t("grocery.phoneView.activeLabel")}
      data-testid="grocery-view-indicator"
      className="-mx-4 mb-2 flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap px-4 print:hidden"
    >
      {kidName && (
        <Chip
          label={hiddenCount > 0
            ? t("grocery.phoneView.kidChipHidden", { name: kidName, count: hiddenCount })
            : t("grocery.phoneView.kidChip", { name: kidName })}
          clearLabel={t("grocery.phoneView.clearKid")}
          onEdit={onEdit}
          editLabel={t("grocery.phoneView.edit")}
          onClear={onClearKid}
        />
      )}
      {byCategory && (
        <Chip
          label={t("grocery.groupBy.category", { defaultValue: "By category" })}
          clearLabel={t("grocery.phoneView.clearGroup")}
          onEdit={onEdit}
          editLabel={t("grocery.phoneView.edit")}
          onClear={onClearGroup}
        />
      )}
      {storeName && (
        <Chip
          label={t("grocery.phoneView.storeChip", { name: storeName })}
          clearLabel={t("grocery.phoneView.clearStore")}
          onEdit={onEdit}
          editLabel={t("grocery.phoneView.edit")}
          onClear={onClearStore}
        />
      )}
    </div>
  );
});

function Chip({
  label,
  clearLabel,
  editLabel,
  onEdit,
  onClear,
}: {
  label: string;
  clearLabel: string;
  editLabel: string;
  onEdit: () => void;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex h-11 shrink-0 items-center rounded-full bg-muted text-sm text-foreground">
      {/* The label reopens the sheet; the X undoes just this one setting. */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${label}. ${editLabel}`}
        className="inline-flex h-11 min-w-11 items-center rounded-l-full pl-4 pr-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        className="inline-flex h-11 w-11 items-center justify-center rounded-r-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  );
}
