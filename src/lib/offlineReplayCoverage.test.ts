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

/** The body of `replay`, split into its per-operation arms. */
const replayBody = (() => {
  const start = SOURCE.indexOf('private func replay(');
  expect(start, 'replay not found').toBeGreaterThan(-1);
  return SOURCE.slice(start);
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

  it('replays an insert for every table', () => {
    const arm = operationArm('insert');
    const missing = tables.filter((t) => !arm.includes(`case Table.${t}.rawValue:`));
    expect(missing).toEqual([]);
  });

  it('replays an update for every table', () => {
    // kids and recipes were the two that were missing.
    const arm = operationArm('update');
    const missing = tables.filter((t) => !arm.includes(`case Table.${t}.rawValue:`));
    expect(missing).toEqual([]);
  });

  it('throws rather than falling through on an unhandled case', () => {
    // A `break` or bare `return` here reads to the caller as a successful
    // replay, which is what made the loss silent.
    for (const operation of ['insert', 'update'] as const) {
      const arm = operationArm(operation);
      const fallthrough = arm.slice(arm.lastIndexOf('default:'));
      expect(fallthrough, `${operation} default falls through`).toContain('throw ReplayError');
    }
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
