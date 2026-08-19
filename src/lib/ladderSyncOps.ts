import {
  applyAttemptOutcome,
  type AttemptOutcome,
  type LadderState,
} from '@/lib/exposureLadder';

/**
 * US-609: the replay contract for offline exposure-ladder writes.
 *
 * A kitchen with bad signal is the normal case for this feature, so a logged
 * exposure has to survive the app being closed before it reaches Supabase.
 *
 * STATUS: this is the SPECIFICATION, not a wired-up code path. It has no
 * runtime caller yet, and the story's original plan -- route ladder writes
 * through app/mobile/lib/syncQueue -- turned out to target the wrong stack.
 * The Expo app under app/ has no ladder screen at all; the live iOS ladder is
 * native Swift (ios/EatPal/EatPal/Ladder/ExposureLadderPolicy.swift, writing
 * via Services/DataService.swift), and the offline queue it should use is
 * Services/OfflineStore.swift, whose Table enum today covers only foods, kids,
 * recipes, plan_entries and grocery_items. Ladder writes therefore cannot be
 * queued on iOS at all right now: an exposure logged offline is simply lost.
 *
 * What lives here is the part of that fix worth pinning down in one place and
 * testing before it is written twice: what a replay writes, given what the
 * server holds by the time it runs. exposureLadder.ts and
 * ExposureLadderPolicy.swift already mirror each other rung for rung, so the
 * Swift implementation should mirror these rules the same way.
 *
 * WHY THE QUEUE CARRIES INTENT, NOT THE COMPUTED ROW
 *
 * quickLog computes the next ladder state locally and PUTs it. Queueing that
 * computed row would mean replaying a snapshot built from state that may be
 * hours stale: if the other parent logged an attempt from their phone in the
 * meantime, the replay would stamp the older rung back over the newer one.
 * That is the "resurrecting a stale rung" the story rules out.
 *
 * So `ladder.attempt` carries the INTENT -- which rung was offered, what the
 * child did -- and the replay re-derives the next state from whatever the
 * server row says at replay time. applyAttemptOutcome is pure, so re-deriving
 * is exact: the local step re-applies on top of the server's state, which is
 * the conflict rule the story asks for and matches the load-precedence
 * contract in CLAUDE.md (a successful server read always wins; queued local
 * writes then re-apply).
 *
 * IDEMPOTENCY
 *
 * The attempt row carries a CLIENT-GENERATED uuid. food_attempts.id is
 * `UUID PRIMARY KEY DEFAULT gen_random_uuid()` and its Insert type takes an
 * optional id, so the client can pick it without a migration. The replay
 * checks for that id before doing anything: if the attempt is already there,
 * the whole op is treated as applied and nothing is written. That is what
 * stops a replayed attempt creating a duplicate food_attempts row or
 * advancing the ladder twice.
 *
 * KNOWN GAP, DELIBERATELY CHOSEN
 *
 * The insert and the ladder update are two statements, not one transaction.
 * If the process dies between them, a later replay sees the attempt already
 * present and skips the ladder move, so the rung stays where it was. The
 * exposure is still recorded and the next attempt recomputes from the real
 * server state, so the ladder self-corrects on the following log. This errs
 * toward under-applying rather than double-advancing, which is the direction
 * the story explicitly prioritises -- a ladder that skipped forward puts a
 * child in front of a food they have not earned yet, while one that lagged a
 * step only costs one extra exposure. Closing the gap entirely needs the two
 * writes in one RPC, which is a schema change and is not required here.
 */

/** The intent of one quick log, everything a replay needs to redo it. */
export interface LadderAttemptOp {
  /** Client-generated uuid; the dedupe key that makes replay exactly-once. */
  attemptId: string;
  /** kid_food_ladder.id -- the row to move. */
  ladderRowId: string;
  kidId: string;
  foodId: string;
  /** The rung the child was actually asked for, not the rung they end on. */
  stage: string;
  outcome: AttemptOutcome;
  /** ISO timestamp of the attempt itself, not of the replay. */
  attemptedAt: string;
  /** Local date the attempt belongs to; drives the next-due arithmetic. */
  today: string;
  mealSlot?: string | null;
  preparationMethod?: string | null;
  /** Plan entry to back-link, when the log came from the planner. */
  planEntryId?: string | null;
}

/** A direct parent edit: pause, resume, skip. Absolute, not derived. */
export interface LadderPatchOp {
  ladderRowId: string;
  patch: Partial<LadderState>;
}

/** What a replay decided to do. */
export type LadderReplayPlan =
  | { action: 'skip'; reason: 'already-applied' }
  | { action: 'skip'; reason: 'row-gone' }
  | { action: 'apply'; nextState: LadderState };

/**
 * Decide what a queued attempt should write, given what the server holds now.
 *
 * `serverState` is the CURRENT kid_food_ladder row (null when the row has since
 * been deleted); `attemptExists` is whether food_attempts already has this
 * op's attemptId. Kept free of Supabase so the conflict rule can be tested
 * directly.
 */
export function planAttemptReplay(args: {
  op: LadderAttemptOp;
  serverState: LadderState | null;
  attemptExists: boolean;
}): LadderReplayPlan {
  const { op, serverState, attemptExists } = args;

  // Already recorded: the op ran before, possibly in a previous session.
  // Re-deriving now would advance a ladder that already moved for it.
  if (attemptExists) {
    return { action: 'skip', reason: 'already-applied' };
  }

  // The food was removed from the ladder while the phone was offline. The
  // parent's later decision wins over the earlier queued exposure.
  if (!serverState) {
    return { action: 'skip', reason: 'row-gone' };
  }

  // Re-derive from the SERVER's state, never from the state captured offline.
  return {
    action: 'apply',
    nextState: applyAttemptOutcome(serverState, op.outcome, {
      today: op.today,
      attemptAt: op.attemptedAt,
    }),
  };
}

/** The food_attempts row for a queued attempt, including its dedupe id. */
export function attemptRowFromOp(op: LadderAttemptOp): Record<string, unknown> {
  return {
    id: op.attemptId,
    kid_id: op.kidId,
    food_id: op.foodId,
    stage: op.stage,
    outcome: op.outcome,
    attempted_at: op.attemptedAt,
    meal_slot: op.mealSlot ?? null,
    preparation_method: op.preparationMethod ?? null,
  };
}

/**
 * A queued op's payload is `Record<string, unknown>` by the time it comes back
 * out of storage, and storage is shared with older app builds. Validate before
 * replaying rather than trusting the shape.
 */
export function isLadderAttemptOp(value: unknown): value is LadderAttemptOp {
  if (!value || typeof value !== 'object') return false;
  const op = value as Record<string, unknown>;
  return (
    typeof op.attemptId === 'string' &&
    op.attemptId.length > 0 &&
    typeof op.ladderRowId === 'string' &&
    typeof op.kidId === 'string' &&
    typeof op.foodId === 'string' &&
    typeof op.outcome === 'string' &&
    typeof op.attemptedAt === 'string' &&
    typeof op.today === 'string'
  );
}
