import { memo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, PackageOpen, ShieldCheck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Food } from "@/types";
import type { StockFilter } from "@/lib/pantryData";
import { STOCK_TONE } from "./pantryConstants";
import "@/i18n/appLocale";

export interface PantryStockStripProps {
  /** Safe foods for the selected kid (or anyone) that are low or out. */
  safeRunningLow: Food[];
  /** Selected kid, when the kid lens has one. */
  kidName?: string;
  lowCount: number;
  outCount: number;
  /** Foods with no quantity recorded. */
  untrackedCount: number;
  /** The next thing to run out, when nothing is low yet. */
  soonest?: { name: string; days: number };
  stockFilter: StockFilter;
  onFilter: (f: StockFilter) => void;
  onAddAll: () => void;
  onAddSafe: () => void;
  onShowUntracked: () => void;
}

const SAFE_NAMES_SHOWN = 2;

/**
 * One row that answers "what do I need to buy": a kid's safe foods first
 * when they are running low, then the out and low filters, then one button
 * that puts all of it on the list. When nothing is low it collapses to a
 * single line.
 */
export const PantryStockStrip = memo(function PantryStockStrip({
  safeRunningLow,
  kidName,
  lowCount,
  outCount,
  untrackedCount,
  soonest,
  stockFilter,
  onFilter,
  onAddAll,
  onAddSafe,
  onShowUntracked,
}: PantryStockStripProps) {
  const { t } = useTranslation();
  const needCount = lowCount + outCount;

  const status = (
    <p role="status" className="sr-only">
      {t("pantry.strip.status", {
        defaultValue: "{{out}} out of stock, {{low}} running low",
        out: outCount,
        low: lowCount,
      })}
    </p>
  );

  if (needCount === 0 && safeRunningLow.length === 0) {
    return (
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in">
        {status}
        <span>
          {soonest
            ? t("pantry.strip.allStockedSoonest", {
                defaultValue_one: "All stocked; next to run out: {{name}}, about {{count}} day",
                defaultValue: "All stocked; next to run out: {{name}}, about {{count}} days",
                name: soonest.name,
                count: Math.max(0, Math.round(soonest.days)),
              })
            : t("pantry.strip.allStocked", "All stocked")}
        </span>
        {untrackedCount > 0 && (
          <button
            type="button"
            onClick={onShowUntracked}
            className="min-h-11 underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {t("pantry.strip.untracked", {
              defaultValue_one: "{{count}} not counted yet",
              defaultValue: "{{count}} not counted yet",
              count: untrackedCount,
            })}
          </button>
        )}
      </div>
    );
  }

  const safeNames = safeRunningLow.slice(0, SAFE_NAMES_SHOWN).map((f) => f.name);
  const moreSafe = safeRunningLow.length - safeNames.length;
  const safeList =
    moreSafe > 0
      ? t("pantry.strip.namesAndMore", {
          defaultValue: "{{names}} +{{count}}",
          names: safeNames.join(", "),
          count: moreSafe,
        })
      : safeNames.join(", ");

  const outPressed = stockFilter === "out-of-stock";
  const lowPressed = stockFilter === "low-stock";

  return (
    <div className="flex min-h-14 items-center gap-2 overflow-x-auto py-1 motion-safe:animate-in motion-safe:fade-in">
      {status}

      {safeRunningLow.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card py-1 pl-3 pr-1">
          <ShieldCheck className="h-4 w-4 shrink-0 text-safe-food" aria-hidden="true" />
          <span className="max-w-[16rem] truncate text-sm">
            {kidName
              ? t("pantry.strip.safeLowFor", {
                  defaultValue: "{{kid}}'s safe foods low: {{list}}",
                  kid: kidName,
                  list: safeList,
                })
              : t("pantry.strip.safeLow", {
                  defaultValue: "Safe foods low: {{list}}",
                  list: safeList,
                })}
          </span>
          <Button size="sm" variant="outline" className="h-11 shrink-0" onClick={onAddSafe}>
            {t("pantry.strip.addThese", "Add these")}
          </Button>
        </div>
      )}

      {outCount > 0 && (
        <button
          type="button"
          aria-pressed={outPressed}
          onClick={() => onFilter(outPressed ? "all" : "out-of-stock")}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            STOCK_TONE.out.chip,
            outPressed && "ring-2 ring-destructive/60"
          )}
        >
          <PackageOpen className={cn("h-4 w-4", STOCK_TONE.out.icon)} aria-hidden="true" />
          {t("pantry.strip.out", {
            defaultValue_one: "{{count}} out",
            defaultValue: "{{count}} out",
            count: outCount,
          })}
        </button>
      )}

      {lowCount > 0 && (
        <button
          type="button"
          aria-pressed={lowPressed}
          onClick={() => onFilter(lowPressed ? "all" : "low-stock")}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            STOCK_TONE.low.chip,
            lowPressed && "ring-2 ring-warning/60"
          )}
        >
          <AlertTriangle className={cn("h-4 w-4", STOCK_TONE.low.icon)} aria-hidden="true" />
          {t("pantry.strip.low", {
            defaultValue_one: "{{count}} low",
            defaultValue: "{{count}} low",
            count: lowCount,
          })}
        </button>
      )}

      {needCount > 0 && (
        <Button className="ml-auto h-11 shrink-0 gap-1.5" onClick={onAddAll}>
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          {t("pantry.strip.addAll", {
            defaultValue_one: "Add {{count}} to list",
            defaultValue: "Add {{count}} to list",
            count: needCount,
          })}
        </Button>
      )}
    </div>
  );
});
