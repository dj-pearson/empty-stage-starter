import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Trash2 } from "lucide-react";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import type { Food } from "@/types";
import type { ItemFit } from "@/lib/kidFit";
import { buildWasteReport, type Money, type WasteLine, type WasteReport } from "@/lib/wasteReport";
import { formatMoney } from "@/lib/money";
import { useWasteMovements } from "@/hooks/useWasteMovements";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

interface PantryWasteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: readonly Food[];
  /** Per-kid fit, so try-bite waste is told apart by kid, not by the household flag. */
  fitByFoodId?: ReadonlyMap<string, ItemFit>;
}

/**
 * Item 22: what was thrown out this month, from the ledger's waste movements.
 * Mounted only while open, so the fetch runs when a parent asks and not on
 * every pantry visit.
 */
export function PantryWasteSheet({ open, onOpenChange, foods, fitByFoodId }: PantryWasteSheetProps) {
  const { t } = useTranslation();
  const { movements, loading, error, reload } = useWasteMovements(open);
  const report = useMemo(
    () => buildWasteReport({ movements, foods, fitByFoodId, now: new Date() }),
    [movements, foods, fitByFoodId]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            {t("pantry.waste.title", "Thrown out this month")}
          </DialogTitle>
          <DialogDescription>
            {t("pantry.waste.description", "From everything marked \"threw it out\" since the 1st.")}
          </DialogDescription>
        </DialogHeader>
        <WasteReportBody report={report} loading={loading} error={error} onRetry={reload} />
      </DialogContent>
    </Dialog>
  );
}

/** The report itself, separate from the fetch so it renders from data alone. */
export const WasteReportBody = memo(function WasteReportBody({
  report,
  loading,
  error,
  onRetry,
}: {
  report: WasteReport;
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const money = (list: Money[]) => list.map((m) => formatMoney(m.amount, m.currency, locale)).join(" + ");

  if (loading && report.events === 0) {
    return (
      <div role="status" className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
        {t("pantry.waste.loading", "Loading this month's waste")}
      </div>
    );
  }

  if (error && report.events === 0) {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm">{t("pantry.waste.error", "Couldn't load the waste report. Try again.")}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {t("pantry.waste.retry", "Try again")}
          </Button>
        )}
      </div>
    );
  }

  if (report.events === 0) {
    return (
      <div className="py-8 text-center">
        <p className="font-medium">{t("pantry.waste.empty", "Nothing thrown out this month.")}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t("pantry.waste.emptyHint", "When you mark something \"threw it out\", it shows up here.")}
        </p>
      </div>
    );
  }

  const groupLabel = {
    trying: t("pantry.waste.group.trying", "Try bites"),
    safe: t("pantry.waste.group.safe", "Safe foods"),
    other: t("pantry.waste.group.other", "Everything else"),
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-2xl font-semibold tabular-nums" data-testid="waste-total">
          {report.totals.length > 0
            ? t("pantry.waste.total", { defaultValue: "About {{amount}} thrown out", amount: money(report.totals) })
            : t("pantry.waste.noPriceTotal", "No prices yet for what was thrown out")}
        </p>
        {report.unpricedLines > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {t("pantry.waste.unpriced", {
              defaultValue_one: "{{count}} item has no price yet, so it isn't in the total.",
              defaultValue: "{{count}} items have no price yet, so they aren't in the total.",
              count: report.unpricedLines,
            })}{" "}
            {t(
              "pantry.waste.priceHint",
              "Prices come from scanned receipts, prices added at checkout, and a food's edit screen."
            )}
          </p>
        )}
      </div>

      {report.groups.map((group) => (
        <section key={group.group} aria-labelledby={`waste-group-${group.group}`}>
          <div className="flex items-baseline justify-between gap-2 border-b pb-1 mb-2">
            <h3 id={`waste-group-${group.group}`} className="font-semibold text-sm">
              {groupLabel[group.group]}
            </h3>
            {group.totals.length > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {t("pantry.waste.groupTotal", { defaultValue: "about {{amount}}", amount: money(group.totals) })}
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {group.lines.map((line) => (
              <WasteLineRow key={line.itemId} line={line} money={money} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
});

function WasteLineRow({ line, money }: { line: WasteLine; money: (list: Money[]) => string }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const name = line.name || t("pantry.waste.unknownFood", "A food you've since removed");
  const qty = line.quantities.map((q) => `${number.format(q.amount)} ${q.unit}`.trim()).join(", ");
  const priced = line.cost.length > 0;
  const detail = [
    qty,
    t("pantry.waste.times", {
      defaultValue_one: "thrown out once",
      defaultValue: "thrown out {{count}} times",
      count: line.events,
    }),
  ]
    .filter(Boolean)
    .join(" - ");

  // A priced try bite reads as one sentence: the cost of practice, named.
  if (line.group === "trying" && priced) {
    return (
      <li className="text-sm">
        <p className="font-medium">
          {t("pantry.waste.tryBiteCost", {
            defaultValue: "About {{amount}} of try-bite {{name}}",
            amount: money(line.cost),
            name: name.toLowerCase(),
          })}
        </p>
        <p className="text-muted-foreground">{detail}</p>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium truncate">{name}</p>
        <p className="text-muted-foreground">{detail}</p>
      </div>
      <p className={cn("shrink-0 text-right tabular-nums", !priced && "text-muted-foreground")}>
        {priced
          ? t("pantry.waste.cost", { defaultValue: "About {{amount}}", amount: money(line.cost) })
          : t("pantry.waste.noPrice", "No price yet")}
      </p>
    </li>
  );
}
