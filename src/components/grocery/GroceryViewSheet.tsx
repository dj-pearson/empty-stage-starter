import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ResponsiveDialog";
import { KidFilterBar, type KidFilterOption } from "@/components/grocery/KidFilterBar";
import { GroupByToggle, type GroceryGroupBy } from "@/components/grocery/GroupByToggle";
import { StorePicker } from "@/components/grocery/StorePicker";
import type { StoreLayoutRow } from "@/lib/storeLayouts";
import "@/i18n/appLocale";

interface GroceryViewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kids: KidFilterOption[];
  selectedKidId: string | null;
  onKidChange: (kidId: string | null) => void;
  hiddenCount: number;
  groupBy: GroceryGroupBy;
  onGroupByChange: (value: GroceryGroupBy) => void;
  /** Null when there is no store picker to show (no session yet). */
  stores: StoreLayoutRow[] | null;
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
}

/**
 * The phone's home for how the list is shown (option a, 2026-09-25).
 *
 * On a desktop the kid filter, grouping and store picker sit above the list.
 * At 390x664 they took three rows and pushed the first checkbox 246px below
 * the fold, so below `md:` they live here, opened from the toolbar's More
 * options menu. The controls are the same components the desktop renders, so
 * their labels, pressed states and keyboard handling are shared rather than
 * re-implemented. GroceryViewIndicator says on the page when any of them is
 * off its default.
 */
export function GroceryViewSheet({
  open,
  onOpenChange,
  kids,
  selectedKidId,
  onKidChange,
  hiddenCount,
  groupBy,
  onGroupByChange,
  stores,
  selectedStoreId,
  onStoreChange,
}: GroceryViewSheetProps) {
  const { t } = useTranslation();
  const showKids = kids.length > 0 || selectedKidId !== null;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent data-testid="grocery-view-sheet">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("grocery.phoneView.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t("grocery.phoneView.description")}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="mt-4 space-y-5">
          {showKids && (
            <section>
              <h3 className="mb-2 text-sm font-medium">{t("grocery.phoneView.kidSection")}</h3>
              <KidFilterBar
                kids={kids}
                selectedKidId={selectedKidId}
                onChange={onKidChange}
                hiddenCount={hiddenCount}
              />
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-medium">{t("grocery.phoneView.groupSection")}</h3>
            <GroupByToggle value={groupBy} onChange={onGroupByChange} className="max-w-none" />
          </section>

          {groupBy === "aisle" && stores && (
            <section>
              <h3 className="sr-only">{t("grocery.phoneView.storeSection")}</h3>
              <StorePicker stores={stores} selectedId={selectedStoreId} onChange={onStoreChange} />
            </section>
          )}

          <Button type="button" className="h-11 w-full" onClick={() => onOpenChange(false)}>
            {t("grocery.phoneView.done")}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
