/**
 * The anchors a Food Chaining screen can start a chain from, for one child
 * (contract 3). The anchor list itself is the pure buildChainAnchors; this
 * hook only gathers its inputs.
 *
 * The one read of its own is the child's food_attempts (food_id and outcome,
 * every outcome: a refusal is what keeps a food out of "reliable"). Foods,
 * kids and plan come from context, so an edit to the kid's profile recomputes
 * the anchors without a refetch. The ladder rows are passed in by the caller,
 * which already owns the one useFoodLadder instance for the page.
 *
 * Never toasts; the page renders status inline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useFoods, useKids, usePlan } from '@/contexts/AppContext';
import { useOnline } from '@/hooks/useCommon';
import { localIsoDate } from '@/components/foodTracker/ladderDates';
import { buildChainAnchors, type ChainAnchor } from '@/lib/chainAnchors';
import type { LadderRow } from '@/hooks/useFoodLadder';
import type { Food, Kid } from '@/types';

export type ChainAnchorsStatus = 'loading' | 'ready' | 'error' | 'offline';

export interface ChainAnchorsState {
  status: ChainAnchorsStatus;
  anchors: ChainAnchor[];
  retry: () => void;
}

type AttemptSelectRow = Pick<Database['public']['Tables']['food_attempts']['Row'], 'food_id' | 'outcome'>;
type AttemptLite = { food_id: string; outcome: string };

interface AttemptsFetch {
  kidId: string;
  state: 'pending' | 'ok' | 'failed';
}

interface GoodAttempts {
  kidId: string;
  rows: readonly AttemptLite[];
}

const NO_ATTEMPTS: readonly AttemptLite[] = [];

export function useChainAnchors(
  kid: Kid,
  ladderRows: readonly LadderRow[],
  ladderLoading: boolean,
): ChainAnchorsState {
  const { foods, foodsHydrated } = useFoods();
  const { kidsHydrated } = useKids();
  const { planEntries } = usePlan();
  const online = useOnline();

  const kidId = kid.id;
  const [nonce, setNonce] = useState(0);
  const [fetchState, setFetchState] = useState<AttemptsFetch>({ kidId, state: 'pending' });
  // The last successful read. Kept through a later failure for the same kid,
  // so a flaky retry does not blank the reliable tier.
  const [good, setGood] = useState<GoodAttempts | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFetchState({ kidId, state: 'pending' });
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('food_attempts')
          .select('food_id, outcome')
          .eq('kid_id', kidId);
        if (cancelled) return;
        if (error) throw error;
        const rows: AttemptLite[] = [];
        for (const row of (data ?? []) as AttemptSelectRow[]) {
          if (row.food_id && typeof row.outcome === 'string') rows.push({ food_id: row.food_id, outcome: row.outcome });
        }
        setGood({ kidId, rows });
        setFetchState({ kidId, state: 'ok' });
      } catch {
        if (cancelled) return;
        setFetchState({ kidId, state: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kidId, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  // useFoodLadder starts with loading=false and flips it on in its own effect,
  // so an empty ladder only counts as settled once a load for this child has
  // been seen to start (same pattern as useMealBuilderData).
  const seenLadderLoadingFor = useRef<string | null>(null);
  if (ladderLoading) seenLadderLoadingFor.current = kidId;
  const ladderSettled = !ladderLoading && (ladderRows.length > 0 || seenLadderLoadingFor.current === kidId);

  const foodsById = useMemo(() => {
    const map = new Map<string, Food>();
    for (const f of foods) if (f?.id) map.set(f.id, f);
    return map;
  }, [foods]);

  const attempts = good && good.kidId === kidId ? good.rows : NO_ATTEMPTS;
  const todayIso = localIsoDate(new Date());

  const anchors = useMemo(
    () => buildChainAnchors({ kid, foodsById, ladderRows, attempts, planEntries, todayIso }),
    [kid, foodsById, ladderRows, attempts, planEntries, todayIso],
  );

  // A fetch state left over from the previous kid reads as pending until the
  // effect for this kid has run.
  const attemptsState = fetchState.kidId === kidId ? fetchState.state : 'pending';

  let status: ChainAnchorsStatus;
  if (!foodsHydrated || !kidsHydrated) status = 'loading';
  else if (attemptsState === 'failed' && !online) status = 'offline';
  else if (!ladderSettled || attemptsState === 'pending') status = 'loading';
  else if (attemptsState === 'failed') status = 'error';
  else status = 'ready';

  return { status, anchors, retry };
}
