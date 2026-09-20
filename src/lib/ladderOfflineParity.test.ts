import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Swift ladder queue obeys the contract this repo wrote down first
 * (US-609).
 *
 * `src/lib/ladderSyncOps.ts` has no runtime caller. It was written as an
 * executable specification because the implementation that needed it is
 * native Swift, and deriving the same rules twice is how two clients end up
 * disagreeing about where a child is on a ladder. `LadderSyncOps.swift` is the
 * implementation; `LadderSyncOpsTests.swift` pins its behaviour.
 *
 * What neither of those can catch is the two files drifting apart. The Swift
 * suite tests Swift against Swift, and nobody editing `ladderSyncOps.ts` has
 * any reason to open an Xcode project. So this reads both, the same way
 * `offlineReplayCoverage.test.ts` reads `OfflineStore.swift` -- the web suite
 * is the only place that can see both trees at once.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const IOS = path.join(ROOT, 'ios', 'EatPal', 'EatPal');

const read = (...parts: string[]) => readFileSync(path.join(...parts), 'utf8');

const SPEC = read(ROOT, 'src', 'lib', 'ladderSyncOps.ts');
const SWIFT = read(IOS, 'Ladder', 'LadderSyncOps.swift');
const STORE = read(IOS, 'Services', 'OfflineStore.swift');
const APP_STATE = read(IOS, 'App', 'AppState.swift');
const MODELS = read(IOS, 'Models', 'KidFoodLadder.swift');

describe('ladder offline parity (US-609)', () => {
  it('carries every field of the queued op on both sides', () => {
    // A field present in the spec and missing in Swift is an exposure that
    // replays with a piece of itself gone -- most damagingly `today`, which
    // drives the next-due arithmetic and would otherwise be taken from the
    // day the phone happened to reconnect.
    const specStart = SPEC.indexOf('export interface LadderAttemptOp {');
    expect(specStart, 'LadderAttemptOp not found in the spec').toBeGreaterThan(-1);
    const specBody = SPEC.slice(specStart, SPEC.indexOf('\n}', specStart));
    const specFields = [...specBody.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);

    expect(specFields.length, 'parsed no fields from the spec').toBeGreaterThan(8);

    const swiftStart = SWIFT.indexOf('struct LadderAttemptOp');
    const swiftBody = SWIFT.slice(swiftStart, SWIFT.indexOf('\n}', swiftStart));
    const swiftFields = [...swiftBody.matchAll(/^ {4}var (\w+):/gm)].map((m) => m[1]);

    expect(swiftFields.sort()).toEqual(specFields.sort());
  });

  it('agrees on the three replay outcomes', () => {
    // skip-already-applied, skip-row-gone, apply. A Swift build that grew a
    // fourth branch, or lost one, would be deciding something the spec never
    // sanctioned.
    expect(SPEC).toContain("{ action: 'skip'; reason: 'already-applied' }");
    expect(SPEC).toContain("{ action: 'skip'; reason: 'row-gone' }");
    expect(SWIFT).toContain('case skipAlreadyApplied');
    expect(SWIFT).toContain('case skipRowGone');
    expect(SWIFT).toContain('case apply(LadderState)');
  });

  it('checks already-applied before the row is gone, on both sides', () => {
    // Both conditions can hold at once. The order decides which reason gets
    // recorded, and "already applied" is the one that is true.
    expect(SPEC.indexOf('if (attemptExists)')).toBeLessThan(SPEC.indexOf('if (!serverState)'));
    expect(SWIFT.indexOf('if attemptExists')).toBeLessThan(
      SWIFT.indexOf('guard let serverState'),
    );
  });

  it('derives the next state from the server row, not from the queued one', () => {
    // The conflict rule, and the reason the op carries intent at all. In Swift
    // the argument to `apply` must be `serverState` -- passing anything
    // reconstructed from the op would resurrect a stale rung.
    expect(SPEC).toMatch(/applyAttemptOutcome\(\s*serverState,/);
    expect(SWIFT).toMatch(/ExposureLadderPolicy\.apply\(\s*serverState,/);
  });

  it('generates the attempt id on the client', () => {
    // The whole idempotency story. If the column default fills it instead, a
    // replay inserts a second exposure and the ladder moves twice for one
    // dinner. Same invariant `buildGroceryRow` holds on web (US-823).
    expect(SPEC).toContain('id: op.attemptId');
    expect(SWIFT).toContain('id: op.attemptId');
    expect(MODELS, 'FoodAttemptInsert no longer sends a client id').toMatch(
      /struct FoodAttemptInsert[\s\S]{0,600}?var id: String = UUID\(\)\.uuidString/,
    );
    expect(MODELS, 'KidFoodLadderInsert no longer sends a client id').toMatch(
      /struct KidFoodLadderInsert[\s\S]{0,600}?var id: String = UUID\(\)\.uuidString/,
    );
    // An id that is never serialised is not an id the server sees.
    for (const struct of ['FoodAttemptInsert', 'KidFoodLadderInsert']) {
      const start = MODELS.indexOf(`struct ${struct}`);
      const keys = MODELS.slice(start, MODELS.indexOf('\n}', start));
      expect(keys, `${struct} omits id from its CodingKeys`).toMatch(/case id\b/);
    }
  });

  it('swallows a unique violation as success rather than retrying it', () => {
    // There are two of them and they are different constraints:
    // food_attempts.id (primary key) and kid_food_ladder (kid_id, food_id)
    // (unique index). A queue that retries either spins on an op that has
    // already landed and head-of-line blocks everything behind it.
    expect(SWIFT).toContain('func isUniqueViolation');
    expect(SWIFT).toContain('23505');
    expect(SWIFT).toContain('duplicate key');
    expect(STORE).toContain('guard LadderSyncOps.isUniqueViolation(error) else { throw error }');
    expect(STORE, 'the ladder insert no longer dedupes on its unique index').toContain(
      'onConflict: "kid_id,food_id"',
    );
  });

  it('queues the exposure instead of rolling it back on a lost connection', () => {
    // The bug the story is about: an exposure logged in a bad-signal kitchen
    // was restored out of the UI and lost. It now stays on screen and replays.
    const start = APP_STATE.indexOf('func quickLogExposure(');
    expect(start, 'quickLogExposure not found').toBeGreaterThan(-1);
    const body = APP_STATE.slice(start, APP_STATE.indexOf('\n    /// US-602', start));

    expect(body).toContain('OfflineStore.shared.enqueueLadderAttempt(op');
    // The enqueue has to come before the rollback, or the row is restored and
    // the queued op no longer matches what the parent sees.
    expect(body.indexOf('enqueueLadderAttempt')).toBeLessThan(
      body.indexOf('kidFoodLadder[restoreIndex] = previous'),
    );
  });

  it('queues the other three ladder writes too', () => {
    // AC3 names insert, update and delete alongside the attempt. A parent who
    // pauses a food offline should not find it scheduled again tomorrow.
    for (const call of [
      'table: .kidFoodLadder,\n                    entityId: row.id,',
      'OfflineStore.shared.enqueueDelete(',
      'OfflineStore.shared.enqueueUpdate(',
    ]) {
      expect(APP_STATE, `missing ${call}`).toContain(call);
    }
    expect(APP_STATE).toContain('table: .kidFoodLadder');
  });
});
