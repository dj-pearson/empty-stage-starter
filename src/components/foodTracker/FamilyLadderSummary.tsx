/**
 * Food Tracker in family mode: one short block per child.
 *
 * A parent with two picky eaters wants "what goes on each plate tonight"
 * without switching back and forth. Each block shows at most two foods, due
 * today first and then the ones closest to safe, with the same one-tap log as
 * the per-child screen (useFoodLadder.logAttempt, so the rung, the attempt and
 * mastery move together). The child's name opens their full ladder.
 *
 * When no child has anything on a ladder the blocks would all be empty, so the
 * child picker stands in with a line saying why.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { LadderQuickLogControls } from '@/components/LadderQuickLogControls';
import { useFoods, useKids } from '@/contexts/AppContext';
import { useFoodLadder, type LadderRow } from '@/hooks/useFoodLadder';
import { groupLadder } from '@/lib/ladderOverview';
import type { Food, Kid } from '@/types';
import { KidPickerGrid } from './KidChips';
import { localIsoDate } from './ladderDates';
import '@/i18n/appLocale';

/** Foods shown per child. Two fits a phone screen per child without scrolling past the next. */
export const FAMILY_FOODS_PER_KID = 2;

interface KidReport {
  settled: boolean;
  rows: number;
}

function KidLadderBlock({
  kid,
  foods,
  today,
  onReport,
}: {
  kid: Kid;
  foods: Food[];
  today: string;
  onReport: (kidId: string, report: KidReport) => void;
}) {
  const { t } = useTranslation();
  const { setActiveKid } = useKids();
  const { rows, loading, error, logAttempt, undoLog } = useFoodLadder(kid.id, { kid, foods });
  const [liveMessage, setLiveMessage] = useState('');

  useEffect(() => {
    onReport(kid.id, { settled: !loading, rows: rows.length });
  }, [kid.id, loading, rows.length, onReport]);

  const picks: LadderRow[] = useMemo(() => {
    const groups = groupLadder(rows, today);
    return [...groups.dueToday, ...groups.closeToSafe].slice(0, FAMILY_FOODS_PER_KID);
  }, [rows, today]);

  const foodName = useCallback(
    (foodId: string) =>
      foods.find((f) => f.id === foodId)?.name ??
      t('foodTracker.family.unknownFood', { defaultValue: 'Removed food' }),
    [foods, t]
  );

  if (rows.length === 0 && !error) return null;

  const headingId = `family-ladder-${kid.id}`;
  const more = rows.length - picks.length;

  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h3 id={headingId} className="text-base font-semibold">
        <button
          type="button"
          onClick={() => setActiveKid(kid.id)}
          aria-label={t('foodTracker.family.openKid', { defaultValue: "Open {{name}}'s foods", name: kid.name })}
          className="inline-flex min-h-11 items-center gap-1 rounded-md hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {kid.name}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </h3>

      {error ? (
        <p className="text-sm text-muted-foreground">
          {t('foodTracker.family.loadError', { defaultValue: "Couldn't load {{name}}'s ladder.", name: kid.name })}
        </p>
      ) : picks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('foodTracker.family.nothingToday', { defaultValue: 'Nothing to offer today.' })}
        </p>
      ) : (
        <ul className="mt-2 space-y-4">
          {picks.map((row) => (
            <li key={row.id} data-testid="family-ladder-food">
              <p className="font-medium">{foodName(row.foodId)}</p>
              <LadderQuickLogControls
                className="mt-1.5"
                row={row}
                foodName={foodName(row.foodId)}
                kidName={kid.name}
                mealSlot={row.preferredMealSlot}
                onLog={logAttempt}
                onUndo={undoLog}
                announce={setLiveMessage}
              />
            </li>
          ))}
        </ul>
      )}

      {more > 0 && !error ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('foodTracker.family.moreOnLadder', {
            count: more,
            defaultValue: more === 1 ? '{{count}} more food on the ladder' : '{{count}} more foods on the ladder',
          })}
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>
    </section>
  );
}

export function FamilyLadderSummary({ kids }: { kids: readonly Kid[] }) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const [today] = useState(localIsoDate);
  const [reports, setReports] = useState<Record<string, KidReport>>({});

  const onReport = useCallback((kidId: string, report: KidReport) => {
    setReports((current) => {
      const prev = current[kidId];
      if (prev && prev.settled === report.settled && prev.rows === report.rows) return current;
      return { ...current, [kidId]: report };
    });
  }, []);

  const allSettled = kids.every((k) => reports[k.id]?.settled);
  const anyRows = kids.some((k) => (reports[k.id]?.rows ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {kids.map((kid) => (
          <KidLadderBlock key={kid.id} kid={kid} foods={foods} today={today} onReport={onReport} />
        ))}
      </div>
      {allSettled && !anyRows ? (
        <KidPickerGrid
          kids={kids}
          body={t('foodTracker.gate.noLadderYet', {
            defaultValue: 'No foods are on a ladder yet. Pick a child to start one.',
          })}
        />
      ) : null}
    </div>
  );
}
