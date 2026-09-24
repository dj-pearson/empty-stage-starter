/**
 * Ladder rows and recent food attempts for every child on the Kids page, in
 * two queries for the whole household rather than one useFoodLadder per card.
 *
 * Failure is quiet on purpose: the cards fall back to plan-entry counts, which
 * are already in context, so a failed read costs detail rather than the page.
 * The exact window (seven days unless the caller asks for more) is applied by the pure summarizer; the query only
 * narrows it (with a day of slack so no time zone can cut a local day short).
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { addIsoDays, toISODate } from '@/lib/date-utils';
import { PROGRESS_WINDOW_DAYS, windowStartIso, type KidAttemptRow, type KidLadderRow } from '@/lib/kidProgress';

export interface KidsProgressData {
  ladderRows: KidLadderRow[];
  attempts: KidAttemptRow[];
  loading: boolean;
}

const EMPTY: KidsProgressData = { ladderRows: [], attempts: [], loading: false };

/** Local midnight of `isoDay`, as an instant for a timestamptz filter. */
export function localMidnightInstant(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toISOString();
}

export interface KidsProgressOptions {
  /** Days in the window, today included. Defaults to PROGRESS_WINDOW_DAYS. */
  windowDays?: number;
}

export function useKidsProgressSummary(
  kidIds: readonly string[],
  opts: KidsProgressOptions = {},
): KidsProgressData {
  const windowDays = opts.windowDays ?? PROGRESS_WINDOW_DAYS;
  const { userId } = useAuth();
  // A stable key: the page re-renders on every context change, and a fresh
  // array of the same ids must not refetch.
  const idsKey = useMemo(() => [...new Set(kidIds)].sort().join(','), [kidIds]);
  const [data, setData] = useState<KidsProgressData>(EMPTY);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (!userId || ids.length === 0) {
      setData(EMPTY);
      return;
    }

    let cancelled = false;
    setData((prev) => ({ ...prev, loading: true }));

    // One day before the window's first day: slack for any time zone.
    const windowStart = addIsoDays(windowStartIso(toISODate(new Date()), windowDays), -1);

    (async () => {
      try {
        const [ladderRes, attemptsRes] = await Promise.all([
          supabase
            .from('kid_food_ladder')
            .select('kid_id, food_id, status, current_rung, last_attempt_at')
            .in('kid_id', ids),
          supabase
            .from('food_attempts')
            .select('kid_id, food_id, attempted_at')
            .in('kid_id', ids)
            .gte('attempted_at', localMidnightInstant(windowStart)),
        ]);
        if (cancelled) return;
        if (ladderRes.error) logger.warn('Kids progress: ladder read failed', ladderRes.error);
        if (attemptsRes.error) logger.warn('Kids progress: attempts read failed', attemptsRes.error);
        setData({
          ladderRows: ladderRes.error ? [] : ((ladderRes.data ?? []) as KidLadderRow[]),
          attempts: attemptsRes.error ? [] : ((attemptsRes.data ?? []) as KidAttemptRow[]),
          loading: false,
        });
      } catch (error) {
        if (cancelled) return;
        logger.warn('Kids progress: read failed', error);
        setData(EMPTY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, idsKey, windowDays]);

  return data;
}
