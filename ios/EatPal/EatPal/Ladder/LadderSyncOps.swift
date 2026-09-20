import Foundation

/// US-609: what a queued exposure replays, given what the server holds by the
/// time it runs.
///
/// A kitchen with bad signal is the normal case for this feature, so a logged
/// exposure has to survive the app being closed before it reaches Supabase.
/// Until now it did not: `OfflineStore.Table` covered foods, kids, recipes,
/// plan_entries and grocery_items, so a ladder write could not be queued at
/// all and an attempt logged offline was simply lost.
///
/// These rules are the Swift half of `src/lib/ladderSyncOps.ts`, which was
/// written and tested first precisely so they would not be derived twice --
/// the same arrangement `ExposureLadderPolicy` already has with
/// `src/lib/exposureLadder.ts`. Pure on purpose: the conflict rule is the part
/// worth testing, and it should not need a Supabase client to exercise.
///
/// WHY THE QUEUE CARRIES INTENT, NOT THE COMPUTED ROW
///
/// `quickLogExposure` computes the next ladder state locally and PUTs it.
/// Queueing that computed row would replay a snapshot built from state that
/// may be hours stale: if the other parent logged an attempt from their phone
/// in the meantime, the replay would stamp the older rung back over the newer
/// one. So the op carries the INTENT -- which rung was offered, what the child
/// did -- and the replay re-derives from whatever the server row says at
/// replay time. `ExposureLadderPolicy.apply` is pure, so re-deriving is exact.
/// That matches the load-precedence contract in CLAUDE.md: a successful server
/// read always wins, and queued local writes then re-apply on top of it.
///
/// KNOWN GAP, DELIBERATELY CHOSEN
///
/// The attempt insert and the ladder update are two statements, not one
/// transaction. If the process dies between them, a later replay sees the
/// attempt already present and skips the ladder move, so the rung stays where
/// it was. The exposure is still recorded and the next log recomputes from
/// real server state, so the ladder self-corrects. This errs toward
/// under-applying rather than double-advancing, which is the direction that
/// matters here: a ladder that skipped forward puts a child in front of a food
/// they have not earned, while one that lagged costs one extra exposure.
/// Closing it entirely needs both writes in one RPC.

/// The intent of one quick log: everything a replay needs to redo it.
///
/// `attemptId` is generated on the client and is the dedupe key that makes
/// replay exactly-once. `food_attempts.id` is `UUID PRIMARY KEY DEFAULT
/// gen_random_uuid()` and accepts a supplied value, so this needs no
/// migration -- proved against PostgreSQL in
/// `supabase/diagnostics/us-609-attempt-replay-check.sql`.
struct LadderAttemptOp: Codable, Equatable {
    /// Client-generated uuid; the dedupe key.
    var attemptId: String
    /// `kid_food_ladder.id` -- the row to move.
    var ladderRowId: String
    var kidId: String
    var foodId: String
    /// The rung the child was actually asked for, not the rung they end on.
    var stage: String
    var outcome: LadderOutcome
    /// ISO timestamp of the attempt itself, not of the replay.
    var attemptedAt: String
    /// Local date the attempt belongs to; drives the next-due arithmetic.
    /// Captured at log time so a replay days later does not schedule from the
    /// wrong day.
    var today: String
    var mealSlot: String?
    var preparationMethod: String?
    /// Plan entry to back-link, when the log came from the planner.
    var planEntryId: String?
}

/// What a replay decided to do.
enum LadderReplayPlan: Equatable {
    /// The attempt is already on the server: it ran before, possibly in a
    /// previous session. Re-deriving would advance a ladder that already moved.
    case skipAlreadyApplied
    /// The food was removed from the ladder while the phone was offline. The
    /// parent's later decision wins over the earlier queued exposure.
    case skipRowGone
    case apply(LadderState)
}

enum LadderSyncOps {
    /// Decide what a queued attempt should write, given what the server holds
    /// now.
    ///
    /// `serverState` is the CURRENT `kid_food_ladder` row, nil when it has
    /// since been deleted. `attemptExists` is whether `food_attempts` already
    /// carries this op's `attemptId`.
    static func planAttemptReplay(
        op: LadderAttemptOp,
        serverState: LadderState?,
        attemptExists: Bool
    ) -> LadderReplayPlan {
        if attemptExists { return .skipAlreadyApplied }
        guard let serverState else { return .skipRowGone }

        // Re-derive from the SERVER's state, never from the state captured
        // offline. This is the whole conflict rule.
        return .apply(
            ExposureLadderPolicy.apply(
                serverState,
                outcome: op.outcome,
                today: op.today,
                attemptAt: op.attemptedAt
            )
        )
    }

    /// The `food_attempts` row for a queued attempt, carrying its dedupe id.
    static func attemptRow(from op: LadderAttemptOp) -> FoodAttemptInsert {
        FoodAttemptInsert(
            id: op.attemptId,
            kidId: op.kidId,
            foodId: op.foodId,
            stage: op.stage,
            outcome: op.outcome.rawValue,
            attemptedAt: op.attemptedAt,
            mealSlot: op.mealSlot,
            preparationMethod: op.preparationMethod
        )
    }

    /// Whether a failed write hit a uniqueness constraint.
    ///
    /// Both of this feature's idempotency signals are unique violations, and
    /// they are DIFFERENT constraints on different keys: `food_attempts.id`
    /// (primary key) and `kid_food_ladder (kid_id, food_id)` (unique index).
    /// Both must be swallowed as success. A queue that retries one spins on an
    /// already-applied op forever, which is worse than the duplicate it is
    /// trying to avoid.
    ///
    /// Matched on the rendered error rather than a typed `PostgrestError`
    /// field: the concrete error type supabase-swift surfaces has changed
    /// shape across 2.x, and this must not start silently returning false on a
    /// dependency bump. Both the SQLSTATE and Postgres's own wording are
    /// checked so either one alone is enough.
    static func isUniqueViolation(_ error: Error) -> Bool {
        isUniqueViolation(describing: String(describing: error))
    }

    /// Split out so the matching can be tested without constructing a
    /// PostgREST error, which needs the network layer.
    static func isUniqueViolation(describing text: String) -> Bool {
        let lowered = text.lowercased()
        return lowered.contains("23505") || lowered.contains("duplicate key")
    }
}
