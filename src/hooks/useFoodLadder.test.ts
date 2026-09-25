/**
 * US-600: one-tap rung logging, and the single write path the Food Tracker
 * logs through.
 *
 * Two things are pinned here. First the write contract: what a single tap at
 * the dinner table turns into (an attempt at the rung the child was *asked
 * for*, a plan-entry result, the new ladder state). Second the write path's
 * failure behaviour, against a small in-memory stand-in for the three tables
 * it touches, which enforces the same unique keys and per-day exposure cap as
 * the real schema: a replayed attempt is one row, a fourth due food slides a
 * day instead of failing, a ladder write that fails keeps the attempt, and a
 * second tap while the first is saving writes nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory Supabase stand-in
// ---------------------------------------------------------------------------

type DbRow = Record<string, unknown>;
interface DbError {
  code?: string;
  message: string;
}
interface Filter {
  col: string;
  val: unknown;
  /** Absent means equality (or IS NULL for a null val). */
  op?: 'gt' | 'notnull';
}
interface Query {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: DbRow;
  filters: Filter[];
  returning: boolean;
  mode: 'many' | 'single' | 'maybeSingle';
}

const db = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  /** Errors to return for the next matching query, consumed in order. */
  failures: [] as Array<{ table: string; op: string; error: { code?: string; message: string } }>,
  /** Optional per-query hook, called before execution; may mutate state. */
  before: null as null | ((q: { table: string; op: string }) => void),
  log: [] as Array<{ table: string; op: string; payload?: Record<string, unknown> }>,
  seq: 0,
}));

function table(name: string): Map<string, DbRow> {
  let t = db.tables.get(name);
  if (!t) {
    t = new Map();
    db.tables.set(name, t);
  }
  return t;
}

function matches(row: DbRow, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.op === 'notnull') return row[f.col] != null;
    if (f.op === 'gt') return typeof row[f.col] === 'string' && Date.parse(row[f.col] as string) > Date.parse(String(f.val));
    return f.val === null ? row[f.col] == null : row[f.col] === f.val;
  });
}

function capViolation(candidate: DbRow): DbError | null {
  if (candidate.status !== 'active' || !candidate.next_due_on) return null;
  const sameDay = [...table('kid_food_ladder').values()].filter(
    (r) =>
      r.id !== candidate.id &&
      r.kid_id === candidate.kid_id &&
      r.status === 'active' &&
      r.next_due_on === candidate.next_due_on
  );
  return sameDay.length >= 3
    ? { code: '23514', message: 'ladder_exposure_cap: kid already has 3 exposures due' }
    : null;
}

function execute(q: Query): { data: unknown; error: DbError | null } {
  db.before?.({ table: q.table, op: q.op });
  db.log.push({ table: q.table, op: q.op, payload: q.payload });
  const failAt = db.failures.findIndex((f) => f.table === q.table && f.op === q.op);
  if (failAt !== -1) {
    const [failure] = db.failures.splice(failAt, 1);
    return { data: null, error: failure.error };
  }

  const t = table(q.table);
  let result: DbRow[] = [];

  if (q.op === 'select') {
    result = [...t.values()].filter((r) => matches(r, q.filters));
  } else if (q.op === 'insert') {
    const row: DbRow = { ...q.payload };
    if (!row.id) row.id = `gen-${++db.seq}`;
    const dupe =
      t.has(row.id as string) ||
      (q.table === 'kid_food_ladder' &&
        [...t.values()].some((r) => r.kid_id === row.kid_id && r.food_id === row.food_id));
    if (dupe) return { data: null, error: { code: '23505', message: 'duplicate key' } };
    if (q.table === 'kid_food_ladder') {
      const cap = capViolation(row);
      if (cap) return { data: null, error: cap };
    }
    t.set(row.id as string, row);
    result = [row];
  } else if (q.op === 'update') {
    const targets = [...t.values()].filter((r) => matches(r, q.filters));
    for (const r of targets) {
      const next = { ...r, ...q.payload };
      if (q.table === 'kid_food_ladder') {
        const cap = capViolation(next);
        if (cap) return { data: null, error: cap };
      }
      t.set(r.id as string, next);
    }
    result = targets.map((r) => t.get(r.id as string) as DbRow);
  } else {
    result = [...t.values()].filter((r) => matches(r, q.filters));
    result.forEach((r) => t.delete(r.id as string));
  }

  if (q.mode !== 'many') {
    if (result.length === 0) {
      return q.mode === 'single'
        ? { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        : { data: null, error: null };
    }
    return { data: { ...result[0] }, error: null };
  }
  if ((q.op === 'insert' || q.op === 'update' || q.op === 'delete') && !q.returning) {
    return { data: null, error: null };
  }
  return { data: result.map((r) => ({ ...r })), error: null };
}

function builder(tableName: string) {
  const q: Query = { table: tableName, op: 'select', filters: [], returning: false, mode: 'many' };
  const chain = {
    select() {
      if (q.op === 'select') return chain;
      q.returning = true;
      return chain;
    },
    insert(payload: DbRow) {
      q.op = 'insert';
      q.payload = payload;
      return chain;
    },
    update(payload: DbRow) {
      q.op = 'update';
      q.payload = payload;
      return chain;
    },
    delete() {
      q.op = 'delete';
      return chain;
    },
    eq(col: string, val: unknown) {
      q.filters.push({ col, val });
      return chain;
    },
    is(col: string, val: unknown) {
      q.filters.push({ col, val });
      return chain;
    },
    in() {
      return chain;
    },
    // The load-time meal-result fold (item 41) reads plan-linked attempts
    // newer than a row's last fold; see useFoodLadder.planResult.test.ts.
    gt(col: string, val: unknown) {
      q.filters.push({ col, val, op: 'gt' });
      return chain;
    },
    not(col: string, _operator: string, _val: unknown) {
      q.filters.push({ col, val: null, op: 'notnull' });
      return chain;
    },
    order() {
      return chain;
    },
    single() {
      q.mode = 'single';
      return chain;
    },
    maybeSingle() {
      q.mode = 'maybeSingle';
      return chain;
    },
    then<T>(resolve: (value: { data: unknown; error: DbError | null }) => T) {
      return Promise.resolve(execute(q)).then(resolve);
    },
  };
  return chain;
}

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (name: string) => builder(name),
    rpc,
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const checkFeatureLimit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/featureLimits', () => ({ checkFeatureLimit }));

const requestUpgradePrompt = vi.hoisted(() => vi.fn());
vi.mock('@/lib/upgradePromptBus', () => ({ requestUpgradePrompt }));

const recordContributionsFromAttempt = vi.hoisted(() => vi.fn());
vi.mock('@/lib/chainNetwork', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chainNetwork')>()),
  recordContributionsFromAttempt,
  contributeChainNetworkSuccess: vi.fn().mockResolvedValue(true),
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { useFoodAttemptHistory } from './useFoodAttemptHistory';
import {
  buildQuickLogWrites,
  normalizeLadderRow,
  todayIsoDate,
  useFoodLadder,
  type LadderRow,
  type LogResult,
} from './useFoodLadder';
import { addDays } from '@/lib/exposureLadder';

const NOW = '2026-08-01T18:30:00.000Z';
const TODAY = '2026-08-01';

const row: LadderRow = {
  id: 'ladder-1',
  kidId: 'kid-1',
  foodId: 'food-1',
  currentRung: 'licking',
  consecutiveSuccesses: 0,
  consecutiveHolds: 0,
  consecutiveRefusals: 0,
  status: 'active',
  nextDueOn: TODAY,
  lastAttemptAt: null,
  pairedSafeFoodId: 'safe-1',
  preferredPrep: 'steamed',
  preferredMealSlot: 'dinner',
  pausedReason: null,
};

describe('buildQuickLogWrites', () => {
  it('maps each tap to the right attempt outcome and plan result', () => {
    expect(buildQuickLogWrites({ row, result: 'accepted', now: NOW, today: TODAY })).toMatchObject({
      attemptRow: { outcome: 'success' },
      planPatch: { result: 'ate' },
    });
    expect(buildQuickLogWrites({ row, result: 'held', now: NOW, today: TODAY })).toMatchObject({
      attemptRow: { outcome: 'partial' },
      planPatch: { result: 'tasted' },
    });
    expect(buildQuickLogWrites({ row, result: 'refused', now: NOW, today: TODAY })).toMatchObject({
      attemptRow: { outcome: 'refused' },
      planPatch: { result: 'refused' },
    });
  });

  it('records the attempt at the rung the child was asked for, not the new one', () => {
    const writes = buildQuickLogWrites({ row, result: 'refused', now: NOW, today: TODAY });

    // Asked for a lick, refused, so the ladder drops to smelling — but the
    // attempt is still the record of a licking exposure having been offered.
    expect(writes.attemptRow.stage).toBe('licking');
    expect(writes.nextState.currentRung).toBe('smelling');
  });

  it('carries the learned prep and slot onto the attempt', () => {
    const writes = buildQuickLogWrites({ row, result: 'accepted', now: NOW, today: TODAY });
    expect(writes.attemptRow.preparation_method).toBe('steamed');
    expect(writes.attemptRow.meal_slot).toBe('dinner');
  });

  it('prefers an explicitly supplied meal slot over the learned one', () => {
    const writes = buildQuickLogWrites({
      row,
      result: 'accepted',
      now: NOW,
      today: TODAY,
      mealSlot: 'lunch',
    });
    expect(writes.attemptRow.meal_slot).toBe('lunch');
  });

  it('produces a ladder update that matches the derived next state', () => {
    const writes = buildQuickLogWrites({ row, result: 'accepted', now: NOW, today: TODAY });
    expect(writes.ladderUpdate).toMatchObject({
      current_rung: writes.nextState.currentRung,
      consecutive_successes: writes.nextState.consecutiveSuccesses,
      status: writes.nextState.status,
      next_due_on: writes.nextState.nextDueOn,
    });
  });
});

describe('normalizeLadderRow', () => {
  it('maps snake_case columns to the camelCase UI shape', () => {
    const normalized = normalizeLadderRow({
      id: 'l1',
      kid_id: 'k1',
      food_id: 'f1',
      current_rung: 'small_bite',
      consecutive_successes: 1,
      consecutive_holds: 2,
      consecutive_refusals: 0,
      status: 'active',
      next_due_on: '2026-08-03',
      last_attempt_at: NOW,
      paired_safe_food_id: 's1',
      preferred_prep: 'raw',
      preferred_meal_slot: 'lunch',
      paused_reason: null,
    });

    expect(normalized).toMatchObject({
      kidId: 'k1',
      foodId: 'f1',
      currentRung: 'small_bite',
      consecutiveHolds: 2,
      pairedSafeFoodId: 's1',
      preferredMealSlot: 'lunch',
    });
  });

  it('falls back to the first rung for a stage label it does not recognize', () => {
    const normalized = normalizeLadderRow({
      id: 'l1',
      kid_id: 'k1',
      food_id: 'f1',
      current_rung: 'gnawed_thoughtfully',
      consecutive_successes: 0,
      consecutive_holds: 0,
      consecutive_refusals: 0,
      status: 'active',
      next_due_on: null,
      last_attempt_at: null,
      paired_safe_food_id: null,
      preferred_prep: null,
      preferred_meal_slot: null,
      paused_reason: null,
    });
    expect(normalized.currentRung).toBe('looking');
  });
});

describe('buildQuickLogWrites: ids, details and plan links', () => {
  it('uses a supplied attempt id, and generates one otherwise', () => {
    const given = buildQuickLogWrites({
      row,
      result: 'accepted',
      now: NOW,
      today: TODAY,
      attemptId: 'attempt-fixed',
    });
    expect(given.attemptRow.id).toBe('attempt-fixed');

    const a = buildQuickLogWrites({ row, result: 'accepted', now: NOW, today: TODAY });
    const b = buildQuickLogWrites({ row, result: 'accepted', now: NOW, today: TODAY });
    expect(a.attemptRow.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.attemptRow.id).not.toBe(b.attemptRow.id);
  });

  it('writes unset details as null, never a happy or full-bite default', () => {
    const { attemptRow } = buildQuickLogWrites({ row, result: 'held', now: NOW, today: TODAY });
    expect(attemptRow).toMatchObject({
      reaction_notes: null,
      parent_notes: null,
      mood_before: null,
      mood_after: null,
      bites_taken: null,
      amount_consumed: null,
      is_milestone: false,
    });
    expect(attemptRow).not.toHaveProperty('plan_entry_id');
  });

  it('merges supplied details as snake_case and trims notes', () => {
    const { attemptRow } = buildQuickLogWrites({
      row,
      result: 'held',
      now: NOW,
      today: TODAY,
      details: {
        reactionNotes: '  hives on chin  ',
        parentNotes: '   ',
        moodBefore: 'anxious',
        bitesTaken: 2,
        amountConsumed: 'quarter',
        isMilestone: true,
      },
    });
    expect(attemptRow).toMatchObject({
      reaction_notes: 'hives on chin',
      parent_notes: null,
      mood_before: 'anxious',
      mood_after: null,
      bites_taken: 2,
      amount_consumed: 'quarter',
      is_milestone: true,
    });
  });

  it('sets plan_entry_id when the log came from a plan entry', () => {
    const { attemptRow } = buildQuickLogWrites({
      row,
      result: 'accepted',
      now: NOW,
      today: TODAY,
      planEntryId: 'plan-9',
    });
    expect(attemptRow.plan_entry_id).toBe('plan-9');
  });

  it('records a hard time as a tantrum at the asked rung', () => {
    const writes = buildQuickLogWrites({
      row,
      result: 'refused',
      hardTime: true,
      now: NOW,
      today: TODAY,
    });
    expect(writes.attemptRow.outcome).toBe('tantrum');
    expect(writes.attemptRow.stage).toBe('licking');
    expect(writes.nextState.status).toBe('backed_off');
    expect(writes.planPatch).toEqual({ result: 'refused' });
  });

  it('slides the next due date past a full day when siblings are given', () => {
    const due = addDays(TODAY, 2);
    const siblings = ['a', 'b', 'c'].map((id) => ({
      id,
      kidId: 'kid-1',
      status: 'active' as const,
      nextDueOn: due,
    }));
    const writes = buildQuickLogWrites({
      row,
      result: 'accepted',
      now: NOW,
      today: TODAY,
      siblings,
    });
    expect(writes.nextState.nextDueOn).toBe(addDays(TODAY, 3));
    expect(writes.ladderUpdate.next_due_on).toBe(addDays(TODAY, 3));
  });
});

// ---------------------------------------------------------------------------
// The hook, against the in-memory tables
// ---------------------------------------------------------------------------

function dbLadderRow(id: string, over: DbRow = {}): DbRow {
  return {
    id,
    kid_id: 'kid-1',
    food_id: `food-${id}`,
    current_rung: 'licking',
    consecutive_successes: 0,
    consecutive_holds: 0,
    consecutive_refusals: 0,
    status: 'active',
    next_due_on: todayIsoDate(),
    last_attempt_at: null,
    paired_safe_food_id: null,
    preferred_prep: null,
    preferred_meal_slot: null,
    paused_reason: null,
    ...over,
  };
}

function seed(...rows: DbRow[]) {
  for (const r of rows) table('kid_food_ladder').set(r.id as string, r);
}

function attempts(): DbRow[] {
  return [...table('food_attempts').values()];
}

async function mounted(kidId = 'kid-1', expected = 1) {
  const hook = renderHook(
    ({ kid }: { kid: string }) => useFoodLadder(kid, { masteryDelayMs: 0 }),
    { initialProps: { kid: kidId } }
  );
  await waitFor(() => expect(hook.result.current.rows).toHaveLength(expected));
  return hook;
}

function current(hook: Awaited<ReturnType<typeof mounted>>, id: string): LadderRow {
  const found = hook.result.current.rows.find((r) => r.id === id);
  if (!found) throw new Error(`row ${id} not loaded`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.tables.clear();
  db.failures.length = 0;
  db.before = null;
  db.log.length = 0;
  checkFeatureLimit.mockResolvedValue({ allowed: true, limit: null, current: 0 });
  recordContributionsFromAttempt.mockResolvedValue(0);
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('useFoodLadder: logging', () => {
  it('advances the ladder in place on a successful log', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();

    await act(async () => {
      const ok = await hook.result.current.quickLog({
        row: current(hook, 'ladder-1'),
        result: 'accepted',
      });
      expect(ok).toBe(true);
    });

    expect(current(hook, 'ladder-1').consecutiveSuccesses).toBe(1);
    expect(table('kid_food_ladder').get('ladder-1')?.consecutive_successes).toBe(1);
    expect(attempts()).toHaveLength(1);
  });

  it('re-reads the real food history hook once a log lands', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = renderHook(() => ({
      ladder: useFoodLadder('kid-1', { masteryDelayMs: 0 }),
      history: useFoodAttemptHistory('kid-1'),
    }));
    await waitFor(() => expect(hook.result.current.ladder.rows).toHaveLength(1));
    await waitFor(() => expect(hook.result.current.history.status).toBe('ready'));
    const before = hook.result.current.history;
    expect(before.status === 'ready' && before.rows).toEqual([]);

    await act(async () => {
      const ok = await hook.result.current.ladder.quickLog({
        row: hook.result.current.ladder.rows[0],
        result: 'accepted',
      });
      expect(ok).toBe(true);
    });

    await waitFor(() => {
      const state = hook.result.current.history;
      expect(state.status === 'ready' ? state.rows.length : -1).toBe(1);
    });
  });

  it('logs four due foods in a row, sliding the fourth a day instead of failing', async () => {
    seed(...['r1', 'r2', 'r3', 'r4'].map((id) => dbLadderRow(id)));
    const hook = await mounted('kid-1', 4);

    const results: LogResult[] = [];
    for (const id of ['r1', 'r2', 'r3', 'r4']) {
      await act(async () => {
        results.push(
          await hook.result.current.logAttempt({
            row: current(hook, id),
            foodId: `food-${id}`,
            result: 'accepted',
          })
        );
      });
    }

    // Every rung move landed: the fake enforces the same 3-per-day cap as the
    // DB trigger, so a check_violation would show up as ladderSynced false.
    expect(results.map((r) => r.ok && r.ladderSynced)).toEqual([true, true, true, true]);
    const inTwoDays = addDays(todayIsoDate(), 2);
    expect(['r1', 'r2', 'r3'].map((id) => current(hook, id).nextDueOn)).toEqual([
      inTwoDays,
      inTwoDays,
      inTwoDays,
    ]);
    expect(current(hook, 'r4').nextDueOn).toBe(addDays(inTwoDays, 1));
    expect(table('kid_food_ladder').get('r4')?.next_due_on).toBe(addDays(inTwoDays, 1));
  });

  it('inserts one attempt when the same attempt id is logged twice', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();

    await act(async () => {
      await hook.result.current.logAttempt({
        foodId: 'food-ladder-1',
        result: 'accepted',
        attemptId: 'attempt-same',
      });
    });
    await act(async () => {
      const again = await hook.result.current.logAttempt({
        foodId: 'food-ladder-1',
        result: 'accepted',
        attemptId: 'attempt-same',
      });
      expect(again.ok).toBe(true);
    });

    expect(attempts()).toHaveLength(1);
    expect(current(hook, 'ladder-1').consecutiveSuccesses).toBe(1);
  });

  it('treats a 23505 on the attempt insert as already landed', async () => {
    seed(dbLadderRow('ladder-1'));
    // The attempt reached the server on an earlier try whose response was lost.
    table('food_attempts').set('attempt-lost', { id: 'attempt-lost', kid_id: 'kid-1' });
    const hook = await mounted();

    let outcome: LogResult | undefined;
    await act(async () => {
      outcome = await hook.result.current.logAttempt({
        foodId: 'food-ladder-1',
        result: 'accepted',
        attemptId: 'attempt-lost',
      });
    });

    expect(outcome).toMatchObject({ ok: true, attemptId: 'attempt-lost', ladderSynced: true });
    expect(attempts()).toHaveLength(1);
    expect(table('kid_food_ladder').get('ladder-1')?.consecutive_successes).toBe(1);
    // A replay is not a new entry against the plan limit.
    expect(rpc).not.toHaveBeenCalledWith('increment_usage', expect.anything());
  });

  it('keeps the attempt and the new rung when only the ladder write fails', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();
    db.failures.push({
      table: 'kid_food_ladder',
      op: 'update',
      error: { message: 'network down' },
    });

    let outcome: LogResult | undefined;
    await act(async () => {
      outcome = await hook.result.current.logAttempt({
        row: current(hook, 'ladder-1'),
        foodId: 'food-ladder-1',
        result: 'refused',
      });
    });

    expect(outcome).toMatchObject({ ok: true, ladderSynced: false });
    expect(attempts()).toHaveLength(1);
    expect(current(hook, 'ladder-1').currentRung).toBe('smelling');
  });

  it('restores the prior state when the attempt insert itself fails', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();
    const before = current(hook, 'ladder-1');
    db.failures.push({ table: 'food_attempts', op: 'insert', error: { message: 'rls denied' } });

    await act(async () => {
      const ok = await hook.result.current.quickLog({ row: before, result: 'accepted' });
      expect(ok).toBe(false);
    });

    expect(current(hook, 'ladder-1')).toEqual(before);
    expect(attempts()).toHaveLength(0);
  });

  it('keeps the log when only the plan-entry back-link fails', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();
    db.failures.push({ table: 'plan_entries', op: 'update', error: { message: 'gone' } });

    await act(async () => {
      const ok = await hook.result.current.quickLog({
        row: current(hook, 'ladder-1'),
        result: 'accepted',
        planEntryId: 'plan-1',
      });
      expect(ok).toBe(true);
    });

    expect(current(hook, 'ladder-1').consecutiveSuccesses).toBe(1);
    expect(attempts()[0].plan_entry_id).toBe('plan-1');
  });

  it('re-applies onto the server row when another device moved it first', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();
    // Another device logs a success between our read and our write.
    let moved = false;
    db.before = (q) => {
      if (!moved && q.table === 'food_attempts' && q.op === 'insert') {
        moved = true;
        const r = table('kid_food_ladder').get('ladder-1') as DbRow;
        table('kid_food_ladder').set('ladder-1', {
          ...r,
          consecutive_successes: 1,
          last_attempt_at: '2026-07-31T12:00:00.000Z',
        });
      }
    };

    let outcome: LogResult | undefined;
    await act(async () => {
      outcome = await hook.result.current.logAttempt({
        foodId: 'food-ladder-1',
        result: 'accepted',
      });
    });

    expect(outcome).toMatchObject({ ok: true, ladderSynced: true });
    // Both successes count: two at licking moves the child up a rung.
    expect(table('kid_food_ladder').get('ladder-1')?.current_rung).toBe('tiny_taste');
    expect(current(hook, 'ladder-1').currentRung).toBe('tiny_taste');
  });

  it('ignores a second tap on the same row while the first is saving', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();
    const target = current(hook, 'ladder-1');

    let first: Promise<LogResult> | undefined;
    let second: LogResult | undefined;
    await act(async () => {
      first = hook.result.current.logAttempt({ row: target, foodId: target.foodId, result: 'accepted' });
      second = await hook.result.current.logAttempt({
        row: target,
        foodId: target.foodId,
        result: 'accepted',
      });
      await first;
    });

    expect(second).toEqual({ ok: false, reason: 'in_flight' });
    expect(attempts()).toHaveLength(1);
  });

  it('starts the food first when there is no ladder row for it yet', async () => {
    const hook = renderHook(() => useFoodLadder('kid-1', { masteryDelayMs: 0 }));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    let outcome: LogResult | undefined;
    await act(async () => {
      outcome = await hook.result.current.logAttempt({ foodId: 'broccoli', result: 'held' });
    });

    expect(outcome?.ok).toBe(true);
    const ladder = [...table('kid_food_ladder').values()];
    expect(ladder).toHaveLength(1);
    expect(ladder[0]).toMatchObject({ kid_id: 'kid-1', food_id: 'broccoli' });
    expect(attempts()[0]).toMatchObject({ food_id: 'broccoli', stage: 'looking', outcome: 'partial' });
    const insertOrder = db.log.filter((l) => l.op === 'insert').map((l) => l.table);
    expect(insertOrder).toEqual(['kid_food_ladder', 'food_attempts']);
    expect(hook.result.current.rows).toHaveLength(1);
  });

  it('rejects invalid details without writing anything', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();

    let outcome: LogResult | undefined;
    await act(async () => {
      outcome = await hook.result.current.logAttempt({
        foodId: 'food-ladder-1',
        result: 'held',
        details: { bitesTaken: 51 },
      });
    });

    expect(outcome).toEqual({ ok: false, reason: 'error' });
    expect(attempts()).toHaveLength(0);
  });
});

describe('useFoodLadder: plan-limit gate', () => {
  it('blocks at the limit and asks for the upgrade prompt, writing nothing', async () => {
    seed(dbLadderRow('ladder-1'));
    checkFeatureLimit.mockResolvedValue({
      allowed: false,
      limit: 20,
      current: 20,
      message: 'Monthly limit reached',
    });
    const hook = await mounted();

    let outcome: LogResult | undefined;
    await act(async () => {
      outcome = await hook.result.current.logAttempt({ foodId: 'food-ladder-1', result: 'accepted' });
    });

    expect(outcome).toEqual({ ok: false, reason: 'limit' });
    expect(requestUpgradePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Monthly limit reached' })
    );
    expect(attempts()).toHaveLength(0);
    expect(current(hook, 'ladder-1').consecutiveSuccesses).toBe(0);
  });

  it('asks the server once, then counts locally up to the limit', async () => {
    seed(dbLadderRow('a'), dbLadderRow('b'));
    checkFeatureLimit.mockResolvedValue({ allowed: true, limit: 1, current: 0 });
    const hook = await mounted('kid-1', 2);

    const outcomes: LogResult[] = [];
    for (const id of ['a', 'b']) {
      await act(async () => {
        outcomes.push(await hook.result.current.logAttempt({ foodId: `food-${id}`, result: 'held' }));
      });
    }

    expect(outcomes.map((o) => o.ok)).toEqual([true, false]);
    expect(checkFeatureLimit).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('increment_usage', {
      p_user_id: 'user-1',
      p_feature_type: 'food_tracker',
    });
    expect(recordContributionsFromAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('useFoodLadder: undo, restore and start', () => {
  it('undoLog deletes the attempt and puts the rung back', async () => {
    seed(dbLadderRow('ladder-1', { consecutive_successes: 1 }));
    const hook = await mounted();

    let outcome: LogResult | undefined;
    await act(async () => {
      outcome = await hook.result.current.logAttempt({ foodId: 'food-ladder-1', result: 'accepted' });
    });
    expect(current(hook, 'ladder-1').currentRung).toBe('tiny_taste');
    if (!outcome?.ok) throw new Error('log failed');

    const { attemptId, previous } = outcome;
    await act(async () => {
      expect(await hook.result.current.undoLog({ attemptId, previous })).toBe(true);
    });

    expect(attempts()).toHaveLength(0);
    expect(current(hook, 'ladder-1')).toMatchObject({
      currentRung: 'licking',
      consecutiveSuccesses: 1,
    });
    expect(table('kid_food_ladder').get('ladder-1')).toMatchObject({
      current_rung: 'licking',
      consecutive_successes: 1,
    });
  });

  it('restoreRow puts a removed row back with its id and counters', async () => {
    seed(dbLadderRow('ladder-1', { current_rung: 'small_bite', consecutive_holds: 2 }));
    const hook = await mounted();
    const removed = current(hook, 'ladder-1');

    await act(async () => {
      await hook.result.current.removeFromLadder(removed);
    });
    expect(hook.result.current.rows).toHaveLength(0);

    await act(async () => {
      expect(await hook.result.current.restoreRow(removed)).toBe(true);
    });
    expect(table('kid_food_ladder').get('ladder-1')).toMatchObject({
      current_rung: 'small_bite',
      consecutive_holds: 2,
    });
    expect(hook.result.current.rows.map((r) => r.id)).toEqual(['ladder-1']);
  });

  it('startFood reports a duplicate and a cap distinctly', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();

    await act(async () => {
      expect(await hook.result.current.startFood('food-ladder-1')).toEqual({
        ok: false,
        reason: 'duplicate',
      });
    });

    db.failures.push({
      table: 'kid_food_ladder',
      op: 'insert',
      error: { code: '23514', message: 'ladder_exposure_cap: full' },
    });
    await act(async () => {
      expect(await hook.result.current.startFood('peas')).toEqual({ ok: false, reason: 'cap' });
    });
  });

  it('startFood starts a fourth food tomorrow when today is full', async () => {
    seed(dbLadderRow('a'), dbLadderRow('b'), dbLadderRow('c'));
    const hook = await mounted('kid-1', 3);

    await act(async () => {
      const started = await hook.result.current.startFood('peas');
      expect(started.ok && started.row.nextDueOn).toBe(addDays(todayIsoDate(), 1));
    });
  });

  it('addFoodToLadder prefers an explicit kid over the active one', async () => {
    const hook = await mounted('kid-1', 0);

    await act(async () => {
      expect(await hook.result.current.addFoodToLadder('peas', 'safe-1', 'kid-2')).toBe(true);
    });

    const [inserted] = [...table('kid_food_ladder').values()];
    expect(inserted).toMatchObject({ kid_id: 'kid-2', food_id: 'peas', paired_safe_food_id: 'safe-1' });
    // Not the active child's ladder, so it does not appear on this screen.
    expect(hook.result.current.rows).toHaveLength(0);
  });
});

describe('useFoodLadder: kid switches and load errors', () => {
  it('clears mastery candidates when the kid changes', async () => {
    seed(
      dbLadderRow('ladder-1', { current_rung: 'full_portion', consecutive_successes: 1 }),
      dbLadderRow('ladder-b', { kid_id: 'kid-b' })
    );
    rpc.mockImplementation(async (name: string) =>
      name === 'get_food_chain_suggestions'
        ? {
            data: [{ food_id: 'next-food', food_name: 'Next', similarity_score: 80, reasons: [] }],
            error: null,
          }
        : { data: null, error: null }
    );
    const hook = await mounted();

    await act(async () => {
      await hook.result.current.logAttempt({ foodId: 'food-ladder-1', result: 'accepted' });
    });
    await waitFor(() => expect(hook.result.current.masteryCandidates).toHaveLength(1));
    expect(hook.result.current.masteryCandidates[0].kidId).toBe('kid-1');

    hook.rerender({ kid: 'kid-b' });
    await waitFor(() => expect(hook.result.current.rows.map((r) => r.id)).toEqual(['ladder-b']));
    expect(hook.result.current.masteryCandidates).toEqual([]);
    expect(hook.result.current.masteredFoodName).toBeNull();
  });

  it('does not offer the handoff while an undo is still possible', async () => {
    seed(dbLadderRow('ladder-1', { current_rung: 'full_portion', consecutive_successes: 1 }));
    rpc.mockResolvedValue({
      data: [{ food_id: 'next-food', food_name: 'Next', similarity_score: 80, reasons: [] }],
      error: null,
    });
    const hook = renderHook(() => useFoodLadder('kid-1', { masteryDelayMs: 60_000 }));
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));

    let outcome: LogResult | undefined;
    await act(async () => {
      outcome = await hook.result.current.logAttempt({ foodId: 'food-ladder-1', result: 'accepted' });
    });
    if (!outcome?.ok) throw new Error('log failed');
    const { attemptId, previous } = outcome;
    await act(async () => {
      await hook.result.current.undoLog({ attemptId, previous });
    });

    expect(rpc).not.toHaveBeenCalledWith('get_food_chain_suggestions', expect.anything());
    expect(hook.result.current.masteryCandidates).toEqual([]);
    hook.unmount();
  });

  it('reports a failed load as an error, not as an empty ladder', async () => {
    db.failures.push({ table: 'kid_food_ladder', op: 'select', error: { message: 'offline' } });
    const hook = renderHook(() => useFoodLadder('kid-1'));

    await waitFor(() => expect(hook.result.current.error).toBe('load_failed'));
    expect(hook.result.current.loading).toBe(false);
  });

  it('keeps the rows it has when a reload fails, and clears the error on success', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();

    db.failures.push({ table: 'kid_food_ladder', op: 'select', error: { message: 'offline' } });
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.error).toBe('load_failed');
    expect(hook.result.current.rows).toHaveLength(1);

    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.error).toBeNull();
  });

  it('groups rows by status for the board', async () => {
    seed(dbLadderRow('ladder-1'));
    const hook = await mounted();
    expect(hook.result.current.grouped.active).toHaveLength(1);
    expect(hook.result.current.grouped.mastered).toHaveLength(0);
  });
});
