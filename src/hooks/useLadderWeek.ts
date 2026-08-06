/**
 * Weekly ladder data layer (US-604).
 *
 * Loads the attempt history the weekly report needs and hands it to the pure
 * summarizer. History before the week is deliberately included: the week's
 * movement is measured against the rung the child was already on, so a query
 * scoped to the week alone would report every food as starting from scratch.
 *
 * Returns `null` for households with no ladder history, which is how the
 * report omits the section entirely rather than showing an empty card.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { LadderAttempt } from '@/lib/exposureLadder';
import { summarizeLadderWeek, type LadderWeekSummary } from '@/lib/ladderWeekly';

interface UseLadderWeekArgs {
  kidId: string | null | undefined;
  /** Inclusive ISO 'YYYY-MM-DD'. */
  weekStart: string;
  /** Inclusive ISO 'YYYY-MM-DD'. */
  weekEnd: string;
  /** foodId -> display name, so the summary can name what moved. */
  foodNames: Record<string, string>;
}

export interface UseLadderWeekResult {
  summary: LadderWeekSummary | null;
  loading: boolean;
}

export function useLadderWeek({
  kidId,
  weekStart,
  weekEnd,
  foodNames,
}: UseLadderWeekArgs): UseLadderWeekResult {
  const [attempts, setAttempts] = useState<LadderAttempt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!kidId) {
      setAttempts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('food_attempts')
          .select('kid_id, food_id, stage, outcome, attempted_at')
          .eq('kid_id', kidId)
          // Anything logged after the reported week must not move a past
          // report, so it is excluded at the query rather than in the fold.
          .lte('attempted_at', `${weekEnd}T23:59:59.999Z`);

        if (error) throw error;
        if (cancelled) return;

        setAttempts(
          (data ?? []).map((row) => ({
            kidId: row.kid_id,
            foodId: row.food_id,
            stage: row.stage,
            outcome: row.outcome,
            attemptedAt: row.attempted_at,
          }))
        );
      } catch (err) {
        if (!cancelled) {
          // The ladder section is additive to the report: on failure it is
          // omitted, and the rest of the week still renders.
          logger.error('Weekly ladder load failed:', err);
          setAttempts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kidId, weekEnd]);

  const summary = useMemo(() => {
    if (!kidId || attempts.length === 0) return null;
    return summarizeLadderWeek({ attempts, weekStart, weekEnd, kidId, foodNames });
  }, [attempts, kidId, weekStart, weekEnd, foodNames]);

  return { summary, loading };
}
