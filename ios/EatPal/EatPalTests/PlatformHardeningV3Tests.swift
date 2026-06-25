import XCTest
@testable import EatPal

/// Tests pinning the iOS deep-dive hardening contracts (US-435+).
final class PlatformHardeningV3Tests: XCTestCase {

    // MARK: - US-436: Monday-first week boundary

    /// `startOfWeek` must land on Monday regardless of the device locale's
    /// `firstWeekday` (Sunday in en_US), matching the web planner and
    /// JoyScoreChart so the same meal never buckets into two different weeks.
    func testStartOfWeekIsMonday() throws {
        let wednesday = try XCTUnwrap(DateFormatter.isoDate.date(from: "2026-06-24"))
        let start = wednesday.startOfWeek

        // Monday is weekday 2 in the Gregorian calendar (Sunday == 1).
        let weekday = Calendar(identifier: .gregorian).component(.weekday, from: start)
        XCTAssertEqual(weekday, 2, "startOfWeek should be a Monday")

        // The input day must fall within [start, start+7).
        XCTAssertLessThanOrEqual(start, wednesday)
        let end = try XCTUnwrap(Calendar.current.date(byAdding: .day, value: 7, to: start))
        XCTAssertLessThan(wednesday, end)
    }

    func testWeekDatesStartMondayAndSpanSevenDays() throws {
        let sunday = try XCTUnwrap(DateFormatter.isoDate.date(from: "2026-06-28")) // a Sunday
        let dates = sunday.weekDates
        XCTAssertEqual(dates.count, 7)
        let firstWeekday = Calendar(identifier: .gregorian).component(.weekday, from: dates[0])
        XCTAssertEqual(firstWeekday, 2, "weekDates should begin on Monday, not Sunday")
    }

    // MARK: - US-437: forward-compatible enum decoding

    private struct AisleWrapper: Codable { let aisle: GroceryAisle }

    /// A new aisle added server-side after this build shipped must decode to
    /// `.other` rather than throwing and dropping the whole row.
    func testUnknownGroceryAisleDecodesToOther() throws {
        let json = #"{"aisle":"brand_new_server_aisle_2099"}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(AisleWrapper.self, from: json)
        XCTAssertEqual(decoded.aisle, .other)
    }

    func testKnownGroceryAisleStillDecodes() throws {
        let json = #"{"aisle":"frozen_meals"}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(AisleWrapper.self, from: json)
        XCTAssertEqual(decoded.aisle, .frozenMeals)
    }

    func testGroceryAisleRoundTripsThroughEncoding() throws {
        let original = AisleWrapper(aisle: .ethnicAsian)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(AisleWrapper.self, from: data)
        XCTAssertEqual(decoded.aisle, .ethnicAsian)
    }
}
