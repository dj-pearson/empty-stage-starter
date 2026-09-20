import XCTest
@testable import EatPal

/// US-853: a meal logged by voice counts the same as one tapped in the app.
///
/// `LogMealResultIntent` wrote `plan_entries.result` straight through
/// `DataService` and skipped everything `AppState.updatePlanEntry` does
/// afterwards. US-144 fixed the HealthKit half. Badges were the part left
/// over, and they were the harder one: an earn surfaces through a celebration
/// sheet, and the intent runs with the app in the background where there is no
/// sheet to show. So a parent who logs dinner with Siri all week earned
/// nothing, and nothing said so.
@MainActor
final class SiriMealBadgeTests: XCTestCase {

    /// A kid id nothing else has used, because BadgeService keys its cache by
    /// it and the store is the real UserDefaults.
    private var kidId = ""

    override func setUp() {
        super.setUp()
        kidId = UUID().uuidString
        BadgeService.shared.dismissCelebration()
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: "badges.\(kidId).earned")
        for badge in Badge.allCases {
            UserDefaults.standard.removeObject(forKey: "badges.\(kidId).earnedAt.\(badge.id)")
        }
        BadgeService.shared.dismissCelebration()
        super.tearDown()
    }

    private func entry(
        id: String = UUID().uuidString,
        foodId: String,
        result: String?,
        date: String = "2026-09-19"
    ) -> PlanEntry {
        PlanEntry(
            id: id,
            userId: "user",
            householdId: nil,
            kidId: kidId,
            date: date,
            mealSlot: "dinner",
            foodId: foodId,
            recipeId: nil,
            result: result
        )
    }

    // MARK: - AC1: a Siri log advances badges

    func testASiriLoggedMealEarnsTheBadgeItShould() {
        let logged = entry(foodId: "food-1", result: MealResult.ate.rawValue)

        XCTAssertFalse(BadgeService.shared.hasEarned(.firstTryBite, kidId: kidId))

        BadgeService.shared.evaluate(
            kidId: kidId,
            foods: [],
            recipes: [],
            planEntries: [logged]
        )

        XCTAssertTrue(
            BadgeService.shared.hasEarned(.firstTryBite, kidId: kidId),
            "a meal logged by voice earned nothing"
        )
    }

    func testLoggingTheSameMealTwiceAwardsItOnce() {
        // Siri repeats happen -- the phrase is easy to say twice, and a
        // Shortcut can be run again. A second award would re-fire the
        // celebration for a badge the child already has.
        let logged = entry(id: "entry-1", foodId: "food-1", result: MealResult.ate.rawValue)

        BadgeService.shared.evaluate(kidId: kidId, foods: [], recipes: [], planEntries: [logged])
        let earnedAt = BadgeService.shared.earnedAt(.firstTryBite, kidId: kidId)
        BadgeService.shared.dismissCelebration()

        BadgeService.shared.evaluate(kidId: kidId, foods: [], recipes: [], planEntries: [logged])

        XCTAssertEqual(
            BadgeService.shared.earnedIds(forKid: kidId).count, 1,
            "the same meal logged twice awarded the badge twice"
        )
        XCTAssertEqual(
            BadgeService.shared.earnedAt(.firstTryBite, kidId: kidId), earnedAt,
            "the second log moved the date the child earned it"
        )
        XCTAssertNil(
            BadgeService.shared.pendingCelebration,
            "re-logging re-celebrated a badge the child already had"
        )
    }

    func testASiriLogThatMeetsNoCriteriaEarnsNothing() {
        // A refusal is a real log and still progress worth recording, but it
        // is not a try-bite and must not award one.
        let refused = entry(foodId: "food-1", result: MealResult.refused.rawValue)

        BadgeService.shared.evaluate(kidId: kidId, foods: [], recipes: [], planEntries: [refused])

        XCTAssertTrue(BadgeService.shared.earnedIds(forKid: kidId).isEmpty)
        XCTAssertNil(BadgeService.shared.pendingCelebration)
    }

    // MARK: - AC2: the entries the evaluation sees

    func testTheProjectionAppliesTheNewResultBeforeEvaluating() {
        // The intent holds the PRE-update rows. Evaluating against those
        // awards nothing, because every criterion reads `result` -- and the
        // log itself still succeeds, so the failure is silent.
        let stale = entry(id: "entry-1", foodId: "food-1", result: nil)
        let other = entry(id: "entry-2", foodId: "food-2", result: nil)

        let projected = MealResultProjection.applying(
            MealResult.ate.rawValue,
            to: [stale, other],
            matching: [stale]
        )

        XCTAssertEqual(projected.first { $0.id == "entry-1" }?.result, MealResult.ate.rawValue)
        XCTAssertNil(
            projected.first { $0.id == "entry-2" }?.result,
            "an entry the intent did not write was changed anyway"
        )
        XCTAssertEqual(projected.count, 2, "the projection dropped an entry")
    }

    func testTheProjectionLeavesEverythingElseAlone() {
        let untouched = entry(id: "entry-9", foodId: "food-9", result: MealResult.tasted.rawValue)

        let projected = MealResultProjection.applying(
            MealResult.refused.rawValue,
            to: [untouched],
            matching: []
        )

        XCTAssertEqual(projected, [untouched])
    }

    // MARK: - AC3: the celebration outlives the process

    func testABadgeEarnedWithNothingOnScreenSurfacesOnTheNextLaunch() {
        // The intent runs in the app's process but usually with the app
        // backgrounded, and @Published state dies with that process. A child
        // earning their first badge and nobody ever seeing it is the failure
        // this guards.
        BadgeService.shared.parkCelebration(
            badgeId: Badge.firstTryBite.id,
            kidId: kidId,
            earnedAt: Date(timeIntervalSince1970: 1_758_240_000)
        )
        BadgeService.shared.pendingCelebration = nil

        BadgeService.shared.restoreParkedCelebration()

        let restored = BadgeService.shared.pendingCelebration
        XCTAssertEqual(restored?.badge, .firstTryBite)
        XCTAssertEqual(restored?.kidId, kidId)
        // The date the child earned it, not the date the app happened to open.
        XCTAssertEqual(restored?.earnedAt, Date(timeIntervalSince1970: 1_758_240_000))
    }

    func testDismissingClearsTheParkedCopyToo() {
        // Otherwise the same badge is celebrated again on the next launch,
        // which reads as a bug and devalues the next real one.
        BadgeService.shared.parkCelebration(
            badgeId: Badge.firstTryBite.id,
            kidId: kidId,
            earnedAt: Date()
        )
        BadgeService.shared.dismissCelebration()

        BadgeService.shared.restoreParkedCelebration()
        XCTAssertNil(BadgeService.shared.pendingCelebration)
    }

    func testRestoreDoesNotClobberACelebrationAlreadyShowing() {
        // An earn that just happened in-app is the more recent one; swapping
        // the badge mid-animation would show the wrong one.
        BadgeService.shared.parkCelebration(
            badgeId: Badge.firstTryBite.id,
            kidId: kidId,
            earnedAt: Date()
        )
        let live = BadgeService.Earned(badge: .weekWarrior, kidId: kidId, earnedAt: Date())
        BadgeService.shared.pendingCelebration = live

        BadgeService.shared.restoreParkedCelebration()

        XCTAssertEqual(BadgeService.shared.pendingCelebration?.badge, .weekWarrior)
    }

    func testAnUnknownParkedBadgeIsDroppedRatherThanKeptForever() {
        // It can only come from a newer build on the same device, and there is
        // nothing to draw for it.
        BadgeService.shared.parkCelebration(
            badgeId: "badge_from_a_future_release",
            kidId: kidId,
            earnedAt: Date()
        )
        BadgeService.shared.pendingCelebration = nil

        BadgeService.shared.restoreParkedCelebration()

        XCTAssertNil(BadgeService.shared.pendingCelebration)
    }

    // MARK: - AC4: the surface is distinguishable

    func testTheLoggedEventCarriesWhichSurfaceItCameFrom() {
        let voice = AnalyticsEvent.mealResultLogged(result: "ate", kidId: kidId, via: .voice)
        let tap = AnalyticsEvent.mealResultLogged(result: "ate", kidId: kidId, via: .manual)

        XCTAssertEqual(voice.name, tap.name, "the two surfaces must aggregate as one event")
        XCTAssertEqual(voice.properties["via"], "voice")
        XCTAssertEqual(tap.properties["via"], "manual")
        // The kid id is hashed on both, as every event in this file requires.
        XCTAssertNotEqual(voice.properties["kid_id"], kidId)
        XCTAssertEqual(voice.properties["kid_id"], tap.properties["kid_id"])
    }
}
