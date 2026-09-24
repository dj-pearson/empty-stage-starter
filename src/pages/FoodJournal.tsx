import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { toast } from "sonner";
import { BookOpen, Plus, Printer, Share2 } from "lucide-react";
import { useFoods, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuickLog } from "@/contexts/QuickLogContext";
import { useHousehold } from "@/hooks/useHousehold";
import { useJournalFeedback } from "@/hooks/useJournalFeedback";
import { useKidsProgressSummary } from "@/hooks/useKidsProgressSummary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CopyFallbackDialog } from "@/components/CopyFallbackDialog";
import { EditJournalItemDialog, type EditJournalItemPatch } from "@/components/foodJournal/EditJournalItemDialog";
import { JournalDayCard } from "@/components/foodJournal/JournalDayCard";
import { JournalSummary } from "@/components/foodJournal/JournalSummary";
import { StillToLogCard } from "@/components/foodJournal/StillToLogCard";
import { buildKidPatternView, patternViewLines } from "@/components/foodJournal/journalPatternView";
import { addIsoDays, parseIsoDate, toISODate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { buildFoodJournal, summarizeJournal, type JournalDay, type JournalItem, type JournalNote } from "@/lib/foodJournal";
import { buildJournalPatterns, formatJournalDayLabel, formatJournalText } from "@/lib/journalReport";
import { buildProgressByKid } from "@/lib/kidProgress";
import { shareOrCopyText } from "@/lib/shareText";
import { TOGGLE_CHIP_SMALL_CLASS, toggleChipState } from "@/lib/toggleChip";
import type { MealSlot, PlanEntry } from "@/types";

/**
 * Every logged meal for the selected child (or every child in Family mode), a
 * day at a time, with how it went, how much was eaten and the household's
 * notes; today's unlogged meals pinned on top; and a summary with patterns a
 * parent can share with a pediatrician or print.
 *
 * The range stops at 30 days because that is how far back AppContext loads
 * plan entries (the load window in AppContext.tsx).
 */

const RANGES = ["7", "14", "30"] as const;
type Range = (typeof RANGES)[number];

const isRange = (value: string): value is Range => (RANGES as readonly string[]).includes(value);

const hasReaction = (item: JournalItem): boolean =>
  item.notes.some((n) => n.source === "reaction") || item.components.some((c) => c.notes.some((n) => n.source === "reaction"));

function makeFormatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, opts);
  } catch {
    // A malformed locale tag throws RangeError; a time still has to render.
    return new Intl.DateTimeFormat("en", opts);
  }
}

export default function FoodJournal() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const { foods, foodsHydrated } = useFoods();
  const { recipes } = useRecipes();
  const { kids, activeKidId, kidsHydrated } = useKids();
  const { planEntries, updatePlanEntry } = usePlan();
  const { userId } = useAuth();
  const { members } = useHousehold();
  const { openQuickLog } = useQuickLog();

  const [range, setRange] = useState<Range>("7");
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const [onlyReactions, setOnlyReactions] = useState(false);
  const [editing, setEditing] = useState<JournalItem | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  // A tab left open overnight must roll over to the new day.
  const [today, setToday] = useState(() => toISODate(new Date()));
  useEffect(() => {
    const roll = () => setToday(toISODate(new Date()));
    const onVisibility = () => {
      if (document.visibilityState === "visible") roll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", roll);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", roll);
    };
  }, []);

  const from = addIsoDays(today, -(Number(range) - 1));
  // activeKidId can point at a kid that was deleted; that reads as Family mode.
  const activeKid = kids.find((k) => k.id === activeKidId);
  const effectiveKidId = activeKid ? activeKid.id : null;
  const familyMode = effectiveKidId === null;

  const slotLabel = useCallback((slot: MealSlot) => t(`mealSlots.${slot}`), [t]);
  const kidNames = useMemo(() => new Map(kids.map((k) => [k.id, k.name])), [kids]);
  const kidName = useCallback((id: string) => kidNames.get(id) ?? "", [kidNames]);
  const kidOrder = useMemo(() => kids.map((k) => k.id), [kids]);
  const viewKids = useMemo(() => (activeKid ? [activeKid] : kids), [activeKid, kids]);
  const viewKidIds = useMemo(() => viewKids.map((k) => k.id), [viewKids]);

  const attemptIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of planEntries) {
      if (!e.food_attempt_id) continue;
      const d = e.date.slice(0, 10);
      if (d < from || d > today) continue;
      if (effectiveKidId && e.kid_id !== effectiveKidId) continue;
      ids.push(e.food_attempt_id);
    }
    return ids;
  }, [planEntries, from, today, effectiveKidId]);

  const { feedback, attempts, status } = useJournalFeedback({ from, to: today, kidId: effectiveKidId, attemptIds });

  const baseOptions = useMemo(
    () => ({
      entries: planEntries,
      foods,
      recipes,
      feedback,
      attempts,
      kids,
      kidOrder,
      kidId: effectiveKidId,
      from,
      to: today,
    }),
    [planEntries, foods, recipes, feedback, attempts, kids, kidOrder, effectiveKidId, from, today]
  );

  // Totals and patterns read every logged meal; the filters narrow only the list.
  const allDays = useMemo(() => buildFoodJournal(baseOptions), [baseOptions]);
  const summary = useMemo(() => summarizeJournal(allDays), [allDays]);
  const listDays = useMemo(() => {
    const days = onlyWithNotes ? buildFoodJournal({ ...baseOptions, onlyWithNotes: true }) : allDays;
    if (!onlyReactions) return days;
    return days
      .map((day) => ({ ...day, items: day.items.filter(hasReaction) }))
      .filter((day) => day.items.length > 0);
  }, [baseOptions, allDays, onlyWithNotes, onlyReactions]);

  // Anything logged in the 30 days AppContext holds, for the empty states.
  const hasHistory30 = useMemo(() => {
    const start = addIsoDays(today, -29);
    return planEntries.some((e) => {
      const d = e.date.slice(0, 10);
      if (d < start || d > today) return false;
      if (effectiveKidId && e.kid_id !== effectiveKidId) return false;
      return e.result != null || !!e.notes?.trim();
    });
  }, [planEntries, today, effectiveKidId]);

  const foodNames = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);
  const foodName = useCallback((id: string) => foodNames.get(id) ?? null, [foodNames]);
  const progressOpts = useMemo(() => ({ windowDays: Number(range) }), [range]);
  const progressData = useKidsProgressSummary(viewKidIds, progressOpts);
  const progressByKid = useMemo(
    () =>
      buildProgressByKid(
        viewKids,
        planEntries,
        today,
        progressData.ladderRows,
        progressData.attempts,
        foodNames,
        Number(range)
      ),
    [viewKids, planEntries, today, progressData.ladderRows, progressData.attempts, foodNames, range]
  );

  const shortDate = useMemo(() => makeFormatter(locale, { month: "short", day: "numeric" }), [locale]);
  const timeFormat = useMemo(() => makeFormatter(locale, { hour: "numeric", minute: "2-digit" }), [locale]);

  const patternViews = useMemo(
    () =>
      viewKids.map((kid) =>
        buildKidPatternView(
          {
            kidId: kid.id,
            name: kid.name,
            patterns: buildJournalPatterns({
              days: allDays,
              entries: planEntries,
              kidId: kid.id,
              from,
              to: today,
              foodName,
            }),
            progress: progressByKid.get(kid.id),
          },
          t,
          (date) => shortDate.format(parseIsoDate(date))
        )
      ),
    [viewKids, allDays, planEntries, from, today, foodName, progressByKid, t, shortDate]
  );

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      const name = m.profiles?.full_name?.trim();
      if (name) map.set(m.user_id, name);
    }
    return map;
  }, [members]);

  /** "Maria, 12:40" for a household note; entry notes carry no author. */
  const authorLabel = useCallback(
    (note: JournalNote): string | null => {
      if (note.source !== "feedback" || !note.userId) return null;
      const who =
        note.userId === userId ? t("foodJournal.page.you", { defaultValue: "You" }) : memberNames.get(note.userId) ?? null;
      let when: string | null = null;
      if (note.createdAt) {
        const ms = Date.parse(note.createdAt);
        if (!Number.isNaN(ms)) when = timeFormat.format(ms);
      }
      const parts = [who, when].filter((p): p is string => !!p);
      return parts.length > 0 ? parts.join(", ") : null;
    },
    [userId, memberNames, timeFormat, t]
  );

  const dayLabelText = useCallback(
    (date: string) => {
      const label = formatJournalDayLabel(date, today, locale, t);
      return label.secondary ? `${label.primary}, ${label.secondary}` : label.primary;
    },
    [today, locale, t]
  );

  const deliver = useCallback(
    async (text: string, preferShare: boolean) => {
      const outcome = await shareOrCopyText(text, { preferShare, title: t("foodJournal.title") });
      if (outcome === "copied") toast.success(t("foodJournal.copied"));
      else if (outcome === "shared") toast.success(t("foodJournal.page.shared", { defaultValue: "Shared" }));
      else if (outcome === "failed") setFallbackText(text);
    },
    [t]
  );

  const onCopyDay = useCallback(
    (day: JournalDay, label: string) => {
      const text = formatJournalText([day], {
        t,
        slotLabel,
        dayLabel: () => label,
        kidName,
        familyMode,
        authorLabel,
      });
      void deliver(text, false);
    },
    [t, slotLabel, kidName, familyMode, authorLabel, deliver]
  );

  const onShareReport = useCallback(() => {
    const rangeLine = `${t(`foodJournal.range.${range}`)} (${t("foodJournal.page.reportRange", {
      from: shortDate.format(parseIsoDate(from)),
      to: shortDate.format(parseIsoDate(today)),
      defaultValue: "{{from}} to {{to}}",
    })})`;
    const countsLine = (logged: number, counts: { ate: number; tasted: number; refused: number }) =>
      `${t("foodJournal.summaryMeals", { count: logged })}: ${t("foodJournal.page.reportCounts", {
        ...counts,
        defaultValue: "Ate {{ate}}, tasted {{tasted}}, refused {{refused}}",
      })}`;

    const sections: string[] = [];
    if (viewKids.length === 0) {
      sections.push(
        formatJournalText(allDays, {
          t,
          slotLabel,
          dayLabel: dayLabelText,
          kidName,
          familyMode: true,
          authorLabel,
          header: [
            t("foodJournal.page.reportHeader", {
              name: t("foodJournal.page.reportFamily", { defaultValue: "Everyone" }),
              defaultValue: "Food journal: {{name}}",
            }),
            rangeLine,
            countsLine(summary.logged, summary.counts),
          ],
        })
      );
    }
    // One section per kid, so each child's report reads on its own.
    const withData = viewKids.filter((kid) => summary.byKid.has(kid.id) || allDays.some((d) => d.items.some((i) => i.kidId === kid.id)));
    for (const kid of withData.length > 0 ? withData : viewKids) {
      const kidDays = allDays
        .map((day) => ({ ...day, items: day.items.filter((i) => i.kidId === kid.id) }))
        .filter((day) => day.items.length > 0);
      const totals = summary.byKid.get(kid.id);
      const view = patternViews.find((v) => v.kidId === kid.id);
      sections.push(
        formatJournalText(kidDays, {
          t,
          slotLabel,
          dayLabel: dayLabelText,
          kidName,
          familyMode: false,
          authorLabel,
          header: [
            t("foodJournal.page.reportHeader", { name: kid.name, defaultValue: "Food journal: {{name}}" }),
            rangeLine,
            countsLine(totals?.logged ?? 0, totals?.counts ?? { ate: 0, tasted: 0, refused: 0 }),
          ],
          patternLines: view ? patternViewLines(view, t, false) : [],
        })
      );
    }
    void deliver(sections.join("\n\n\n"), true);
  }, [t, range, shortDate, from, today, viewKids, allDays, slotLabel, dayLabelText, kidName, authorLabel, summary, patternViews, deliver]);

  const onEdit = useCallback((item: JournalItem) => setEditing(item), []);
  const closeEdit = useCallback(() => setEditing(null), []);
  const logEntry = useCallback((entryId: string) => openQuickLog({ entryId }), [openQuickLog]);
  const logMeal = useCallback(() => openQuickLog(), [openQuickLog]);

  // The dialog's note field is "" when cleared, as the journal always wrote it.
  const saveEdit = useCallback(
    (entryId: string, patch: EditJournalItemPatch) => {
      const { notes, ...rest } = patch;
      const updates: Partial<PlanEntry> = { ...rest };
      if (notes !== undefined) updates.notes = notes ?? "";
      return updatePlanEntry(entryId, updates);
    },
    [updatePlanEntry]
  );
  // Only looked up while the dialog is open.
  const editingEntry = useMemo(
    () => (editing ? planEntries.find((e) => e.id === editing.entryId) : undefined),
    [editing, planEntries]
  );

  const subtitle = activeKid
    ? t("foodJournal.subtitleKid", { name: activeKid.name })
    : t("foodJournal.subtitleFamily");

  const filtered = onlyWithNotes || onlyReactions;
  const hydrated = kidsHydrated && foodsHydrated;
  const showSummary = summary.logged + summary.noteOnly > 0;

  const clearFilters = () => {
    setOnlyWithNotes(false);
    setOnlyReactions(false);
  };

  const skeleton = (
    <div aria-busy="true" aria-label={t("foodJournal.page.loadingNotes", { defaultValue: "Loading notes" })} className="space-y-4">
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-4 md:p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  let body: ReactNode;
  if (listDays.length > 0) {
    body = (
      <ol className="space-y-4">
        {listDays.map((day) => (
          <li key={day.date}>
            <JournalDayCard
              day={day}
              today={today}
              locale={locale}
              familyMode={familyMode}
              kidName={kidName}
              slotLabel={slotLabel}
              authorLabel={authorLabel}
              onEdit={onEdit}
              onCopy={onCopyDay}
            />
          </li>
        ))}
      </ol>
    );
  } else if (onlyWithNotes && status === "loading") {
    body = skeleton;
  } else if (filtered && allDays.length > 0) {
    body = (
      <EmptyCard
        title={t("foodJournal.emptyTitle")}
        text={onlyReactions ? t("foodJournal.page.emptyReactions", { defaultValue: "No reactions recorded in this range." }) : t("foodJournal.emptyNotes")}
        action={
          <Button variant="outline" className="min-h-11" onClick={clearFilters}>
            {t("foodJournal.page.showAllMeals", { defaultValue: "Show all meals" })}
          </Button>
        }
      />
    );
  } else if (range !== "30" && hasHistory30) {
    body = (
      <EmptyCard
        title={t("foodJournal.page.emptyRangeTitle", { defaultValue: "Nothing logged in this range" })}
        text={t("foodJournal.page.emptyRangeText", { defaultValue: "There are logged meals earlier this month." })}
        action={
          <Button variant="outline" className="min-h-11" onClick={() => setRange("30")}>
            {t("foodJournal.page.showLast30", { defaultValue: "Show last 30 days" })}
          </Button>
        }
      />
    );
  } else if (hydrated) {
    body = (
      <EmptyCard
        title={t("foodJournal.emptyTitle")}
        text={t("foodJournal.emptyText")}
        action={
          <Button className="min-h-11" onClick={logMeal}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("foodJournal.page.logMeal", { defaultValue: "Log a meal" })}
          </Button>
        }
      />
    );
  } else {
    body = skeleton;
  }

  return (
    <>
      <Helmet>
        <title>{t("foodJournal.title")} - EatPal</title>
        <meta name="description" content={t("foodJournal.metaDescription")} />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="min-h-screen bg-background pb-20 md:pt-20 print:min-h-0 print:p-0">
        <div className="container mx-auto max-w-3xl px-4 py-6 md:py-8">
          <header className="mb-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
                  <BookOpen className="h-6 w-6 text-primary md:h-7 md:w-7" aria-hidden="true" />
                  {t("foodJournal.title")}
                </h1>
                <p className="mt-1 text-muted-foreground">{subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Button className="min-h-11" onClick={logMeal}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("foodJournal.page.logMeal", { defaultValue: "Log a meal" })}
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={onShareReport}>
                  <Share2 className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("foodJournal.page.shareReport", { defaultValue: "Share report" })}
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={() => window.print()}>
                  <Printer className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("foodJournal.page.print", { defaultValue: "Print" })}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <ToggleGroup
                type="single"
                variant="outline"
                value={range}
                onValueChange={(value) => {
                  if (isRange(value)) setRange(value);
                }}
                aria-label={t("foodJournal.rangeLabel")}
                className="justify-start"
              >
                {RANGES.map((value) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    aria-label={t(`foodJournal.range.${value}`)}
                    className="h-11 min-w-11 px-3"
                  >
                    {t("foodJournal.page.rangeShort", { days: value, defaultValue: "{{days}}d" })}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div
                role="group"
                aria-label={t("foodJournal.page.filtersLabel", { defaultValue: "Filters" })}
                className="ml-auto flex flex-wrap items-center justify-end gap-3"
              >
                <button
                  type="button"
                  aria-pressed={onlyReactions}
                  onClick={() => setOnlyReactions((v) => !v)}
                  className={cn(TOGGLE_CHIP_SMALL_CLASS, "min-h-11", toggleChipState(onlyReactions))}
                >
                  {t("foodJournal.page.onlyReactions", { defaultValue: "Only reactions" })}
                </button>
                <div className="flex min-h-11 items-center gap-2">
                  <Switch id="journal-only-notes" checked={onlyWithNotes} onCheckedChange={setOnlyWithNotes} />
                  <Label htmlFor="journal-only-notes">{t("foodJournal.onlyNotes")}</Label>
                </div>
              </div>
            </div>
            {range === "30" && (
              <p className="text-sm text-muted-foreground print:hidden">
                {t("foodJournal.page.rangeCeiling", { defaultValue: "The journal covers the last 30 days." })}
              </p>
            )}
          </header>

          <div className="space-y-4">
            <StillToLogCard
              planEntries={planEntries}
              kids={kids}
              foods={foods}
              recipes={recipes}
              kidId={effectiveKidId}
              today={today}
              slotLabel={slotLabel}
              onLog={logEntry}
            />

            {showSummary && (
              <JournalSummary summary={summary} familyMode={familyMode} kids={kids} patterns={patternViews} />
            )}

            {status === "offline" && (
              <p className="text-sm text-muted-foreground" role="status">
                {t("foodJournal.page.offlineNotes", {
                  defaultValue: "You're offline. Notes written in the iPhone app will show when you reconnect.",
                })}
              </p>
            )}

            {body}
          </div>
        </div>
      </div>

      <EditJournalItemDialog
        item={editing}
        entry={editingEntry}
        authorLabel={authorLabel}
        onClose={closeEdit}
        save={saveEdit}
      />
      <CopyFallbackDialog
        text={fallbackText}
        onClose={() => setFallbackText(null)}
        title={t("foodJournal.page.copyFallbackTitle", { defaultValue: "Copy this text" })}
        body={t("foodJournal.page.copyFallbackBody", {
          defaultValue: "Your browser didn't allow copying. Select the text and copy it by hand.",
        })}
      />
    </>
  );
}

function EmptyCard({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="font-medium">{title}</p>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{text}</p>
        <div className="mt-4 print:hidden">{action}</div>
      </CardContent>
    </Card>
  );
}
