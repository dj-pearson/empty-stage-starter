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
 * On a phone it is held to exactly one 44px line (option a, 2026-09-25): a
 * shorter sentence that truncates rather than wrapping, the pantry aside left
 * to screen readers, and Add flush in the banner's right edge. At 390px the
 * wrapped version was 92px, a third of what stood between the toolbar and the
 * first item. A desktop keeps the padded banner and the aside.
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
      className="mb-2 flex items-center gap-2 rounded-xl bg-muted py-0 pl-3 pr-0 md:mb-3 md:gap-3 md:px-3 md:py-2 print:hidden"
    >
      <CalendarCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm md:whitespace-normal">
        {/* The short form keeps the number visible at 390px, where the full
            sentence truncated just before it. */}
        <span className="md:hidden">{t("grocery.phoneView.planShort", { count: toAdd })}</span>
        <span className="hidden md:inline">
          {t("grocery.plan.cta", {
            defaultValue: "This week's plan needs {{count}} thing",
            defaultValue_other: "This week's plan needs {{count}} things",
            count: toAdd,
          })}
        </span>
        {alreadyHave > 0 && (
          <span className="sr-only text-muted-foreground md:not-sr-only">
            {" "}
            {t("grocery.plan.have", {
              defaultValue: "({{count}} already in the pantry)",
              count: alreadyHave,
            })}
          </span>
        )}
      </p>
      <Button type="button" size="sm" className="h-11 shrink-0 rounded-l-none rounded-r-xl md:rounded-md" onClick={onAdd}>
        {t("grocery.plan.add", { defaultValue: "Add" })}
      </Button>
    </div>
  );
});
