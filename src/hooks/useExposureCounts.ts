/**
 * Offers per food for one child, over everything ever logged.
 *
 * Feeds the "6 of about 10 offers" line on the ladder. The count is every
 * food_attempts row, refusals included: an offer that came back untouched is
 * still an exposure, and saying so is what keeps a parent offering.
 *
 * Failure is quiet, like useKidsProgressSummary: the rows render without the
 * count rather than the page failing over a number.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { exposureCounts } from '@/lib/familyRhythm';
import type { KidAttemptRow } from '@/lib/kidProgress';

const EMPTY: ReadonlyMap<string, number> = new Map();

/**
 * foodId -> offers for `kidId`. `refreshKey` refetches; pass something that
 * changes when an attempt is logged.
 */
export function useExposureCounts(kidId: string | null, refreshKey?: string | number): ReadonlyMap<string, number> {
  const { userId } = useAuth();
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(EMPTY);

  useEffect(() => {
    if (!userId || !kidId) {
      setCounts(EMPTY);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchAllRows((from, to) =>
          supabase
            .from('food_attempts')
            .select('kid_id, food_id, attempted_at')
            .eq('kid_id', kidId)
            .order('attempted_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        );
        if (cancelled) return;
        if (res.error) {
          logger.warn('Exposure counts: read failed', res.error);
          setCounts(EMPTY);
          return;
        }
        const byKey = exposureCounts((res.data ?? []) as KidAttemptRow[]);
        const byFood = new Map<string, number>();
        for (const [key, n] of byKey) byFood.set(key.slice(key.indexOf('|') + 1), n);
        setCounts(byFood);
      } catch (error) {
        if (!cancelled) {
          logger.warn('Exposure counts: read failed', error);
          setCounts(EMPTY);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, kidId, refreshKey]);

  return counts;
}
