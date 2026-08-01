import XCTest
@testable import EatPal

/// US-597 / US-606: exposure ladder progression policy.
///
/// These are the same cases as `src/lib/exposureLadder.test.ts`, deliberately
/// so. The web and iOS ladders have to move a child identically — a parent
/// logging dinner on the phone and checking the board on a laptop must not
/// see two different answers. If one platform's rules change, one of these
/// two suites fails.
///
/// `stepsDownOnRefusal` and `autoPausesAfterTwoRefusals` are therapeutic
/// behaviour, not incidental assertions. Treat a failure as a product defect.
final class ExposureLadderPolicyTests: XCTestCase {

    private let today = "2026-08-01"

    private func state(
        _ rung: LadderRung,
        successes: Int = 0,
        holds: Int = 0,
        refusals: Int = 0,
        status: LadderStatus = .active
    ) -> LadderState {
        LadderState(
            rung: rung,
            consecutiveSuccesses: successes,
            consecutiveHolds: holds,
            consecutiveRefusals: refusals,
            status: status,
            nextDueOn: today
        )
    }

    private func run(_ start: LadderState, _ outcomes: [LadderOutcome]) -> LadderState {
        outcomes.reduce(start) { acc, outcome in
            ExposureLadderPolicy.apply(acc, outcome: outcome, today: today)
        }
    }

    // MARK: - Rung ordering

    func testRungOrderMatchesTheWebLadder() {
        XCTAssertEqual(LadderRung.allCases.count, 8)
        XCTAssertEqual(LadderRung.allCases.first, .looking)
        XCTAssertEqual(LadderRung.allCases.last, .fullPortion)
        // Raw values are the food_attempts.stage labels shared with the web app.
        XCTAssertEqual(
            LadderRung.allCases.map(\.rawValue),
            [
                "looking", "touching", "smelling", "licking",
                "tiny_taste", "small_bite", "full_bite", "full_portion",
            ]
        )
    }

    func testRungNavigationStopsAtBothEnds() {
        XCTAssertNil(LadderRung.fullPortion.next)
        XCTAssertEqual(LadderRung.looking.next, .touching)
        XCTAssertEqual(LadderRung.looking.previous, .looking)
        XCTAssertEqual(LadderRung.touching.previous, .looking)
    }

    func testUnknownRungLabelFallsBackToTheGentlestStep() {
        let row = makeRow(currentRung: "gnawed_thoughtfully")
        XCTAssertEqual(row.rung, .looking)
    }

    // MARK: - Date arithmetic

    func testAddDaysMatchesTheWebImplementation() {
        XCTAssertEqual(ExposureLadderPolicy.addDays(to: "2026-08-01", days: 2), "2026-08-03")
        XCTAssertEqual(ExposureLadderPolicy.addDays(to: "2026-08-30", days: 4), "2026-09-03")
        XCTAssertEqual(ExposureLadderPolicy.addDays(to: "2026-12-31", days: 1), "2027-01-01")
        XCTAssertEqual(ExposureLadderPolicy.addDays(to: "2028-02-28", days: 1), "2028-02-29")
    }

    // MARK: - Progression

    func testHoldsOnFirstSuccessAndAdvancesOnSecond() {
        let first = ExposureLadderPolicy.apply(state(.touching), outcome: .success, today: today)
        XCTAssertEqual(first.rung, .touching)
        XCTAssertEqual(first.consecutiveSuccesses, 1)

        let second = ExposureLadderPolicy.apply(first, outcome: .success, today: today)
        XCTAssertEqual(second.rung, .smelling)
        XCTAssertEqual(second.consecutiveSuccesses, 0)
        XCTAssertEqual(
            second.nextDueOn,
            ExposureLadderPolicy.addDays(to: today, days: ExposureLadderPolicy.repeatDays)
        )
    }

    func testHoldsTheRungOnAPartial() {
        let primed = ExposureLadderPolicy.apply(state(.licking), outcome: .success, today: today)
        let held = ExposureLadderPolicy.apply(primed, outcome: .partial, today: today)

        XCTAssertEqual(held.rung, .licking)
        XCTAssertEqual(held.consecutiveSuccesses, 0)
        XCTAssertEqual(held.consecutiveHolds, 1)
    }

    func testStepsDownOnRefusalAndRestsLongerThanANormalRepeat() {
        let refused = ExposureLadderPolicy.apply(state(.smallBite), outcome: .refused, today: today)

        XCTAssertEqual(refused.rung, .tinyTaste)
        XCTAssertEqual(
            refused.nextDueOn,
            ExposureLadderPolicy.addDays(to: today, days: ExposureLadderPolicy.cooldownDays)
        )
        XCTAssertGreaterThan(
            ExposureLadderPolicy.cooldownDays,
            ExposureLadderPolicy.repeatDays
        )
        XCTAssertEqual(refused.status, .active)
    }

    func testDoesNotUnderflowWhenRefusedAtTheBottomRung() {
        let refused = ExposureLadderPolicy.apply(state(.looking), outcome: .refused, today: today)
        XCTAssertEqual(refused.rung, .looking)
    }

    func testAutoPausesAfterTwoRefusalsWithNothingScheduled() {
        let rested = run(state(.fullBite), [.refused, .refused])

        XCTAssertEqual(rested.status, .paused)
        XCTAssertEqual(rested.pausedReason, "two_refusals")
        XCTAssertNil(rested.nextDueOn)
        // Each refusal steps down, so two in a row drops two rungs.
        XCTAssertEqual(rested.rung, .tinyTaste)
    }

    func testClearsTheRefusalStreakOnceTheChildEngagesAgain() {
        let recovered = run(state(.fullBite), [.refused, .partial])
        XCTAssertEqual(recovered.consecutiveRefusals, 0)
        XCTAssertEqual(recovered.status, .active)
    }

    func testBacksOffWithTheLongestRestOnDistress() {
        let distressed = ExposureLadderPolicy.apply(
            state(.tinyTaste), outcome: .tantrum, today: today
        )

        XCTAssertEqual(distressed.status, .backedOff)
        XCTAssertEqual(distressed.pausedReason, "distress")
        XCTAssertEqual(distressed.rung, .licking)
        XCTAssertEqual(
            distressed.nextDueOn,
            ExposureLadderPolicy.addDays(to: today, days: ExposureLadderPolicy.tantrumCooldownDays)
        )
        XCTAssertGreaterThan(
            ExposureLadderPolicy.tantrumCooldownDays,
            ExposureLadderPolicy.cooldownDays
        )
    }

    func testMastersTheFoodAtTheTopOfTheLadder() {
        let mastered = run(state(.fullPortion), [.success, .success])

        XCTAssertEqual(mastered.status, .mastered)
        XCTAssertNil(mastered.nextDueOn)
        XCTAssertEqual(mastered.rung, .fullPortion)
    }

    func testRecordsWhenTheAttemptHappened() {
        let after = ExposureLadderPolicy.apply(
            state(.looking), outcome: .success, today: today, attemptAt: "2026-07-30T18:12:00Z"
        )
        XCTAssertEqual(after.lastAttemptAt, "2026-07-30T18:12:00Z")
    }

    // MARK: - Quick log mapping (US-608)

    func testQuickLogMapsEachTapToTheSameOutcomeAsTheWeb() {
        XCTAssertEqual(QuickLogResult.accepted.outcome, .success)
        XCTAssertEqual(QuickLogResult.held.outcome, .partial)
        XCTAssertEqual(QuickLogResult.refused.outcome, .refused)

        XCTAssertEqual(QuickLogResult.accepted.planResult, "ate")
        XCTAssertEqual(QuickLogResult.held.planResult, "tasted")
        XCTAssertEqual(QuickLogResult.refused.planResult, "refused")
    }

    // MARK: - Update encoding

    func testUpdateEncodesAClearedDueDateRatherThanOmittingIt() throws {
        // A paused row must actually clear next_due_on. If the encoder skips
        // the key, the server keeps the old date and the scheduler keeps
        // serving a food the parent asked to rest.
        let paused = LadderState(
            rung: .licking, status: .paused, nextDueOn: nil, pausedReason: "parent"
        )
        let data = try JSONEncoder().encode(ExposureLadderPolicy.update(from: paused))
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )

        XCTAssertTrue(json.keys.contains("next_due_on"))
        XCTAssertTrue(json["next_due_on"] is NSNull)
    }

    func testUpdateCarriesTheDerivedStateVerbatim() throws {
        let advanced = run(state(.touching), [.success, .success])
        let data = try JSONEncoder().encode(ExposureLadderPolicy.update(from: advanced))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["current_rung"] as? String, advanced.rung.rawValue)
        XCTAssertEqual(json["status"] as? String, advanced.status.rawValue)
        XCTAssertEqual(json["next_due_on"] as? String, advanced.nextDueOn)
    }

    // MARK: - Decoding

    func testDecodesASnakeCaseRowFromSupabase() throws {
        let json = """
        {
          "id": "l1",
          "kid_id": "k1",
          "food_id": "f1",
          "current_rung": "small_bite",
          "consecutive_successes": 1,
          "consecutive_holds": 2,
          "consecutive_refusals": 0,
          "status": "active",
          "next_due_on": "2026-08-03",
          "last_attempt_at": null,
          "paired_safe_food_id": "s1",
          "preferred_prep": "raw",
          "preferred_meal_slot": "lunch",
          "paused_reason": null
        }
        """.data(using: .utf8)!

        let row = try JSONDecoder().decode(KidFoodLadder.self, from: json)
        XCTAssertEqual(row.kidId, "k1")
        XCTAssertEqual(row.rung, .smallBite)
        XCTAssertEqual(row.consecutiveHolds, 2)
        XCTAssertEqual(row.pairedSafeFoodId, "s1")
        XCTAssertEqual(row.ladderStatus, .active)
    }

    // MARK: - Helpers

    private func makeRow(currentRung: String) -> KidFoodLadder {
        KidFoodLadder(
            id: "l1",
            kidId: "k1",
            foodId: "f1",
            currentRung: currentRung,
            consecutiveSuccesses: 0,
            consecutiveHolds: 0,
            consecutiveRefusals: 0,
            status: "active",
            nextDueOn: nil,
            lastAttemptAt: nil,
            pairedSafeFoodId: nil,
            preferredPrep: nil,
            preferredMealSlot: nil,
            pausedReason: nil
        )
    }
}
