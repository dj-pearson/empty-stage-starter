/**
 * The food journal's server-side notes: plan_entry_feedback rows (the iOS
 * "How was it?" sheet) and the food_attempts rows linked from plan entries.
 *
 * Two bugs this replaces. The old query bounded feedback with
 * .gte('created_at', 'YYYY-MM-DD'), which Postgres reads as UTC midnight, and
 * which is the wrong column anyway: a note written on Tuesday about Monday's
 * dinner belongs to Monday. It now filters on the plan entry's own date through
 * an inner join, with the page's local from/to strings. And it read one
 * request, so PostgREST's 1000-row ceiling cut a busy household's notes off
 * without a word; it now pages with fetchAllRows over a total order.
 *
 * Offline it does not ask at all and says 'offline', so the page can show that
 * instead of an error. It keeps the last good data while it reloads, and reloads
 * when the connection comes back and when the tab becomes visible again.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import '@/i18n/appLocale';
import { supabase } from '@/integrations/supabase/client';
import { useOnline } from '@/hooks/useCommon';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { logger } from '@/lib/logger';
import type { JournalAttempt, JournalFeedback } from '@/lib/foodJournal';

export type JournalFeedbackStatus = 'loading' | 'ready' | 'error' | 'offline';

export interface UseJournalFeedbackOptions {
  /** Inclusive local 'YYYY-MM-DD' bounds on the plan entry's date. */
  from: string;
  to: string;
  /** Narrow to one child; null or undefined reads every child. */
  kidId?: string | null;
  /** food_attempts ids linked from the plan entries in range. */
  attemptIds?: ReadonlyArray<string>;
  /** Bump to force a refetch (after an edit, say). */
  refreshKey?: unknown;
}

export interface UseJournalFeedbackResult {
  feedback: JournalFeedback[];
  attempts: JournalAttempt[];
  status: JournalFeedbackStatus;
  reload: () => void;
}

export const FEEDBACK_TOAST_ID = 'food-journal-feedback';
export const ATTEMPT_CHUNK_SIZE = 100;

const FEEDBACK_SELECT = 'id, plan_entry_id, user_id, rating, note, created_at, plan_entries!inner(date, kid_id)';
const ATTEMPT_SELECT = 'id, plan_entry_id, reaction_notes, parent_notes, attempted_at';

interface FeedbackRow extends JournalFeedback {
  plan_entries?: unknown;
}

function chunk<T>(items: ReadonlyArray<T>, size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Drop the join payload so callers get exactly the JournalFeedback shape. */
function toFeedback(row: FeedbackRow): JournalFeedback {
  return {
    id: row.id,
    plan_entry_id: row.plan_entry_id,
    user_id: row.user_id,
    rating: row.rating,
    note: row.note,
    created_at: row.created_at,
  };
}

export function useJournalFeedback({
  from,
  to,
  kidId,
  attemptIds,
  refreshKey,
}: UseJournalFeedbackOptions): UseJournalFeedbackResult {
  const { t } = useTranslation();
  const online = useOnline();
  const [feedback, setFeedback] = useState<JournalFeedback[]>([]);
  const [attempts, setAttempts] = useState<JournalAttempt[]>([]);
  const [status, setStatus] = useState<JournalFeedbackStatus>(online ? 'loading' : 'offline');
  const [nonce, setNonce] = useState(0);
  const requestRef = useRef(0);

  // A fresh array with the same ids must not refetch.
  const attemptKey = useMemo(() => [...new Set(attemptIds ?? [])].sort().join(','), [attemptIds]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Coming back to the tab is when a caregiver's phone note is most likely new.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [reload]);

  useEffect(() => {
    const request = ++requestRef.current;
    if (!online) {
      setStatus('offline');
      return;
    }
    // Stale-while-revalidate: the previous rows stay on screen.
    setStatus('loading');

    const ids = attemptKey ? attemptKey.split(',') : [];

    (async () => {
      try {
        const feedbackRead = fetchAllRows<FeedbackRow>((start, end) => {
          let query = supabase
            .from('plan_entry_feedback')
            .select(FEEDBACK_SELECT)
            .not('note', 'is', null)
            .gte('plan_entries.date', from)
            .lte('plan_entries.date', to);
          if (kidId) query = query.eq('plan_entries.kid_id', kidId);
          return query
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(start, end);
        });
        const attemptReads = chunk(ids, ATTEMPT_CHUNK_SIZE).map((part) =>
          supabase.from('food_attempts').select(ATTEMPT_SELECT).in('id', part)
        );
        const [feedbackRes, ...attemptRes] = await Promise.all([feedbackRead, ...attemptReads]);
        if (request !== requestRef.current) return;

        const attemptError = attemptRes.find((r) => r.error)?.error;
        const error = feedbackRes.error ?? attemptError;
        if (error) throw error;

        setFeedback((feedbackRes.data ?? []).map(toFeedback));
        setAttempts(attemptRes.flatMap((r) => (r.data ?? []) as JournalAttempt[]));
        setStatus('ready');
      } catch (error) {
        if (request !== requestRef.current) return;
        logger.warn('Food journal: feedback load failed', error);
        setStatus('error');
        // One id, so a retry that fails again replaces the toast instead of
        // stacking a second one.
        toast.error(t('foodJournal.feedbackLoadFailed'), {
          id: FEEDBACK_TOAST_ID,
          action: { label: t('foodJournal.history.retry', { defaultValue: 'Retry' }), onClick: reload },
        });
      }
    })();
  }, [online, from, to, kidId, attemptKey, refreshKey, nonce, t, reload]);

  // Nothing late may land after unmount.
  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    []
  );

  return { feedback, attempts, status, reload };
}
