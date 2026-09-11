import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * US-863: one query and one realtime channel for a week of meal votes, instead
 * of one of each per cell.
 *
 * VoteResultsDisplay renders once per meal cell and did its own fetch and its
 * own `supabase.channel(...)` subscription. Measured on the built app with a
 * week of meals on screen: 8 identical GET /rest/v1/meal_votes per planner
 * load. A full week at three slots a day is 21 cells, so 21 queries and 21
 * realtime channels -- each channel a separate join round trip, and each one
 * watching the same table.
 *
 * Worse than the count: a cell with no plan entry subscribed with NO FILTER, so
 * any vote anywhere in the household re-ran that cell's query.
 *
 * This module is the shared half. Cells register the key they care about, the
 * store issues one query for the union of those keys, and one channel watches
 * the table for all of them. The component keeps its props and its rendering.
 *
 * REF COUNTED, not a permanent singleton: the channel is opened by the first
 * subscriber and removed when the last one goes, so leaving the planner does
 * not leave a socket behind.
 */

export interface MealVoteRow {
  kid_id: string | null;
  vote: string;
  vote_emoji: string | null;
  voted_at: string | null;
  plan_entry_id: string | null;
  recipe_id: string | null;
  meal_date: string | null;
  meal_slot: string | null;
  kids?: { id: string; name: string } | null;
}

/** What a cell is asking about: a plan entry, or a recipe in a date+slot. */
export interface VoteKey {
  planEntryId?: string;
  recipeId?: string;
  mealDate?: string;
  mealSlot?: string;
}

/** Stable string for a key, so listeners can be grouped and rows matched. */
export function voteKeyId(key: VoteKey): string {
  if (key.planEntryId) return `entry:${key.planEntryId}`;
  return `recipe:${key.recipeId ?? ''}|${key.mealDate ?? ''}|${key.mealSlot ?? ''}`;
}

/** Does this row answer this key? The same test the per-cell query encoded. */
export function rowMatchesKey(row: MealVoteRow, key: VoteKey): boolean {
  if (key.planEntryId) return row.plan_entry_id === key.planEntryId;
  if (key.recipeId && key.mealDate && key.mealSlot) {
    return (
      row.recipe_id === key.recipeId &&
      row.meal_date === key.mealDate &&
      row.meal_slot === key.mealSlot
    );
  }
  // A key with neither shape matches nothing. The old code answered it with an
  // unfiltered query, which returned every vote in the household.
  return false;
}

export function groupRowsByKey(rows: MealVoteRow[], keys: VoteKey[]): Map<string, MealVoteRow[]> {
  const grouped = new Map<string, MealVoteRow[]>();
  for (const key of keys) grouped.set(voteKeyId(key), []);
  for (const row of rows) {
    for (const key of keys) {
      if (rowMatchesKey(row, key)) grouped.get(voteKeyId(key))!.push(row);
    }
  }
  return grouped;
}

export interface VoteResult {
  kidId: string;
  kidName: string;
  vote: 'love_it' | 'okay' | 'no_way';
  voteEmoji: string;
  votedAt: string;
}

export interface VoteSummary {
  totalVotes: number;
  loveItCount: number;
  okayCount: number;
  noWayCount: number;
  approvalScore: number;
  votes: VoteResult[];
}

/**
 * Rows for one cell into the numbers the card shows. Pure, so the arithmetic is
 * testable without a browser or a backend.
 */
export function summarizeVotes(rows: MealVoteRow[]): VoteSummary {
  const votes: VoteResult[] = rows.map((row) => ({
    kidId: row.kid_id ?? '',
    kidName: row.kids?.name ?? '',
    vote: row.vote as VoteResult['vote'],
    voteEmoji: row.vote_emoji ?? '',
    votedAt: row.voted_at ?? '',
  }));

  const loveItCount = votes.filter((v) => v.vote === 'love_it').length;
  const okayCount = votes.filter((v) => v.vote === 'okay').length;
  const noWayCount = votes.filter((v) => v.vote === 'no_way').length;
  const totalVotes = votes.length;

  return {
    totalVotes,
    loveItCount,
    okayCount,
    noWayCount,
    // love_it = 100, okay = 50, no_way = 0.
    approvalScore:
      totalVotes > 0 ? Math.round((loveItCount * 100 + okayCount * 50) / totalVotes) : 0,
    votes,
  };
}

type Listener = (rows: MealVoteRow[]) => void;

interface Registration {
  key: VoteKey;
  listener: Listener;
}

/** The Supabase surface this store needs, so a test can supply its own. */
export interface VotesBackend {
  fetch: (keys: VoteKey[]) => Promise<MealVoteRow[]>;
  watch: (onChange: () => void) => { stop: () => void };
}

const SELECT = 'kid_id, vote, vote_emoji, voted_at, plan_entry_id, recipe_id, meal_date, meal_slot, kids (id, name)';

/** The real backend: two queries at most, and one channel. */
export const supabaseVotesBackend: VotesBackend = {
  async fetch(keys) {
    const entryIds = [...new Set(keys.map((k) => k.planEntryId).filter((v): v is string => !!v))];
    const dates = [...new Set(
      keys.filter((k) => !k.planEntryId && k.recipeId && k.mealDate).map((k) => k.mealDate as string)
    )];

    const queries: Promise<{ data: unknown; error: unknown }>[] = [];
    if (entryIds.length > 0) {
      queries.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('meal_votes').select(SELECT).in('plan_entry_id', entryIds)
      );
    }
    if (dates.length > 0) {
      // Narrowed by date rather than by the full recipe+slot triple: the rows
      // are grouped client-side anyway, and one query per triple is the problem
      // this module exists to remove.
      queries.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('meal_votes').select(SELECT).in('meal_date', dates)
      );
    }
    if (queries.length === 0) return [];

    const results = await Promise.all(queries);
    const rows: MealVoteRow[] = [];
    for (const { data, error } of results) {
      if (error) throw error;
      if (Array.isArray(data)) rows.push(...(data as MealVoteRow[]));
    }
    return rows;
  },

  watch(onChange) {
    const channel = supabase
      .channel('meal-votes-shared')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_votes' }, () => onChange())
      .subscribe();
    return { stop: () => void supabase.removeChannel(channel) };
  },
};

/** Milliseconds to wait for the rest of the cells to mount before querying. */
export const COLLECT_MS = 50;

export function createVotesStore(backend: VotesBackend, delay = COLLECT_MS) {
  const registrations = new Set<Registration>();
  let watcher: { stop: () => void } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fetches = 0;

  const run = async () => {
    timer = null;
    const keys = [...registrations].map((r) => r.key);
    if (keys.length === 0) return;
    fetches += 1;
    try {
      const rows = await backend.fetch(keys);
      const grouped = groupRowsByKey(rows, keys);
      for (const registration of registrations) {
        registration.listener(grouped.get(voteKeyId(registration.key)) ?? []);
      }
    } catch (error) {
      logger.error('Error loading meal votes:', error);
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, delay);
  };

  return {
    subscribe(key: VoteKey, listener: Listener): () => void {
      const registration: Registration = { key, listener };
      registrations.add(registration);
      if (!watcher) watcher = backend.watch(schedule);
      schedule();

      return () => {
        registrations.delete(registration);
        if (registrations.size === 0) {
          if (timer) clearTimeout(timer);
          timer = null;
          watcher?.stop();
          watcher = null;
        }
      };
    },
    /** For the tests, and for anyone counting. */
    stats: () => ({ registrations: registrations.size, fetches, watching: watcher !== null }),
  };
}

export const mealVotesStore = createVotesStore(supabaseVotesBackend);
