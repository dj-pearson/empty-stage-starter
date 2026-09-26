import XCTest
@testable import EatPal

/// The parent's logging streak, week meter and recap. Same cases as
/// src/lib/familyRhythm.test.ts, so the phone and the web cannot drift.
final class FamilyRhythmTests: XCTestCase {

    /// A Thursday.
    private let today = "2026-09-24"

    private func back(_ offsets: Int...) -> Set<String> {
        Set(offsets.map { FamilyRhythm.addDays(today, -$0) })
    }

    /// The rule stated the slow way: walk back from `today` (neutral when
    /// unlogged), count logged days, forgive a miss when it is the first one
    /// met or at least `graceSpacingDays` before the previous forgiven miss.
    private func referenceStreak(_ days: Set<String>, today: String) -> Int {
        guard let earliest = days.min() else { return 0 }
        var count = 0
        var laterMiss: String?
        var day = today
        while day >= earliest {
            defer { day = FamilyRhythm.addDays(day, -1) }
            if days.contains(day) {
                count += 1
                continue
            }
            if day == today { continue }
            if let later = laterMiss, FamilyRhythm.dayDiff(day, later) < FamilyRhythm.graceSpacingDays { break }
            laterMiss = day
        }
        return count
    }

    // MARK: - Day strings

    func testDayArithmeticRunsOnStrings() {
        XCTAssertEqual(FamilyRhythm.addDays("2026-03-07", 2), "2026-03-09")
        XCTAssertEqual(FamilyRhythm.addDays("2026-01-01", -1), "2025-12-31")
        XCTAssertEqual(FamilyRhythm.dayDiff("2026-09-20", "2026-09-27"), 7)
        XCTAssertEqual(FamilyRhythm.mondayOf(today), "2026-09-21")
        XCTAssertEqual(FamilyRhythm.mondayOf("2026-09-27"), "2026-09-21") // Sunday
        XCTAssertEqual(FamilyRhythm.mondayOf("2026-09-21"), "2026-09-21")
    }

    func testLocalDayPlacesAnInstantInTheGivenZone() {
        let la = TimeZone(identifier: "America/Los_Angeles")!
        XCTAssertEqual(FamilyRhythm.localDay("2026-09-25T02:00:00+00:00", timeZone: la), "2026-09-24")
        XCTAssertEqual(FamilyRhythm.localDay("2026-09-25T02:00:00.123456+00:00", timeZone: la), "2026-09-24")
        XCTAssertEqual(FamilyRhythm.localDay("2026-09-24"), "2026-09-24")
        XCTAssertNil(FamilyRhythm.localDay("not a date"))
    }

    // MARK: - Streak

    func testZeroWithNothingLogged() {
        let s = FamilyRhythm.parentStreak(days: [], today: today)
        XCTAssertEqual(s.current, 0)
        XCTAssertFalse(s.atRisk)
    }

    func testCountsConsecutiveDaysIncludingToday() {
        let s = FamilyRhythm.parentStreak(days: back(0, 1, 2, 3), today: today)
        XCTAssertEqual(s.current, 4)
        XCTAssertTrue(s.loggedToday)
        XCTAssertNil(s.graceReadyOn)
    }

    func testAnUnloggedTodayIsNotAMiss() {
        let s = FamilyRhythm.parentStreak(days: back(1, 2, 3), today: today)
        XCTAssertEqual(s.current, 3)
        XCTAssertFalse(s.atRisk)
    }

    func testForgivesOneMissAndSaysWhenTheNextGraceDayIsReady() {
        let s = FamilyRhythm.parentStreak(days: back(0, 1, 3, 4, 5), today: today)
        XCTAssertEqual(s.current, 5)
        XCTAssertEqual(s.graceReadyOn, FamilyRhythm.addDays(today, -2 + FamilyRhythm.graceSpacingDays))
    }

    func testEndsOnASecondMissInsideTheWindow() {
        let s = FamilyRhythm.parentStreak(days: back(0, 1, 3, 4, 6, 7, 8), today: today)
        XCTAssertEqual(s.current, 4)
        XCTAssertEqual(s.best, 5)
    }

    func testForgivesMissesAWeekApart() {
        let s = FamilyRhythm.parentStreak(days: back(0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14), today: today)
        XCTAssertEqual(s.current, 14)
    }

    func testFlagsAStreakAtRiskWhenYesterdayUsedTheGraceDay() {
        let s = FamilyRhythm.parentStreak(days: back(2, 3, 4), today: today)
        XCTAssertEqual(s.current, 3)
        XCTAssertTrue(s.atRisk)
    }

    func testMatchesTheWalkBackReferenceOnRandomHistories() {
        var seed: UInt64 = 7
        func nextRandom() -> Double {
            seed = (seed &* 6364136223846793005) &+ 1442695040888963407
            return Double(seed >> 11) / Double(UInt64(1) << 53)
        }
        for run in 0..<300 {
            let density = 0.4 + nextRandom() * 0.55
            var days: Set<String> = []
            for i in 0..<80 where nextRandom() < density {
                days.insert(FamilyRhythm.addDays(today, -i))
            }
            XCTAssertEqual(
                FamilyRhythm.parentStreak(days: days, today: today).current,
                referenceStreak(days, today: today),
                "run \(run)"
            )
        }
    }

    // MARK: - Week

    func testWeekMeterRunsMondayToSunday() {
        let m = FamilyRhythm.weekMeter(days: ["2026-09-21", "2026-09-23", "2026-09-20"], today: today)
        XCTAssertEqual(m.cells.map(\.day), [
            "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24",
            "2026-09-25", "2026-09-26", "2026-09-27",
        ])
        XCTAssertEqual(m.loggedCount, 2)
        XCTAssertEqual(m.goal, FamilyRhythm.weeklyGoalDays)
        XCTAssertFalse(m.reached)
        XCTAssertTrue(m.cells[3].isToday)
        XCTAssertTrue(m.cells[4].isFuture)
    }

    // MARK: - Recap

    func testRecapCountsLastWeekAndOnlyFirstEverOffersAsNew() {
        func a(_ day: String, _ food: String, _ outcome: String = "refused", kid: String = "kid-a") -> FamilyRhythm.Attempt {
            FamilyRhythm.Attempt(kidId: kid, foodId: food, day: day, outcome: outcome)
        }
        let recap = FamilyRhythm.lastWeekRecap(attempts: [
            a("2026-09-01", "pea"),
            a("2026-09-15", "pea", "success"),
            a("2026-09-16", "carrot", "partial"),
            a("2026-09-16", "carrot", kid: "kid-b"),
            a("2026-09-20", "kiwi"),
            a("2026-09-22", "fig"),
        ], today: today)
        XCTAssertEqual(recap, FamilyRhythm.Recap(
            startDay: "2026-09-14",
            endDay: "2026-09-20",
            daysLogged: 3,
            offers: 4,
            newFoodsOffered: 3,
            accepted: 2
        ))
    }

    func testARowWithoutADateIsDropped() {
        let row = RhythmAttemptRow(kidId: "k", foodId: "f", attemptedAt: nil, outcome: "refused")
        XCTAssertNil(row.attempt())
    }
}
