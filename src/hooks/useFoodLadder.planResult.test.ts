/**
 * Item 41: a meal result logged through performQuickLog moves the food's
 * ladder rung, exactly once, through the ladder's own policy.
 *
 * The stand-in below holds the three tables involved and imitates
 * create_attempt_from_plan_result as migration 20260926000002 defines it:
 * a NULL -> result update with no food_attempt_id inserts one attempt, at the
 * ladder's rung when the food is on an active ladder, and links it. The SQL
 * side of that contract is pinned in supabase/tests/ladder_plan_attempt_rung.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type DbRow = Record<string, unknown>;
type Op = 'eq' | 'is' | 'in' | 'gt' | 'notnull';
interface Filter {
  op: Op;
  col: string;
  val?: unknown;
}

const db = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  seq: 0,
  clock: Date.parse('2026-09-24T18:00:00.000Z'),
}));

function table(name: string): Map<string, DbRow> {
  let t = db.tables.get(name);
  if (!t) {
    t = new Map();
    db.tables.set(name, t);
  }
  return t;
}

function passes(row: DbRow, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case 'eq':
      return v === f.val;
    case 'is':
      return v == null;
    case 'in':
      return (f.val as unknown[]).includes(v);
    case 'gt':
      return typeof v === 'string' && Date.parse(v) > Date.parse(String(f.val));
    case 'notnull':
      return v != null;
  }
}

const FIXED_STAGE: Record<string, [string, string]> = {
  ate: ['success', 'full_portion'],
  tasted: ['partial', 'small_bite'],
  refused: ['refused', 'looking'],
};

/** create_attempt_from_plan_result, as 20260926000002 writes it. */
function planResultTrigger(before: DbRow, next: DbRow): DbRow {
  if (!(next.result != null && before.result == null && next.food_attempt_id == null)) return next;
  const mapped = FIXED_STAGE[String(next.result)];
  if (!mapped) return next;
  const ladder = [...table('kid_food_ladder').values()].find(
    (l) =>
      l.kid_id === next.kid_id &&
      l.food_id === next.food_id &&
      (l.status === 'active' || l.status === 'backed_off')
  );
  const id = `attempt-${++db.seq}`;
  db.clock += 1000;
  table('food_attempts').set(id, {
    id,
    kid_id: next.kid_id,
    food_id: next.food_id,
    stage: ladder ? ladder.current_rung : mapped[1],
    outcome: mapped[0],
    attempted_at: new Date(db.clock).toISOString(),
    plan_entry_id: next.id,
  });
  return { ...next, food_attempt_id: id };
}

function execute(q: {
  table: string;
  op: 'select' | 'update' | 'insert';
  payload?: DbRow;
  filters: Filter[];
  mode: 'many' | 'maybeSingle' | 'single';
}): { data: unknown; error: null | { message: string; code?: string } } {
  const t = table(q.table);
  const hit = (r: DbRow) => q.filters.every((f) => passes(r, f));
  let out: DbRow[];
  if (q.op === 'select') {
    out = [...t.values()].filter(hit);
  } else if (q.op === 'insert') {
    const row = { ...q.payload } as DbRow;
    if (!row.id) row.id = `gen-${++db.seq}`;
    if (t.has(row.id as string)) return { data: null, error: { code: '23505', message: 'dup' } };
    t.set(row.id as string, row);
    out = [row];
  } else {
    out = [];
    for (const r of [...t.values()].filter(hit)) {
      let next = { ...r, ...q.payload };
      if (q.table === 'plan_entries') next = planResultTrigger(r, next);
      t.set(r.id as string, next);
      out.push(next);
    }
  }
  if (q.mode !== 'many') {
    return out.length ? { data: { ...out[0] }, error: null } : { data: null, error: null };
  }
  return { data: out.map((r) => ({ ...r })), error: null };
}

function builder(name: string) {
  const q = {
    table: name,
    op: 'select' as 'select' | 'update' | 'insert',
    payload: undefined as DbRow | undefined,
    filters: [] as Filter[],
    mode: 'many' as 'many' | 'maybeSingle' | 'single',
  };
  const chain = {
    select: () => chain,
    update(payload: DbRow) {
      q.op = 'update';
      q.payload = payload;
      return chain;
    },
    insert(payload: DbRow) {
      q.op = 'insert';
      q.payload = payload;
      return chain;
    },
    eq(col: string, val: unknown) {
      q.filters.push({ op: 'eq', col, val });
      return chain;
    },
    is(col: string) {
      q.filters.push({ op: 'is', col });
      return chain;
    },
    in(col: string, val: unknown[]) {
      q.filters.push({ op: 'in', col, val });
      return chain;
    },
    gt(col: string, val: unknown) {
      q.filters.push({ op: 'gt', col, val });
      return chain;
    },
    not(col: string, operator: string, val: unknown) {
      if (operator === 'is' && val === null) q.filters.push({ op: 'notnull', col });
      return chain;
    },
    order: () => chain,
    maybeSingle() {
      q.mode = 'maybeSingle';
      return chain;
    },
    single() {
      q.mode = 'single';
      return chain;
    },
    then<T>(resolve: (v: ReturnType<typeof execute>) => T) {
      return Promise.resolve(execute(q)).then(resolve);
    },
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (name: string) => builder(name),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } }),
    },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/featureLimits', () => ({
  checkFeatureLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock('@/lib/chainNetwork', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chainNetwork')>()),
  recordContributionsFromAttempt: vi.fn().mockResolvedValue(undefined),
  contributeChainNetworkSuccess: vi.fn().mockResolvedValue(true),
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { performQuickLog, type QuickLogResult as MealResultTap } from '@/lib/quickLog';
import {
  LADDER_RESULT_FOR_PLAN,
  buildQuickLogWrites,
  PLAN_FOLD_EPOCH,
  foldPlanAttempts,
  syncLadderAfterPlanResult,
  syncLadderFromPlanAttempts,
  useFoodLadder,
  type LadderRow,
} from './useFoodLadder';

const LAST = '2026-09-20T18:00:00.000Z';

function seedLadder(over: DbRow = {}) {
  table('kid_food_ladder').set('ladder-1', {
    id: 'ladder-1',
    kid_id: 'kid-1',
    food_id: 'food-1',
    current_rung: 'touching',
    consecutive_successes: 1,
    consecutive_holds: 0,
    consecutive_refusals: 0,
    status: 'active',
    next_due_on: '2026-09-22',
    last_attempt_at: LAST,
    paired_safe_food_id: null,
    preferred_prep: null,
    preferred_meal_slot: null,
    paused_reason: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...over,
  });
}

function seedEntry(id = 'entry-1', foodId = 'food-1', over: DbRow = {}) {
  table('plan_entries').set(id, {
    id,
    kid_id: 'kid-1',
    food_id: foodId,
    result: null,
    food_attempt_id: null,
    notes: null,
    ...over,
  });
}

const ladder = () => table('kid_food_ladder').get('ladder-1') as DbRow;
const attempts = () => [...table('food_attempts').values()];

/** What the dashboard does: performQuickLog, saving through plan_entries. */
async function quickLog(result: MealResultTap, entryId = 'entry-1') {
  const outcome = await performQuickLog({
    meals: [{ id: entryId, label: 'Dinner' }],
    mealId: entryId,
    result,
    save: async (id, patch) => {
      const { error } = await builder('plan_entries').update({ ...patch }).eq('id', id);
      return { error };
    },
    syncLadder: syncLadderAfterPlanResult,
  });
  expect(outcome.status).toBe('saved');
  if (outcome.status === 'saved') await outcome.ladderSync;
}

beforeEach(() => {
  db.tables.clear();
  db.seq = 0;
  db.clock = Date.parse('2026-09-24T18:00:00.000Z');
});

describe('quick log on a laddered food', () => {
  it('ate: advances the rung exactly once, recording the attempt at the old rung', async () => {
    seedLadder();
    seedEntry();

    await quickLog('ate');

    expect(attempts()).toHaveLength(1);
    expect(attempts()[0]).toMatchObject({ stage: 'touching', outcome: 'success', plan_entry_id: 'entry-1' });
    expect(ladder()).toMatchObject({
      current_rung: 'smelling',
      consecutive_successes: 0,
      last_attempt_at: attempts()[0].attempted_at,
    });

    // A second fold, a later load, or a re-log of the same meal: no second move.
    await syncLadderFromPlanAttempts('kid-1');
    await quickLog('tasted');
    expect(attempts()).toHaveLength(1);
    expect(ladder()).toMatchObject({ current_rung: 'smelling', consecutive_successes: 0, consecutive_holds: 0 });
  });

  it('tasted: holds the rung once', async () => {
    seedLadder();
    seedEntry();
    await quickLog('tasted');
    await syncLadderFromPlanAttempts('kid-1');
    expect(ladder()).toMatchObject({ current_rung: 'touching', consecutive_holds: 1, consecutive_successes: 0 });
  });

  it('refused: steps down once', async () => {
    seedLadder();
    seedEntry();
    await quickLog('refused');
    await syncLadderFromPlanAttempts('kid-1');
    expect(ladder()).toMatchObject({ current_rung: 'looking', consecutive_refusals: 1 });
  });

  it('lands on the same state a ladder tap would, for each result', async () => {
    for (const result of ['ate', 'tasted', 'refused'] as const) {
      db.tables.clear();
      seedLadder();
      seedEntry();
      await quickLog(result);
      const attempt = attempts()[0];
      const row: LadderRow = {
        id: 'ladder-1',
        kidId: 'kid-1',
        foodId: 'food-1',
        currentRung: 'touching',
        consecutiveSuccesses: 1,
        consecutiveHolds: 0,
        consecutiveRefusals: 0,
        status: 'active',
        nextDueOn: '2026-09-22',
        lastAttemptAt: LAST,
        pairedSafeFoodId: null,
        preferredPrep: null,
        preferredMealSlot: null,
        pausedReason: null,
      };
      const tap = buildQuickLogWrites({
        row,
        result: LADDER_RESULT_FOR_PLAN[result],
        now: String(attempt.attempted_at),
        today: '2026-09-24',
      });
      expect(ladder()).toMatchObject({
        current_rung: tap.nextState.currentRung,
        consecutive_successes: tap.nextState.consecutiveSuccesses,
        consecutive_holds: tap.nextState.consecutiveHolds,
        consecutive_refusals: tap.nextState.consecutiveRefusals,
        status: tap.nextState.status,
      });
    }
  });

  it('leaves a food with no ladder row alone, and starts no ladder', async () => {
    seedEntry('entry-2', 'food-2');
    await quickLog('ate', 'entry-2');
    expect(attempts()[0]).toMatchObject({ stage: 'full_portion', outcome: 'success' });
    expect(table('kid_food_ladder').size).toBe(0);
  });

  it('does not move a paused food', async () => {
    seedLadder({ status: 'paused', paused_reason: 'parent', next_due_on: null });
    seedEntry();
    await quickLog('ate');
    expect(ladder()).toMatchObject({ current_rung: 'touching', consecutive_successes: 1, last_attempt_at: LAST });
  });

  it('two folds racing move the row once', async () => {
    seedLadder();
    seedEntry();
    // The result lands with nobody folding yet (an older iOS build).
    await builder('plan_entries').update({ result: 'ate' }).eq('id', 'entry-1');
    const [a, b] = await Promise.all([
      syncLadderFromPlanAttempts('kid-1'),
      syncLadderFromPlanAttempts('kid-1'),
    ]);
    expect(a.length + b.length).toBe(1);
    expect(ladder()).toMatchObject({ current_rung: 'smelling', consecutive_successes: 0 });
  });

  it("ignores attempts older than the row's last fold, and ones with no plan entry", () => {
    const row: LadderRow = {
      id: 'ladder-1',
      kidId: 'kid-1',
      foodId: 'food-1',
      currentRung: 'touching',
      consecutiveSuccesses: 0,
      consecutiveHolds: 0,
      consecutiveRefusals: 0,
      status: 'active',
      nextDueOn: null,
      lastAttemptAt: LAST,
      pairedSafeFoodId: null,
      preferredPrep: null,
      preferredMealSlot: null,
      pausedReason: null,
    };
    expect(
      foldPlanAttempts(row, [{ id: 'old', foodId: 'food-1', outcome: 'refused', attemptedAt: LAST }], LAST)
    ).toBeNull();
    expect(
      foldPlanAttempts(
        row,
        [{ id: 'other', foodId: 'food-9', outcome: 'refused', attemptedAt: '2026-09-24T00:00:00.000Z' }],
        LAST
      )
    ).toBeNull();
  });

  it("stops at a refusal that pauses the food", () => {
    const row: LadderRow = {
      id: 'ladder-1',
      kidId: 'kid-1',
      foodId: 'food-1',
      currentRung: 'touching',
      consecutiveSuccesses: 0,
      consecutiveHolds: 0,
      consecutiveRefusals: 1,
      status: 'active',
      nextDueOn: null,
      lastAttemptAt: LAST,
      pairedSafeFoodId: null,
      preferredPrep: null,
      preferredMealSlot: null,
      pausedReason: null,
    };
    const folded = foldPlanAttempts(
      row,
      [
        { id: 'a', foodId: 'food-1', outcome: 'refused', attemptedAt: '2026-09-21T18:00:00.000Z' },
        { id: 'b', foodId: 'food-1', outcome: 'success', attemptedAt: '2026-09-22T18:00:00.000Z' },
      ],
      LAST
    );
    expect(folded?.applied).toEqual(['a']);
    expect(folded?.state).toMatchObject({ status: 'paused', pausedReason: 'two_refusals' });
  });
});

describe('the ladder hook', () => {
  it('folds a result set outside the web (an older iOS build) when it loads', async () => {
    seedLadder();
    seedEntry();
    await builder('plan_entries').update({ result: 'ate' }).eq('id', 'entry-1');

    const hook = renderHook(() => useFoodLadder('kid-1'));
    await waitFor(() => expect(hook.result.current.rows[0]?.currentRung).toBe('smelling'));
    expect(ladder()).toMatchObject({ current_rung: 'smelling' });
  });

  it('shows a shell quick log without a page visit', async () => {
    seedLadder();
    seedEntry();
    const hook = renderHook(() => useFoodLadder('kid-1'));
    await waitFor(() => expect(hook.result.current.rows[0]?.currentRung).toBe('touching'));

    await act(async () => {
      await quickLog('ate');
    });
    await waitFor(() => expect(hook.result.current.rows[0]?.currentRung).toBe('smelling'));
  });

  it("a ladder tap linked to a plan entry is not folded a second time", async () => {
    seedLadder({ consecutive_successes: 0 });
    seedEntry();
    const hook = renderHook(() => useFoodLadder('kid-1'));
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));

    await act(async () => {
      const ok = await hook.result.current.quickLog({
        row: hook.result.current.rows[0],
        result: 'accepted',
        planEntryId: 'entry-1',
      });
      expect(ok).toBe(true);
    });
    expect(attempts()).toHaveLength(1);
    expect(ladder()).toMatchObject({ current_rung: 'touching', consecutive_successes: 1 });

    await syncLadderFromPlanAttempts('kid-1');
    await syncLadderAfterPlanResult('entry-1');
    expect(ladder()).toMatchObject({ current_rung: 'touching', consecutive_successes: 1 });
  });
});

describe('what the fold never replays', () => {
  it('does not fold meal results older than PLAN_FOLD_EPOCH', async () => {
    seedLadder({ last_attempt_at: null, created_at: '2026-06-01T00:00:00.000Z' });
    for (const [i, day] of ['2026-07-01', '2026-08-01', '2026-09-01'].entries()) {
      table('food_attempts').set(`hist-${i}`, {
        id: `hist-${i}`,
        kid_id: 'kid-1',
        food_id: 'food-1',
        stage: 'full_portion',
        outcome: 'success',
        attempted_at: `${day}T18:00:00.000Z`,
        plan_entry_id: `old-entry-${i}`,
      });
    }
    expect(Date.parse('2026-09-01T18:00:00.000Z')).toBeLessThan(Date.parse(PLAN_FOLD_EPOCH));
    expect(await syncLadderFromPlanAttempts('kid-1')).toEqual([]);
    expect(ladder()).toMatchObject({ current_rung: 'touching', consecutive_successes: 1 });
  });

  it('meals logged while a food is paused are not replayed when the parent resumes it', async () => {
    seedLadder({ status: 'paused', paused_reason: 'parent', next_due_on: null });
    seedEntry('entry-1');
    seedEntry('entry-2');
    // Two meals eaten while paused: they are meals, not ladder exposures.
    await quickLog('ate', 'entry-1');
    await quickLog('ate', 'entry-2');
    expect(ladder()).toMatchObject({ current_rung: 'touching', status: 'paused' });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T09:00:00.000Z'));
    try {
      const hook = renderHook(() => useFoodLadder('kid-1'));
      await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
      await act(async () => {
        await hook.result.current.resume(hook.result.current.rows[0]);
      });
      expect(ladder()).toMatchObject({ status: 'active', current_rung: 'touching', consecutive_successes: 1 });

      // The next load, or any fold, finds nothing to replay.
      await syncLadderFromPlanAttempts('kid-1');
      const reloaded = renderHook(() => useFoodLadder('kid-1'));
      await waitFor(() => expect(reloaded.result.current.rows).toHaveLength(1));
      await syncLadderFromPlanAttempts('kid-1');
      expect(ladder()).toMatchObject({ status: 'active', current_rung: 'touching', consecutive_successes: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
