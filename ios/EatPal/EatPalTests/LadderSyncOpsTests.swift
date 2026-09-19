import XCTest
@testable import EatPal

/// US-609: an exposure logged in a kitchen with bad signal has to survive, and
/// it has to land on the ladder the rest of the household has since moved.
///
/// The cases here are the ones `src/lib/ladderSyncOps.test.ts` pins on the
/// TypeScript side, so the two halves of the contract cannot drift: already
/// applied, row gone, derive-from-server-not-from-offline, no double advance,
/// and refusal counters folding into the server's count.
///
/// Everything under test is pure. `OfflineStore.replayLadderAttempt` does the
/// reads and the two writes, but the decision it makes is `planAttemptReplay`,
/// and that is the part where getting it wrong drags a child back to a rung
/// they have already passed.
final class LadderSyncOpsTests: XCTestCase {

    private func op(
        outcome: LadderOutcome = .success,
        stage: String = LadderRung.looking.rawValue,
        attemptId: String = "11111111-1111-1111-1111-111111111111"
    ) -> LadderAttemptOp {
        LadderAttemptOp(
            attemptId: attemptId,
            ladderRowId: "22222222-2222-2222-2222-222222222222",
            kidId: "33333333-3333-3333-3333-333333333333",
            foodId: "44444444-4444-4444-4444-444444444444",
            stage: stage,
            outcome: outcome,
            attemptedAt: "2026-09-19T18:30:00Z",
            today: "2026-09-19",
            mealSlot: "dinner",
            preparationMethod: "roasted",
            planEntryId: nil
        )
    }

    // MARK: - Skips

    func testAlreadyAppliedAttemptWritesNothing() {
        // The op ran in a previous session. Re-deriving now would advance a
        // ladder that has already moved for this exact exposure.
        let plan = LadderSyncOps.planAttemptReplay(
            op: op(),
            serverState: LadderState(rung: .looking, consecutiveSuccesses: 1),
            attemptExists: true
        )

        XCTAssertEqual(plan, .skipAlreadyApplied)
    }

    func testAlreadyAppliedWinsEvenWhenTheRowIsGone() {
        // Order matters: both conditions can hold at once, and "already
        // applied" is the honest reason.
        let plan = LadderSyncOps.planAttemptReplay(
            op: op(),
            serverState: nil,
            attemptExists: true
        )

        XCTAssertEqual(plan, .skipAlreadyApplied)
    }

    func testAttemptForARemovedLadderRowIsDropped() {
        // The parent took the food off the ladder while the phone was
        // offline. Their later decision wins over the earlier queued exposure
        // -- recreating the row here would resurrect something they removed.
        let plan = LadderSyncOps.planAttemptReplay(
            op: op(),
            serverState: nil,
            attemptExists: false
        )

        XCTAssertEqual(plan, .skipRowGone)
    }

    // MARK: - The conflict rule

    func testDerivesFromTheServerRowAndNotFromTheStateCapturedOffline() {
        // The phone logged this at `looking`. By the time it replays, the
        // other parent has moved the food to `licking`. Stamping the offline
        // arithmetic back would drag the child down two rungs.
        let plan = LadderSyncOps.planAttemptReplay(
            op: op(outcome: .success, stage: LadderRung.looking.rawValue),
            serverState: LadderState(rung: .licking, consecutiveSuccesses: 0),
            attemptExists: false
        )

        guard case .apply(let next) = plan else {
            return XCTFail("expected an apply, got \(plan)")
        }
        XCTAssertEqual(next.rung, .licking, "the server's rung is the base, not the op's stage")
        XCTAssertEqual(next.consecutiveSuccesses, 1)
    }

    func testAdvancesExactlyOneRungWhenTheServerIsAtTheThreshold() {
        // One success already on the server plus this one meets
        // advanceThreshold: up one rung, counter reset. Not two.
        let plan = LadderSyncOps.planAttemptReplay(
            op: op(outcome: .success),
            serverState: LadderState(rung: .looking, consecutiveSuccesses: 1),
            attemptExists: false
        )

        guard case .apply(let next) = plan else {
            return XCTFail("expected an apply, got \(plan)")
        }
        XCTAssertEqual(next.rung, .touching)
        XCTAssertEqual(next.consecutiveSuccesses, 0)
    }

    func testDoesNotAdvanceWhenTheServerHasNotSeenTheEarlierSuccess() {
        // The mirror of the case above, and the reason the conflict rule is
        // worth the two reads. Locally this phone thought it was at one
        // success; the server says zero. Folding onto the server's count
        // holds the rung instead of advancing on a success that is not there.
        let plan = LadderSyncOps.planAttemptReplay(
            op: op(outcome: .success),
            serverState: LadderState(rung: .looking, consecutiveSuccesses: 0),
            attemptExists: false
        )

        guard case .apply(let next) = plan else {
            return XCTFail("expected an apply, got \(plan)")
        }
        XCTAssertEqual(next.rung, .looking)
        XCTAssertEqual(next.consecutiveSuccesses, 1)
    }

    func testRefusalCountersFoldIntoTheServersCount() {
        // Another device already logged one refusal. This queued one is the
        // second in a row, so the food rests until a parent resumes it --
        // which the offline computation, starting from zero, would have
        // missed entirely.
        let plan = LadderSyncOps.planAttemptReplay(
            op: op(outcome: .refused, stage: LadderRung.licking.rawValue),
            serverState: LadderState(rung: .licking, consecutiveRefusals: 1),
            attemptExists: false
        )

        guard case .apply(let next) = plan else {
            return XCTFail("expected an apply, got \(plan)")
        }
        XCTAssertEqual(next.consecutiveRefusals, 2)
        XCTAssertEqual(next.status, .paused)
        XCTAssertEqual(next.pausedReason, "two_refusals")
        XCTAssertNil(next.nextDueOn, "a paused food is not scheduled")
        XCTAssertEqual(next.rung, .smelling, "a refusal steps back one rung")
    }

    func testAttemptTimeIsTheAttemptsOwnNotTheReplays() {
        // A replay days later must not backdate or forward-date the exposure.
        let plan = LadderSyncOps.planAttemptReplay(
            op: op(outcome: .partial),
            serverState: LadderState(rung: .touching),
            attemptExists: false
        )

        guard case .apply(let next) = plan else {
            return XCTFail("expected an apply, got \(plan)")
        }
        XCTAssertEqual(next.lastAttemptAt, "2026-09-19T18:30:00Z")
        // repeatDays from the day the attempt happened, not from replay day.
        XCTAssertEqual(next.nextDueOn, "2026-09-21")
    }

    // MARK: - The row that gets written

    func testAttemptRowCarriesTheClientIdAndTheRungThatWasOffered() {
        let row = LadderSyncOps.attemptRow(from: op(outcome: .refused, stage: "licking"))

        XCTAssertEqual(row.id, "11111111-1111-1111-1111-111111111111")
        // The attempt records what the child was ASKED for, not where the
        // ladder lands afterwards. Getting this backwards corrupts the history
        // the ladder is derived from.
        XCTAssertEqual(row.stage, "licking")
        XCTAssertEqual(row.outcome, "refused")
        XCTAssertEqual(row.attemptedAt, "2026-09-19T18:30:00Z")
        XCTAssertEqual(row.mealSlot, "dinner")
        XCTAssertEqual(row.preparationMethod, "roasted")
    }

    func testAttemptInsertSendsItsIdSoAReplayIsExactlyOnce() throws {
        let json = try JSONEncoder().encode(LadderSyncOps.attemptRow(from: op()))
        let decoded = try XCTUnwrap(
            JSONSerialization.jsonObject(with: json) as? [String: Any]
        )

        // The whole idempotency story rests on the client picking this. If the
        // column default fills it instead, a replay inserts a second exposure
        // and the ladder moves twice for one dinner.
        XCTAssertEqual(decoded["id"] as? String, "11111111-1111-1111-1111-111111111111")
        XCTAssertEqual(decoded["kid_id"] as? String, "33333333-3333-3333-3333-333333333333")
    }

    func testLadderInsertSendsAClientId() throws {
        let row = KidFoodLadderInsert(kidId: "kid", foodId: "food")
        let json = try JSONEncoder().encode(row)
        let decoded = try XCTUnwrap(
            JSONSerialization.jsonObject(with: json) as? [String: Any]
        )

        XCTAssertEqual(decoded["id"] as? String, row.id)
        XCTAssertFalse(row.id.isEmpty)
    }

    // MARK: - Idempotency signals

    func testUniqueViolationIsRecognisedFromTheSqlstate() {
        XCTAssertTrue(
            LadderSyncOps.isUniqueViolation(
                describing: #"PostgrestError(detail: nil, hint: nil, code: Optional("23505"), message: "...")"#
            )
        )
    }

    func testUniqueViolationIsRecognisedFromPostgresWording() {
        // Either signal alone is enough, so a dependency bump that stops
        // surfacing the code does not turn this silently into false -- which
        // would make the queue spin forever on an op that already landed.
        XCTAssertTrue(
            LadderSyncOps.isUniqueViolation(
                describing: "duplicate key value violates unique constraint \"food_attempts_pkey\""
            )
        )
        XCTAssertTrue(
            LadderSyncOps.isUniqueViolation(
                describing: "duplicate key value violates unique constraint "
                    + "\"kid_food_ladder_kid_food_unique\""
            )
        )
    }

    func testAnOrdinaryFailureIsNotTreatedAsAlreadyLanded() {
        // The dangerous direction: swallowing a real error as success clears
        // the queued exposure and loses it.
        XCTAssertFalse(LadderSyncOps.isUniqueViolation(describing: "The request timed out."))
        XCTAssertFalse(
            LadderSyncOps.isUniqueViolation(
                describing: #"PostgrestError(code: Optional("42501"), message: "permission denied")"#
            )
        )
    }

    // MARK: - Round trip through the queue

    func testOpSurvivesEncodingAndDecoding() throws {
        // The payload sits in SwiftData between the tap and the reconnect. A
        // field lost here is an exposure that replays wrong.
        let original = op(outcome: .tantrum, stage: "tiny_taste")
        let decoded = try JSONDecoder().decode(
            LadderAttemptOp.self,
            from: JSONEncoder().encode(original)
        )

        XCTAssertEqual(decoded, original)
    }
}
