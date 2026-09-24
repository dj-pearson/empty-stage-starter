/**
 * One child's earned badges, read from kid_badges (US-871).
 *
 * iOS evaluates the criteria and writes the earn; the web only reads. The rows
 * are the whole truth about what a child has earned on the web: nothing here
 * derives a badge from plan entries, so a web tile can never disagree with the
 * phone about whether a badge was earned, or when.
 *
 * Refetches on window focus, so a badge earned on the phone while this tab sat
 * in the background shows up when the parent comes back to it. The previous
 * rows stay in place while a new child's rows load (the view marks them busy)
 * rather than flashing an empty grid. Ids this build's catalog does not know,
 * from a newer iOS release, are dropped here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import { isKnownBadgeId } from '@/lib/badgeCatalog';

type KidBadgeRow = Database['public']['Tables']['kid_badges']['Row'];
export type KidBadgeEarn = Pick<KidBadgeRow, 'badge_id' | 'earned_at'>;

export interface KidBadgesState {
  rows: KidBadgeEarn[];
  /** The child `rows` belong to; differs from the requested kid while a switch loads. */
  rowsKidId: string | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

export function useKidBadges(kidId: string | null | undefined): KidBadgesState {
  const [rows, setRows] = useState<KidBadgeEarn[]>([]);
  const [rowsKidId, setRowsKidId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(kidId));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!kidId) {
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const { data, error: readError } = await supabase
          .from('kid_badges')
          .select('badge_id, earned_at')
          .eq('kid_id', kidId)
          .order('earned_at', { ascending: false });
        if (cancelled || request !== requestRef.current) return;
        if (readError) throw readError;
        const known = ((data ?? []) as KidBadgeEarn[]).filter((row) => isKnownBadgeId(row.badge_id));
        setRows(known);
        setRowsKidId(kidId);
      } catch (err) {
        if (cancelled || request !== requestRef.current) return;
        logger.error('useKidBadges: kid_badges read failed', err);
        setError(true);
      } finally {
        if (!cancelled && request === requestRef.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kidId, attempt]);

  useEffect(() => {
    if (!kidId) return;
    const onFocus = () => setAttempt((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [kidId]);

  return { rows, rowsKidId, loading, error, retry };
}
