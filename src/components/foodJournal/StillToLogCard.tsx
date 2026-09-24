import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildQuickLogMeals } from "@/lib/quickLog";
import { NOT_LOGGED_STYLE } from "@/lib/mealResultStyle";
import type { Food, Kid, MealSlot, PlanEntry, Recipe } from "@/types";

/**
 * Today's planned meals nobody has logged yet, pinned above the journal so
 * the page a parent opens to read is also where they catch up. "Log it"
 * opens the shell's quick-log modal on that meal, the same save path as the
 * FAB, rather than a second log flow. Hidden when there is nothing left.
 */
export interface StillToLogCardProps {
  planEntries: ReadonlyArray<PlanEntry>;
  kids: ReadonlyArray<Pick<Kid, "id" | "name">>;
  foods: ReadonlyArray<Pick<Food, "id" | "name">>;
  recipes: ReadonlyArray<Pick<Recipe, "id" | "name">>;
  /** Null for Family mode. */
  kidId: string | null;
  /** Local 'YYYY-MM-DD'. */
  today: string;
  slotLabel: (slot: MealSlot) => string;
  onLog: (entryId: string) => void;
}

function StillToLogCardImpl({ planEntries, kids, foods, recipes, kidId, today, slotLabel, onLog }: StillToLogCardProps) {
  const { t } = useTranslation();
  const unloggedToday = useMemo(
    () =>
      buildQuickLogMeals(planEntries, kids, foods, recipes, kidId, today, new Date(), slotLabel).filter(
        (m) => !m.result
      ),
    [planEntries, kids, foods, recipes, kidId, today, slotLabel]
  );

  if (unloggedToday.length === 0) return null;

  return (
    <Card className="print:hidden">
      <CardContent className="p-4 md:p-6">
        <h2 className="text-base font-semibold">
          {t("foodJournal.page.stillToLog", { defaultValue: "Still to log today" })}
        </h2>
        <ul className="mt-2 divide-y divide-border">
          {unloggedToday.map((meal) => (
            <li key={meal.id} className="flex items-center justify-between gap-3 py-2 last:pb-0">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", NOT_LOGGED_STYLE.dotClassName)} aria-hidden="true" />
                <span className="break-words">{meal.label}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 shrink-0"
                onClick={() => onLog(meal.id)}
                aria-label={t("foodJournal.page.logItAria", { label: meal.label, defaultValue: "Log it: {{label}}" })}
              >
                {t("foodJournal.page.logIt", { defaultValue: "Log it" })}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export const StillToLogCard = memo(StillToLogCardImpl);
