import { memo } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AMOUNT_EATEN_VALUES, type JournalSummary as JournalSummaryData, type JournalTotals } from "@/lib/foodJournal";
import { RESULT_STYLE, type LoggedResult } from "@/lib/mealResultStyle";
import type { KidPatternView } from "./journalPatternView";

/**
 * The top of the journal: how many meals were logged in the range, how they
 * went, how much was eaten, and (per kid) the patterns worth raising with a
 * pediatrician or feeding therapist.
 *
 * `summary` must come from the unfiltered days, so turning on "Only meals
 * with notes" narrows the list below and leaves these numbers alone.
 */

const RESULTS: readonly LoggedResult[] = ["ate", "tasted", "refused"];

export interface JournalSummaryProps {
  summary: JournalSummaryData;
  familyMode: boolean;
  /** Kids in display order, for the per-kid rows in Family mode. */
  kids: ReadonlyArray<{ id: string; name: string }>;
  patterns: ReadonlyArray<KidPatternView>;
}

function ResultCounts({ totals, label }: { totals: JournalTotals; label: string }) {
  const { t } = useTranslation();
  const shown = RESULTS.filter((r) => totals.counts[r] > 0);
  if (shown.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {shown.map((r) => (
        <li key={r}>
          <Badge variant="outline" className="gap-1.5 font-medium hover:bg-transparent">
            <span className={cn("h-2 w-2 rounded-full", RESULT_STYLE[r].dotClassName)} aria-hidden="true" />
            {t(`foodJournal.result.${r}`)} {totals.counts[r]}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

function PatternBlock({ view, withHeading }: { view: KidPatternView; withHeading: boolean }) {
  const { t } = useTranslation();
  const heading = withHeading
    ? t("foodJournal.page.patterns.titleKid", { name: view.name, defaultValue: "Patterns for {{name}}" })
    : t("foodJournal.page.patterns.title", { defaultValue: "Patterns" });
  const TrendIcon = view.trend ? TREND_ICON[view.trend.value] : null;

  return (
    <section aria-label={heading} className="space-y-2">
      <h3 className="text-sm font-semibold">{heading}</h3>
      {view.empty ? (
        <p className="text-sm text-muted-foreground">
          {t("foodJournal.page.patterns.none", { defaultValue: "Not enough logged yet to show patterns." })}
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {view.newFoods && <li>{view.newFoods}</li>}
          {view.closest && <li>{view.closest}</li>}
          {view.trend && TrendIcon && (
            <li className="flex items-center gap-1.5">
              {/* A static glyph beside the word: no motion to reduce, and the word carries the meaning. */}
              <TrendIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>{view.trend.text}</span>
            </li>
          )}
          {view.mostOffered.length > 0 && (
            <li>
              <span className="font-medium">
                {t("foodJournal.page.patterns.mostOfferedTitle", { defaultValue: "Offered most" })}
              </span>
              <ul className="mt-0.5 space-y-0.5 pl-4 text-muted-foreground">
                {view.mostOffered.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          )}
          {view.allergens.length > 0 && (
            <li className="text-destructive">
              <span className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {t("foodJournal.page.patterns.allergenTitle", { defaultValue: "Allergen exposures" })}
              </span>
              <ul className="mt-0.5 space-y-0.5 pl-6">
                {view.allergens.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          )}
          {view.reactions.length > 0 && (
            <li>
              <span className="font-medium">
                {t("foodJournal.page.patterns.reactionsTitle", { defaultValue: "Reactions" })}
              </span>
              <ul className="mt-0.5 space-y-0.5 pl-4 text-muted-foreground">
                {view.reactions.map((line, i) => (
                  <li key={`${i}-${line}`}>{line}</li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function JournalSummaryImpl({ summary, familyMode, kids, patterns }: JournalSummaryProps) {
  const { t } = useTranslation();
  const amounts = AMOUNT_EATEN_VALUES.filter((a) => summary.amounts[a] > 0).map((a) =>
    t("foodJournal.page.amountCount", {
      amount: t(`foodJournal.amount.${a}`),
      count: summary.amounts[a],
      defaultValue: "{{amount}} {{count}}",
    })
  );
  const countsLabel = t("foodJournal.page.resultCountsAria", { defaultValue: "Results in this range" });
  const kidRows = familyMode ? kids.filter((k) => summary.byKid.has(k.id)) : [];

  return (
    <Card>
      <CardContent className="space-y-4 p-4 md:p-6">
        <h2 className="text-base font-semibold">{t("foodJournal.summaryTitle")}</h2>

        <div className="space-y-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold">{t("foodJournal.summaryMeals", { count: summary.logged })}</span>
            {summary.noteOnly > 0 && (
              <span className="text-sm text-muted-foreground">
                {t("foodJournal.page.withNotesOnly", {
                  count: summary.noteOnly,
                  defaultValue: "+{{count}} with notes only",
                })}
              </span>
            )}
          </p>
          <ResultCounts totals={summary} label={countsLabel} />
          {amounts.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("foodJournal.page.amountsSentence", { list: amounts.join(", "), defaultValue: "How much: {{list}}." })}
            </p>
          )}
        </div>

        {kidRows.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border">
            {kidRows.map((kid) => {
              const totals = summary.byKid.get(kid.id);
              if (!totals) return null;
              return (
                <li
                  key={kid.id}
                  data-testid="journal-kid-summary"
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-sm">
                    <span className="font-medium">{kid.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {t("foodJournal.page.kidLogged", { count: totals.logged, defaultValue: "{{count}} logged" })}
                    </span>
                  </span>
                  <ResultCounts totals={totals} label={`${kid.name}: ${countsLabel}`} />
                </li>
              );
            })}
          </ul>
        )}

        {patterns.length > 0 && (
          <div className="space-y-4 border-t pt-4">
            {patterns.map((view) => (
              <PatternBlock key={view.kidId} view={view} withHeading={familyMode} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const JournalSummary = memo(JournalSummaryImpl);
