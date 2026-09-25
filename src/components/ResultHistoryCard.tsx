import { useId, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlanEntry, Food, Recipe, Kid } from "@/types";
import { Clock } from "lucide-react";
import { parseIsoDate } from "@/lib/date-utils";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Button } from "@/components/ui/button";
import { buildFoodJournal, type JournalItem } from "@/lib/foodJournal";
import { RESULT_STYLE } from "@/lib/mealResultStyle";

interface ResultHistoryCardProps {
  /** Raw plan entries for the household; the card scopes them itself. */
  entries: PlanEntry[];
  foods: Food[];
  /** Without them a recipe row is named after its first food. */
  recipes?: Pick<Recipe, "id" | "name">[];
  /** The child in scope. Null or undefined means every child. */
  kidId?: string | null;
  /** Names each row's child in the family view. */
  kids?: Pick<Kid, "id" | "name">[];
  /** 'YYYY-MM-DD'. Rows after it (planned, not yet eaten) are left out. */
  todayIso?: string;
  /** Where "View journal" goes. Defaults to the journal, scoped to kidId. */
  to?: string;
  /**
   * When set, the title renders as an h2 with this id, so a page can use the
   * card as a section and point aria-labelledby at it. Otherwise an h3.
   */
  titleId?: string;
}

const HISTORY_LIMIT = 20;
/** Rows shown before "Show all". */
const COLLAPSED_ROWS = 5;

type LoggedItem = JournalItem & { result: NonNullable<JournalItem["result"]> };

/**
 * The last twenty logged dishes. Built on the journal builder, so a recipe
 * shows once per child under its own name rather than once per ingredient row.
 */
export function ResultHistoryCard({
  entries,
  foods,
  recipes,
  kidId,
  kids,
  todayIso,
  to,
  titleId,
}: ResultHistoryCardProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  const items = useMemo(
    () =>
      buildFoodJournal({ entries, foods, recipes, kidId, kids, to: todayIso })
        .flatMap((day) => day.items)
        .filter((item): item is LoggedItem => item.result !== null)
        .slice(0, HISTORY_LIMIT),
    [entries, foods, recipes, kidId, kids, todayIso]
  );

  const currentYear = (todayIso ? parseIsoDate(todayIso) : new Date()).getFullYear();
  const [dateFormat, dateFormatWithYear] = useMemo(() => {
    const make = (opts: Intl.DateTimeFormatOptions) => {
      try {
        return new Intl.DateTimeFormat(i18n.language || undefined, opts);
      } catch {
        return new Intl.DateTimeFormat(undefined, opts);
      }
    };
    return [make({ month: "short", day: "numeric" }), make({ month: "short", day: "numeric", year: "numeric" })];
  }, [i18n.language]);

  const kidNames = useMemo(() => new Map((kids ?? []).map((k) => [k.id, k.name])), [kids]);
  const showKid = !kidId && (kids?.length ?? 0) > 1;

  const href = to ?? (kidId ? `/dashboard/food-journal?kid=${encodeURIComponent(kidId)}` : "/dashboard/food-journal");

  const titleContent = (
    <>
      <Clock className="h-5 w-5" aria-hidden="true" />
      {t("foodJournal.history.title", { defaultValue: "Recent meal history" })}
    </>
  );
  const title = titleId ? (
    <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
      {titleContent}
    </h2>
  ) : (
    <CardTitle className="flex items-center gap-2">{titleContent}</CardTitle>
  );

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>{title}</CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("foodJournal.history.empty", {
              defaultValue: "No logged meals yet. Mark meals in the Planner to see them here.",
            })}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/planner">
              {t("foodJournal.history.openPlanner", { defaultValue: "Open the Planner" })}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);
  const hidden = items.length > COLLAPSED_ROWS;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
        {title}
        <Button asChild variant="outline" size="sm">
          <Link to={href}>{t("foodJournal.viewJournal")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul id={listId} className="space-y-2">
          {visible.map((item) => {
            const style = RESULT_STYLE[item.result];
            const note = item.notes[0]?.text;
            const day = parseIsoDate(item.date);
            const date = (day.getFullYear() === currentYear ? dateFormat : dateFormatWithYear).format(day);
            const slot = t(`mealSlots.${item.mealSlot}`);
            const meta = showKid
              ? t("foodJournal.history.rowMeta", {
                  kid:
                    kidNames.get(item.kidId) ??
                    t("foodJournal.history.formerKid", { defaultValue: "Former child" }),
                  date,
                  slot,
                  defaultValue: "{{kid}} · {{date}} · {{slot}}",
                })
              : `${date} · ${slot}`;
            return (
              <li
                key={`${item.entryId}-${item.kidId}`}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {item.name ?? t("foodJournal.unknownFood", { defaultValue: "Unknown food" })}
                  </p>
                  <p className="text-xs text-muted-foreground">{meta}</p>
                  {note && (
                    <q className="mt-1 block text-xs text-muted-foreground italic line-clamp-2">{note}</q>
                  )}
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
        {hidden ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 w-full"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? t("foodJournal.history.showFewer", { defaultValue: "Show fewer" })
              : t("foodJournal.history.showAll", { count: items.length, defaultValue: "Show all {{count}}" })}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
