import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlanEntry, Food, Recipe } from "@/types";
import { Clock } from "lucide-react";
import { parseIsoDate } from "@/lib/date-utils";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Button } from "@/components/ui/button";
import { buildFoodJournal, type JournalItem } from "@/lib/foodJournal";
import { RESULT_STYLE } from "@/lib/mealResultStyle";

interface ResultHistoryCardProps {
  entries: PlanEntry[];
  foods: Food[];
  /** Without them a recipe row is named after its first food. */
  recipes?: Pick<Recipe, "id" | "name">[];
}

const HISTORY_LIMIT = 20;

type LoggedItem = JournalItem & { result: NonNullable<JournalItem["result"]> };

/**
 * The last twenty logged dishes. Built on the journal builder, so a recipe
 * shows once under its own name rather than once per ingredient row.
 */
export function ResultHistoryCard({ entries, foods, recipes }: ResultHistoryCardProps) {
  const { t, i18n } = useTranslation();

  const items = useMemo(
    () =>
      buildFoodJournal({ entries, foods, recipes, kidId: undefined })
        .flatMap((day) => day.items)
        .filter((item): item is LoggedItem => item.result !== null)
        .slice(0, HISTORY_LIMIT),
    [entries, foods, recipes]
  );

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", year: "numeric" }),
    [i18n.language]
  );

  const title = (
    <CardTitle className="flex items-center gap-2">
      <Clock className="h-5 w-5" aria-hidden="true" />
      {t("foodJournal.history.title", { defaultValue: "Recent meal history" })}
    </CardTitle>
  );

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>{title}</CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            {t("foodJournal.history.empty", {
              defaultValue: "No logged meals yet. Mark meals in the Planner to see them here.",
            })}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
        {title}
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/food-journal">{t("foodJournal.viewJournal")}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 max-h-[400px] overflow-y-auto">
          {items.map((item) => {
            const style = RESULT_STYLE[item.result];
            const note = item.notes[0]?.text;
            return (
              <li
                key={`${item.entryId}-${item.kidId}`}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {item.name ?? t("foodJournal.unknownFood", { defaultValue: "Unknown food" })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dateFormat.format(parseIsoDate(item.date))} · {t(`mealSlots.${item.mealSlot}`)}
                  </p>
                  {note && <p className="text-xs text-muted-foreground italic mt-1">"{note}"</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className={style.className}>
                    <style.Icon className="mr-1 h-3 w-3" aria-hidden="true" />
                    {t(`foodJournal.result.${item.result}`)}
                  </Badge>
                  {item.amountEaten && (
                    <Badge variant="outline">{t(`foodJournal.amount.${item.amountEaten}`)}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
