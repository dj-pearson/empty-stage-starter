import { memo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/i18n/appLocale";

interface PlanSyncBannerProps {
  /** Rows a push would add (usePlanToGrocery().preview().toAdd). */
  toAdd: number;
  /** Planned foods the pantry already covers. */
  alreadyHave: number;
  onAdd: () => void;
}

/**
 * One line: "This week's plan needs 6 things - Add".
 *
 * Renders nothing when the plan needs nothing, so a list that is already in
 * step with the week carries no banner asking the parent to do something
 * that would change nothing. The counts come from the same preview() the
 * push uses, with the same options, so the number on the banner is the number
 * the Add button writes.
 */
export const PlanSyncBanner = memo(function PlanSyncBanner({ toAdd, alreadyHave, onAdd }: PlanSyncBannerProps) {
  const { t } = useTranslation();
  if (toAdd <= 0) return null;
  return (
    <div
      data-testid="grocery-plan-banner"
      className="mb-3 flex items-center gap-3 rounded-xl bg-muted px-3 py-2 print:hidden"
    >
      <CalendarCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        {t("grocery.plan.cta", {
          defaultValue: "This week's plan needs {{count}} thing",
          defaultValue_other: "This week's plan needs {{count}} things",
          count: toAdd,
        })}
        {alreadyHave > 0 && (
          <span className="text-muted-foreground">
            {" "}
            {t("grocery.plan.have", {
              defaultValue: "({{count}} already in the pantry)",
              count: alreadyHave,
            })}
          </span>
        )}
      </p>
      <Button type="button" size="sm" className="h-11 shrink-0" onClick={onAdd}>
        {t("grocery.plan.add", { defaultValue: "Add" })}
      </Button>
    </div>
  );
});
