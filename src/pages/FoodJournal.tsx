import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BookOpen, Copy, Pencil } from "lucide-react";
import { useFoods, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addIsoDays, parseIsoDate, toISODate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import {
  AMOUNT_EATEN_VALUES,
  buildFoodJournal,
  summarizeAmounts,
  type JournalDay,
  type JournalFeedback,
  type JournalItem,
} from "@/lib/foodJournal";
import type { AmountEaten, MealSlot } from "@/types";

/**
 * Every logged meal for the selected child, a day at a time, with the notes and
 * amounts caregivers wrote. Plan entries are household-scoped, so a note the
 * nanny logs is here for the parent too.
 *
 * The range stops at 30 days because that is how far back AppContext loads
 * plan entries (the load window in AppContext.tsx).
 */

const RANGES = ["7", "14", "30"] as const;
type Range = (typeof RANGES)[number];

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack1: "Snack 1",
  snack2: "Snack 2",
  try_bite: "Try Bite",
};

const RESULT_BADGE: Record<"ate" | "tasted" | "refused", string> = {
  ate: "bg-safe-food text-white",
  tasted: "bg-secondary text-secondary-foreground",
  refused: "bg-destructive text-destructive-foreground",
};

function formatDayHeading(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(parseIsoDate(date));
}

export default function FoodJournal() {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { recipes } = useRecipes();
  const { kids, activeKidId } = useKids();
  const { planEntries, updatePlanEntry } = usePlan();

  const [range, setRange] = useState<Range>("7");
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const [feedback, setFeedback] = useState<JournalFeedback[]>([]);
  const [editing, setEditing] = useState<JournalItem | null>(null);

  const today = toISODate(new Date());
  const from = addIsoDays(today, -(Number(range) - 1));
  const activeKid = kids.find((k) => k.id === activeKidId);
  const kidNames = useMemo(() => new Map(kids.map((k) => [k.id, k.name])), [kids]);

  // Notes from the iOS "How was it?" sheet live in plan_entry_feedback. RLS
  // returns the caller's own rows and their household's.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("plan_entry_feedback")
        .select("id, plan_entry_id, user_id, rating, note, created_at")
        .not("note", "is", null)
        .gte("created_at", from)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        logger.warn("FoodJournal: feedback load failed", error);
        toast.error(t("foodJournal.feedbackLoadFailed"));
        return;
      }
      setFeedback((data ?? []) as JournalFeedback[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, t]);

  const days = useMemo(
    () =>
      buildFoodJournal({
        entries: planEntries,
        foods,
        recipes,
        feedback,
        kidId: activeKidId,
        from,
        to: today,
        onlyWithNotes,
      }),
    [planEntries, foods, recipes, feedback, activeKidId, from, today, onlyWithNotes]
  );

  const totals = useMemo(() => {
    const counts = { ate: 0, tasted: 0, refused: 0 };
    let meals = 0;
    for (const day of days) {
      counts.ate += day.counts.ate;
      counts.tasted += day.counts.tasted;
      counts.refused += day.counts.refused;
      meals += day.items.length;
    }
    return { counts, meals, amounts: summarizeAmounts(days) };
  }, [days]);

  const copyDay = async (day: JournalDay) => {
    const lines = [formatDayHeading(day.date)];
    for (const item of day.items) {
      const parts = [`${SLOT_LABELS[item.mealSlot] ?? item.mealSlot}: ${item.name}`];
      if (item.result) parts.push(t(`foodJournal.result.${item.result}`));
      if (item.amountEaten) parts.push(t(`foodJournal.amount.${item.amountEaten}`));
      lines.push(`- ${parts.join(" / ")}`);
      for (const note of item.notes) lines.push(`    "${note.text}"`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success(t("foodJournal.copied"));
    } catch (error) {
      logger.warn("FoodJournal: clipboard write failed", error);
    }
  };

  const subtitle = activeKid
    ? t("foodJournal.subtitleKid", { name: activeKid.name })
    : t("foodJournal.subtitleFamily");

  return (
    <>
      <Helmet>
        <title>{t("foodJournal.title")} - EatPal</title>
        <meta name="description" content={t("foodJournal.metaDescription")} />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="min-h-screen pb-20 md:pt-20 bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <header className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BookOpen className="h-7 w-7 text-primary" aria-hidden="true" />
              {t("foodJournal.title")}
            </h1>
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          </header>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div className="flex items-center gap-2">
              <Label htmlFor="journal-range" className="sr-only">
                {t("foodJournal.rangeLabel")}
              </Label>
              <Select value={range} onValueChange={(value) => setRange(value as Range)}>
                <SelectTrigger id="journal-range" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`foodJournal.range.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="journal-only-notes" checked={onlyWithNotes} onCheckedChange={setOnlyWithNotes} />
              <Label htmlFor="journal-only-notes">{t("foodJournal.onlyNotes")}</Label>
            </div>
          </div>

          {totals.meals > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("foodJournal.summaryTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm">
                <span className="mr-2 text-muted-foreground">
                  {t("foodJournal.summaryMeals", { count: totals.meals })}
                </span>
                {(["ate", "tasted", "refused"] as const).map((r) => (
                  <Badge key={r} className={RESULT_BADGE[r]}>
                    {t(`foodJournal.result.${r}`)} {totals.counts[r]}
                  </Badge>
                ))}
                {AMOUNT_EATEN_VALUES.map((a) => (
                  <Badge key={a} variant="outline">
                    {t(`foodJournal.amount.${a}`)} {totals.amounts[a]}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {days.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="font-medium">{t("foodJournal.emptyTitle")}</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-prose mx-auto">
                  {onlyWithNotes ? t("foodJournal.emptyNotes") : t("foodJournal.emptyText")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <ol className="space-y-6">
              {days.map((day) => (
                <li key={day.date}>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <h2 className="text-lg font-semibold leading-none tracking-tight">
                        {formatDayHeading(day.date)}
                      </h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyDay(day)}
                        aria-label={t("foodJournal.copyDayAria", { date: formatDayHeading(day.date) })}
                      >
                        <Copy className="h-4 w-4 mr-1" aria-hidden="true" />
                        {t("foodJournal.copyDay")}
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <ul className="divide-y divide-border">
                        {day.items.map((item) => (
                          <li key={item.entryId} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">
                                  {SLOT_LABELS[item.mealSlot] ?? item.mealSlot}
                                  {!activeKidId && kidNames.get(item.kidId)
                                    ? ` - ${kidNames.get(item.kidId)}`
                                    : ""}
                                </p>
                                <p className="font-medium break-words">{item.name}</p>
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {item.result && (
                                    <Badge className={RESULT_BADGE[item.result]}>
                                      {t(`foodJournal.result.${item.result}`)}
                                    </Badge>
                                  )}
                                  {item.amountEaten && (
                                    <Badge variant="outline">{t(`foodJournal.amount.${item.amountEaten}`)}</Badge>
                                  )}
                                </div>
                                {item.notes.length > 0 && (
                                  <ul className="mt-2 space-y-1">
                                    {item.notes.map((note) => (
                                      <li key={note.key} className="text-sm text-foreground/80 whitespace-pre-wrap">
                                        {note.text}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditing(item)}
                                aria-label={t("foodJournal.editAria", { name: item.name })}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <EditJournalItemDialog
        item={editing}
        currentNote={planEntries.find((e) => e.id === editing?.entryId)?.notes ?? ""}
        onClose={() => setEditing(null)}
        onSave={async (entryId, patch) => {
          const { error } = await updatePlanEntry(entryId, patch);
          if (!error) {
            toast.success(t("foodJournal.saved"));
            setEditing(null);
          }
        }}
      />
    </>
  );
}

interface EditJournalItemDialogProps {
  item: JournalItem | null;
  /** plan_entries.notes, the note this dialog edits. */
  currentNote: string;
  onClose: () => void;
  onSave: (entryId: string, patch: { notes: string; amount_eaten: AmountEaten | null }) => Promise<void>;
}

function EditJournalItemDialog({ item, currentNote, onClose, onSave }: EditJournalItemDialogProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<AmountEaten | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setNote(currentNote);
      setAmount(item.amountEaten);
    }
    // Reset only when a different entry opens, not on every realtime update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.entryId]);

  // Feedback notes belong to whoever wrote them (RLS lets only the author edit),
  // so they are shown here for context rather than offered for editing.
  const otherNotes = item?.notes.filter((n) => n.source === "feedback") ?? [];

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? t("foodJournal.editTitle", { name: item.name }) : ""}</DialogTitle>
        </DialogHeader>

        {item?.result !== "refused" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("foodJournal.amountLabel")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {AMOUNT_EATEN_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount((current) => (current === value ? null : value))}
                  aria-pressed={amount === value}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    amount === value ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
                  )}
                >
                  {t(`foodJournal.amount.${value}`)}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="space-y-2">
          <Label htmlFor="journal-note">{t("foodJournal.noteLabel")}</Label>
          <Textarea
            id="journal-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("foodJournal.notePlaceholder")}
            rows={3}
          />
        </div>

        {otherNotes.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("foodJournal.otherNotes")}</p>
            <ul className="space-y-1">
              {otherNotes.map((n) => (
                <li key={n.key} className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {n.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("foodJournal.cancel")}
          </Button>
          <Button
            disabled={saving || !item}
            onClick={async () => {
              if (!item) return;
              setSaving(true);
              try {
                await onSave(item.entryId, {
                  notes: note.trim(),
                  amount_eaten: item.result === "refused" ? null : amount,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {t("foodJournal.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
