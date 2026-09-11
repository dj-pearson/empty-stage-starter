import { describe, it, expect, vi } from 'vitest';

import {
  createVotesStore,
  groupRowsByKey,
  rowMatchesKey,
  summarizeVotes,
  voteKeyId,
  type MealVoteRow,
  type VoteKey,
  type VotesBackend,
} from './mealVotesStore';

/**
 * US-863. The behaviour worth pinning is the sharing: many cells mount at once
 * and must produce one fetch and one watcher between them, and the last one to
 * unmount must take the watcher with it.
 */
const row = (over: Partial<MealVoteRow>): MealVoteRow => ({
  kid_id: 'k1',
  vote: 'love_it',
  vote_emoji: 'A',
  voted_at: '2026-09-10T00:00:00.000Z',
  plan_entry_id: null,
  recipe_id: null,
  meal_date: null,
  meal_slot: null,
  kids: { id: 'k1', name: 'Ada' },
  ...over,
});

function fakeBackend() {
  const calls: VoteKey[][] = [];
  let rows: MealVoteRow[] = [];
  let onChange: (() => void) | null = null;
  let stops = 0;
  const backend: VotesBackend = {
    fetch: async (keys) => {
      calls.push(keys);
      return rows;
    },
    watch: (cb) => {
      onChange = cb;
      return { stop: () => { stops += 1; onChange = null; } };
    },
  };
  return {
    backend,
    calls,
    setRows: (r: MealVoteRow[]) => { rows = r; },
    fire: () => onChange?.(),
    watching: () => onChange !== null,
    stops: () => stops,
  };
}

describe('matching a row to a cell', () => {
  it('matches on plan entry', () => {
    expect(rowMatchesKey(row({ plan_entry_id: 'e1' }), { planEntryId: 'e1' })).toBe(true);
    expect(rowMatchesKey(row({ plan_entry_id: 'e2' }), { planEntryId: 'e1' })).toBe(false);
  });

  it('matches a recipe only on the full triple', () => {
    const r = row({ recipe_id: 'r1', meal_date: '2026-09-11', meal_slot: 'lunch' });
    expect(rowMatchesKey(r, { recipeId: 'r1', mealDate: '2026-09-11', mealSlot: 'lunch' })).toBe(true);
    expect(rowMatchesKey(r, { recipeId: 'r1', mealDate: '2026-09-12', mealSlot: 'lunch' })).toBe(false);
  });

  it('matches nothing for a key with neither shape', () => {
    // The old per-cell code answered this case with an UNFILTERED query, so a
    // cell with no entry and no recipe showed every vote in the household and
    // re-ran on any of them.
    expect(rowMatchesKey(row({ plan_entry_id: 'e1' }), {})).toBe(false);
  });

  it('gives every key its own bucket, empty if nothing matched', () => {
    const keys: VoteKey[] = [{ planEntryId: 'e1' }, { planEntryId: 'e2' }];
    const grouped = groupRowsByKey([row({ plan_entry_id: 'e1' })], keys);
    expect(grouped.get(voteKeyId(keys[0]))).toHaveLength(1);
    expect(grouped.get(voteKeyId(keys[1]))).toEqual([]);
  });
});

describe('summarizeVotes', () => {
  it('scores love_it 100, okay 50, no_way 0', () => {
    const rows = [
      row({ vote: 'love_it' }),
      row({ vote: 'okay' }),
      row({ vote: 'no_way' }),
    ];
    const summary = summarizeVotes(rows);
    expect(summary.totalVotes).toBe(3);
    expect(summary.loveItCount).toBe(1);
    expect(summary.approvalScore).toBe(50); // (100 + 50 + 0) / 3
  });

  it('scores an empty cell 0 rather than dividing by zero', () => {
    expect(summarizeVotes([]).approvalScore).toBe(0);
  });

  it('survives a row whose kid join came back empty', () => {
    expect(summarizeVotes([row({ kids: null, kid_id: null })]).votes[0].kidName).toBe('');
  });
});

describe('the shared store', () => {
  it('answers eight cells with one fetch and one watcher', async () => {
    const f = fakeBackend();
    const store = createVotesStore(f.backend, 0);
    const seen: number[] = [];

    for (let i = 0; i < 8; i += 1) {
      store.subscribe({ planEntryId: `e${i}` }, (rows) => seen.push(rows.length));
    }
    f.setRows([row({ plan_entry_id: 'e3' })]);
    await vi.waitFor(() => expect(seen.length).toBe(8));

    // The number this story exists for.
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toHaveLength(8);
    expect(store.stats().watching).toBe(true);
  });

  it('gives each cell only its own rows', async () => {
    const f = fakeBackend();
    const store = createVotesStore(f.backend, 0);
    const byCell = new Map<string, number>();

    store.subscribe({ planEntryId: 'e1' }, (rows) => byCell.set('e1', rows.length));
    store.subscribe({ planEntryId: 'e2' }, (rows) => byCell.set('e2', rows.length));
    f.setRows([row({ plan_entry_id: 'e1' }), row({ plan_entry_id: 'e1' })]);

    await vi.waitFor(() => expect(byCell.size).toBe(2));
    expect(byCell.get('e1')).toBe(2);
    expect(byCell.get('e2')).toBe(0);
  });

  it('stops watching when the last cell unmounts, and starts again after', async () => {
    const f = fakeBackend();
    const store = createVotesStore(f.backend, 0);

    const offA = store.subscribe({ planEntryId: 'e1' }, () => {});
    const offB = store.subscribe({ planEntryId: 'e2' }, () => {});
    await vi.waitFor(() => expect(f.calls.length).toBe(1));

    offA();
    // One cell left: the channel stays, or live updates stop working for it.
    expect(f.watching()).toBe(true);

    offB();
    expect(f.watching()).toBe(false);
    expect(f.stops()).toBe(1);

    store.subscribe({ planEntryId: 'e3' }, () => {});
    expect(f.watching()).toBe(true);
  });

  it('refetches once when the table changes, not once per cell', async () => {
    const f = fakeBackend();
    const store = createVotesStore(f.backend, 0);
    for (let i = 0; i < 5; i += 1) store.subscribe({ planEntryId: `e${i}` }, () => {});
    await vi.waitFor(() => expect(f.calls.length).toBe(1));

    f.fire();
    await vi.waitFor(() => expect(f.calls.length).toBe(2));
    expect(f.calls).toHaveLength(2);
  });

  it('does not fetch for a cell that has already unmounted', async () => {
    const f = fakeBackend();
    const store = createVotesStore(f.backend, 5);
    const off = store.subscribe({ planEntryId: 'e1' }, () => {});
    off();
    await new Promise((r) => setTimeout(r, 20));
    // The collect window is what makes this possible: a cell that mounts and
    // unmounts inside it should cost nothing.
    expect(f.calls).toHaveLength(0);
  });
});
