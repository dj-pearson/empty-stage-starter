import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronDown, Sparkles } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Food, Kid, PlanEntry } from "@/types";
import { cn } from "@/lib/utils";
import { isoDay } from "@/lib/mobilePlannerDay";
import { buildTryBiteStrip, foodTrackerHref, type TryBiteItem } from "@/lib/tryBiteStrip";
import type { KidFitResult } from "@/lib/kidFit";
import "@/i18n/appLocale";

/** Per viewer: whether the strip is open. A convenience, so storage may fail. */
export const TRY_BITE_STRIP_OPEN_KEY = "eatpal.planner.tryBitesOpen";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(TRY_BITE_STRIP_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(TRY_BITE_STRIP_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Private window or blocked storage: the strip just opens next time.
  }
}

const RESULT_DEFAULT: Record<KidFitResult, string> = { ate: "ate it", tasted: "tasted", refused: "refused" };

interface TryBiteStripProps {
  weekStartIso: string;
  planEntries: PlanEntry[];
  foods: Food[];
  kids: Kid[];
  /** The kid the planner shows, or null for the whole family. */
  activeKidId?: string | null;
  /** Called before following a link, so the tracker opens on that kid. */
  onOpenKid?: (kidId: string) => void;
}

/**
 * Item 4: per kid, the try bites on the week in view with this month's
 * exposures, each linking to its Food Tracker row. Collapsible and compact so
 * it sits above the grid on a phone without pushing the day off screen.
 * Renders nothing when no try bite is planned this week.
 */
export const TryBiteStrip = memo(function TryBiteStrip({
  weekStartIso,
  planEntries,
  foods,
  kids,
  activeKidId = null,
  onOpenKid,
}: TryBiteStripProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(readOpen);
  const today = isoDay(new Date());
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const shownKids = useMemo(
    () => (activeKidId ? kids.filter((k) => k.id === activeKidId) : kids),
    [kids, activeKidId],
  );
  const rows = useMemo(
    () => buildTryBiteStrip(planEntries, shownKids, foodById, weekStartIso, today),
    [planEntries, shownKids, foodById, weekStartIso, today],
  );

  if (rows.length === 0) return null;
  const foodCount = rows.reduce((n, r) => n + r.items.length, 0);

  const exposure = (item: TryBiteItem): string =>
    item.tries === 0
      ? t("planner.tryBites.notTried", { defaultValue: "Not tried this month" })
      : t("planner.tryBites.tries", {
          defaultValue: "{{count}} tries this month",
          defaultValue_one: "1 try this month",
          count: item.tries,
        });

  const last = (item: TryBiteItem): string | null =>
    item.lastResult
      ? t("planner.tryBites.last", {
          defaultValue: "last: {{result}}",
          result: t(`planner.tryBites.result.${item.lastResult}`, { defaultValue: RESULT_DEFAULT[item.lastResult] }),
        })
      : null;

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        writeOpen(next);
      }}
      className="mb-4 rounded-xl border border-try-bite/30 bg-try-bite/5"
      data-testid="try-bite-strip"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-try-bite" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">
            {t("planner.tryBites.title", { defaultValue: "Try bites this week" })}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("planner.tryBites.summary", {
              defaultValue: "{{count}} foods",
              defaultValue_one: "1 food",
              count: foodCount,
            })}
          </span>
          <ChevronDown
            className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 px-3 pb-3">
          {rows.map(({ kid, items }) => (
            <div key={kid.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <span className="shrink-0 pt-1 text-xs font-semibold text-foreground sm:w-24 sm:truncate">
                {kid.name}
              </span>
              <ul
                className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
                aria-label={t("planner.tryBites.kidList", {
                  defaultValue: "{{name}}'s try bites this week",
                  name: kid.name,
                })}
              >
                {items.map((item) => {
                  const lastText = last(item);
                  return (
                    <li key={item.food.id} className="shrink-0">
                      <Link
                        to={foodTrackerHref(item.food.id)}
                        onClick={() => onOpenKid?.(kid.id)}
                        data-testid={`try-bite-${kid.id}-${item.food.id}`}
                        className="flex min-h-11 flex-col justify-center rounded-lg border border-border bg-card px-2.5 py-1 hover:border-try-bite/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={t("planner.tryBites.linkLabel", {
                          defaultValue: "{{food}} for {{name}}: {{exposure}}. Open in Food Tracker",
                          food: item.food.name,
                          name: kid.name,
                          exposure: [exposure(item), lastText].filter(Boolean).join(", "),
                        })}
                      >
                        <span className="text-sm font-medium text-foreground">{item.food.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {exposure(item)}
                          {lastText && <> - {lastText}</>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});
