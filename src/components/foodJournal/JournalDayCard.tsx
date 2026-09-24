import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { AlertCircle, AlertTriangle, Copy, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatJournalDayLabel } from "@/lib/journalReport";
import { NOT_LOGGED_STYLE, RESULT_STYLE } from "@/lib/mealResultStyle";
import type { JournalComponent, JournalDay, JournalItem, JournalNote } from "@/lib/foodJournal";
import type { MealResult, MealSlot } from "@/types";

/**
 * One day of the food journal. Each meal is a row: how it went on the left,
 * then who (in Family mode), what and when, the chips a clinician asks about
 * (first taste, exposure count, allergen), the household's notes with who
 * wrote them, and any side logged on its own. The whole row opens the editor.
 */

export interface JournalDayCardProps {
  day: JournalDay;
  /** Local 'YYYY-MM-DD'. */
  today: string;
  locale: string;
  familyMode: boolean;
  kidName: (kidId: string) => string;
  slotLabel: (slot: MealSlot) => string;
  authorLabel: (note: JournalNote) => string | null;
  onEdit: (item: JournalItem) => void;
  onCopy: (day: JournalDay, label: string) => void;
}

function ResultChip({ result }: { result: MealResult }) {
  const { t } = useTranslation();
  const style = result ? RESULT_STYLE[result] : NOT_LOGGED_STYLE;
  const label = result
    ? t(`foodJournal.result.${result}`)
    : t("foodJournal.page.noteOnly", { defaultValue: "Note only" });
  const Icon = style.Icon;
  return (
    <Badge variant="outline" className={cn("gap-1 whitespace-nowrap", style.className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}

function NoteList({ notes, authorLabel }: { notes: JournalNote[]; authorLabel: (note: JournalNote) => string | null }) {
  const { t } = useTranslation();
  if (notes.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {notes.map((note) => {
        const by = authorLabel(note);
        return (
          <li key={note.key} className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
            {note.source === "reaction" && (
              <span className="mr-1 inline-flex items-center gap-1 font-medium text-destructive">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {t("foodJournal.page.reaction", { defaultValue: "Reaction" })}:
              </span>
            )}
            {note.text}
            {by && <span className="ml-1 text-xs"> ({by})</span>}
          </li>
        );
      })}
    </ul>
  );
}

function ComponentList({
  components,
  authorLabel,
}: {
  components: JournalComponent[];
  authorLabel: (note: JournalNote) => string | null;
}) {
  const { t } = useTranslation();
  if (components.length === 0) return null;
  const unknown = t("foodJournal.unknownFood", { defaultValue: "Unknown food" });
  return (
    <ul className="mt-2 space-y-1.5 pl-4">
      {components.map((c) => {
        const style = c.result ? RESULT_STYLE[c.result] : NOT_LOGGED_STYLE;
        const parts = [c.name ?? unknown];
        parts.push(c.result ? t(`foodJournal.result.${c.result}`) : t("foodJournal.page.noteOnly", { defaultValue: "Note only" }));
        if (c.amountEaten) parts.push(t(`foodJournal.amount.${c.amountEaten}`));
        return (
          <li key={c.entryId} className="text-sm">
            <span className="flex items-center gap-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dotClassName)} aria-hidden="true" />
              <span className="break-words">{parts.join(" / ")}</span>
            </span>
            <NoteList notes={c.notes} authorLabel={authorLabel} />
          </li>
        );
      })}
    </ul>
  );
}

interface RowProps {
  item: JournalItem;
  familyMode: boolean;
  kidName: (kidId: string) => string;
  slotLabel: (slot: MealSlot) => string;
  authorLabel: (note: JournalNote) => string | null;
  onEdit: (item: JournalItem) => void;
}

function JournalRow({ item, familyMode, kidName, slotLabel, authorLabel, onEdit }: RowProps) {
  const { t } = useTranslation();
  const name = item.name ?? t("foodJournal.unknownFood", { defaultValue: "Unknown food" });
  const kid = kidName(item.kidId);
  const slot = slotLabel(item.mealSlot);
  const meta = item.amountEaten ? `${slot} / ${t(`foodJournal.amount.${item.amountEaten}`)}` : slot;
  const hasChips = item.firstTry || item.exposureNumber > 1 || item.allergen !== null;

  return (
    <li className="relative py-3 first:pt-0 last:pb-0" data-testid="journal-row">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3">
        <div className="pt-0.5">
          <ResultChip result={item.result} />
        </div>
        <div className="min-w-0">
          {/* The button's ::after covers the row, so a tap anywhere on it opens the editor. */}
          <button
            type="button"
            onClick={() => onEdit(item)}
            aria-label={t("foodJournal.editAria", { name, kid, slot })}
            className="block min-h-11 w-full rounded-md text-left after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring print:min-h-0"
          >
            {familyMode && <span className="block text-sm font-medium">{kid}</span>}
            <span className="block break-words">{name}</span>
            <span className="block text-xs text-muted-foreground">{meta}</span>
          </button>
          {hasChips && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {item.firstTry && (
                <Badge variant="outline" className="font-normal hover:bg-transparent">
                  {t("foodJournal.page.chipFirstTry", { defaultValue: "First taste in 30 days" })}
                </Badge>
              )}
              {item.exposureNumber > 1 && (
                <Badge variant="outline" className="font-normal hover:bg-transparent">
                  {t("foodJournal.page.chipExposure", {
                    count: item.exposureNumber,
                    defaultValue: "Offered {{count}} times",
                  })}
                </Badge>
              )}
              {item.allergen && (
                <Badge variant="outline" className="gap-1 border-destructive/40 font-normal text-destructive hover:bg-transparent">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("foodJournal.page.chipAllergen", { allergen: item.allergen, defaultValue: "Contains {{allergen}}" })}
                </Badge>
              )}
            </div>
          )}
          <NoteList notes={item.notes} authorLabel={authorLabel} />
          <ComponentList components={item.components} authorLabel={authorLabel} />
        </div>
        <Pencil className="mt-1 h-4 w-4 text-muted-foreground print:hidden" aria-hidden="true" />
      </div>
    </li>
  );
}

function JournalDayCardImpl({
  day,
  today,
  locale,
  familyMode,
  kidName,
  slotLabel,
  authorLabel,
  onEdit,
  onCopy,
}: JournalDayCardProps) {
  const { t } = useTranslation();
  const label = useMemo(() => formatJournalDayLabel(day.date, today, locale, t), [day.date, today, locale, t]);
  const labelText = label.secondary ? `${label.primary}, ${label.secondary}` : label.primary;

  return (
    <Card className="break-inside-avoid">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-3 md:px-6">
        <h2 className="text-base font-semibold leading-tight" aria-label={labelText}>
          {label.primary}
          {label.secondary && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{label.secondary}</span>
          )}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 print:hidden"
          onClick={() => onCopy(day, labelText)}
          aria-label={t("foodJournal.copyDayAria", { date: labelText })}
        >
          <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
          {t("foodJournal.copyDay")}
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0 md:px-6">
        <ul className="divide-y divide-border">
          {day.items.map((item) => (
            <JournalRow
              key={item.entryId}
              item={item}
              familyMode={familyMode}
              kidName={kidName}
              slotLabel={slotLabel}
              authorLabel={authorLabel}
              onEdit={onEdit}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export const JournalDayCard = memo(JournalDayCardImpl);
