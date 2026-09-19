import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A queued mutation the replay cannot handle must not look like one that
 * synced.
 *
 * `OfflineStore.replay` dispatches on (operation, table) and used to `return`
 * or `break` out of its switches for anything it did not recognise. The drain
 * reads a non-throwing return as "landed on the server" and calls
 * clearPendingMutation, so an unhandled case was indistinguishable from
 * success: the user's offline edit vanished with no error, no toast, and
 * nothing in Sentry.
 *
 * Two of those holes were reachable. The update switch handled grocery_items,
 * foods and plan_entries but not kids or recipes, while `enqueueUpdate` is
 * generic over `Table` -- so an offline edit to a child's profile or a recipe
 * would be accepted, no-op'd and cleared. And `enqueueInsert`/`enqueueUpdate`
 * encoded with `try?`, storing nil on failure, which the drain then discarded
 * down the same path.
 *
 * This suite pins the coverage: every Table case has a replay arm for every
 * operation that can be queued for it, and nothing falls through quietly.
 */

const SOURCE = readFileSync(
  path.resolve(__dirname, '../../ios/EatPal/EatPal/Services/OfflineStore.swift'),
  'utf8',
);

/** The `Table` enum's cases, read from the source rather than hand-listed. */
const tables = (() => {
  const start = SOURCE.indexOf('enum Table: String {');
  expect(start, 'Table enum not found').toBeGreaterThan(-1);
  const body = SOURCE.slice(start, SOURCE.indexOf('}', start));
  return [...body.matchAll(/case (\w+)/g)].map((m) => m[1]);
})();

/**
 * Tables a client updates but never inserts.
 *
 * `profiles` is created by the `handle_new_user` trigger when the account is
 * made, so an insert from a phone would be a second row for a user who already
 * has one. Its absence from the insert switch is the design, not a gap -- and
 * an insert queued for it anyway still hits that switch's `default` and throws,
 * which the case below pins so "update-only" cannot quietly become "dropped".
 */
const UPDATE_ONLY_TABLES = ['profiles'];

/** The body of `replay`, split into its per-operation arms. */
const replayBody = (() => {
  const start = SOURCE.indexOf('private func replay(');
  expect(start, 'replay not found').toBeGreaterThan(-1);
  return SOURCE.slice(start);
})();

/**
 * The update routing, which US-809 moved out of `replay` into a static
 * `decodeUpdate`.
 *
 * `replay` is private and needs a live Supabase client, so the table-to-type
 * decision -- the part that was silently dropping mutations -- was extracted so
 * the Swift suite can exercise it directly. The rule this file pins is
 * unchanged; it just follows the code rather than relaxing to match.
 */
const updateRouting = (() => {
  const start = SOURCE.indexOf('static func decodeUpdate(');
  expect(start, 'decodeUpdate not found -- did the update routing move again?').toBeGreaterThan(-1);
  // Ends at the function's closing brace, which is the first `}` at 4-space
  // indent after the declaration.
  const end = SOURCE.indexOf('\n    }', start);
  expect(end, 'decodeUpdate has no closing brace').toBeGreaterThan(start);
  return SOURCE.slice(start, end);
})();

function operationArm(operation: 'insert' | 'update'): string {
  const marker = `case Operation.${operation}.rawValue:`;
  const start = replayBody.indexOf(marker);
  expect(start, `no ${operation} arm in replay`).toBeGreaterThan(-1);
  const rest = replayBody.slice(start + marker.length);
  const nextArm = rest.search(/\n {8}case Operation\.|\n {8}default:/);
  return rest.slice(0, nextArm === -1 ? undefined : nextArm);
}

describe('offline replay coverage', () => {
  it('found the tables to check', () => {
    // Floor: coverage over an empty list is not coverage.
    expect(tables.length).toBeGreaterThanOrEqual(5);
    expect(tables).toContain('kids');
    expect(tables).toContain('recipes');
  });

  it('replays an insert for every table that can be inserted', () => {
    const arm = operationArm('insert');
    const missing = tables
      .filter((t) => !UPDATE_ONLY_TABLES.includes(t))
      .filter((t) => !arm.includes(`case Table.${t}.rawValue:`));
    expect(missing).toEqual([]);
  });

  it('throws rather than dropping an insert queued for an update-only table', () => {
    // The exemption above is only safe while the omission is loud. If the
    // insert switch ever went back to `default: break`, an insert for profiles
    // would be cleared as though it synced -- the exact failure this file
    // exists for, reintroduced through the exemption.
    const arm = operationArm('insert');
    for (const table of UPDATE_ONLY_TABLES) {
      expect(tables, `${table} is exempted but is not a Table case`).toContain(table);
      expect(arm).not.toContain(`case Table.${table}.rawValue:`);
    }
    expect(arm.slice(arm.lastIndexOf('default:'))).toContain('throw ReplayError');
  });

  it('replays an update for every table', () => {
    // kids and recipes were the two that were missing; profiles was added by
    // US-809 so a finished onboarding survives a reconnect.
    const missing = tables.filter((t) => !updateRouting.includes(`case Table.${t}.rawValue:`));
    expect(missing).toEqual([]);
  });

  it('routes every update through decodeUpdate rather than around it', () => {
    // The extraction is only worth anything while replay actually calls it. A
    // second, inlined switch in replay would pass the coverage check above and
    // still be the thing that runs.
    const arm = operationArm('update');
    expect(arm, 'replay no longer calls decodeUpdate').toContain('Self.decodeUpdate(');
    expect(
      arm.includes('case Table.'),
      'replay has its own table switch again, so decodeUpdate is not the only route',
    ).toBe(false);
  });

  it('throws rather than falling through on an unhandled case', () => {
    // A `break` or bare `return` here reads to the caller as a successful
    // replay, which is what made the loss silent.
    const insertArm = operationArm('insert');
    expect(
      insertArm.slice(insertArm.lastIndexOf('default:')),
      'insert default falls through',
    ).toContain('throw ReplayError');

    expect(
      updateRouting.slice(updateRouting.lastIndexOf('default:')),
      'update default falls through',
    ).toContain('throw ReplayError');
    expect(replayBody).toContain('throw ReplayError.missingPayload');
    expect(replayBody).not.toMatch(/guard let data = mutation\.payload else \{ return \}/);
  });

  it('quarantines an unreplayable mutation immediately', () => {
    // It fails identically on every pass, so five reconnections of blocking
    // its entity buys nothing.
    expect(SOURCE).toContain('isPermanent');
    expect(SOURCE).toContain('if permanent || mutation.attemptCount >= Self.maxReplayAttempts');
  });

  it('reports an encode failure instead of queueing a nil payload', () => {
    expect(SOURCE).toContain('encodeOrReport');
    expect(SOURCE).not.toContain('let data = try? JSONEncoder.supabaseSnakeCase.encode(payload)');
  });
});
