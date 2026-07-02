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

    // MARK: - US-438: tolerant timestamp parsing

    /// Postgres `timestamptz` emits whole-second values without a fraction,
    /// which an `.withFractionalSeconds` formatter rejects. The tolerant
    /// parser must handle both shapes so expiry/restock math doesn't silently
    /// treat the value as missing.
    func testParseTimestampHandlesFractionalAndWholeSeconds() throws {
        XCTAssertNotNil(ISO8601DateFormatter.parseTimestamp("2026-04-26T12:34:56.789Z"))
        XCTAssertNotNil(ISO8601DateFormatter.parseTimestamp("2026-04-26T12:34:56Z"))
        XCTAssertNil(ISO8601DateFormatter.parseTimestamp("not-a-timestamp"))
    }

    /// An invite whose whole-second expiry is in the past must read as expired
    /// (previously parsing failed and isExpired returned false).
    func testInviteCodeExpiryParsesWholeSeconds() throws {
        let past = ISO8601DateFormatter.permissiveNoFraction.string(from: Date().addingTimeInterval(-3600))
        let json = """
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "household_id": "h1",
            "code": "ABC123",
            "role": "member",
            "created_by": "u1",
            "expires_at": "\(past)"
        }
        """.data(using: .utf8)!
        let code = try JSONDecoder.supabase.decode(HouseholdInviteCode.self, from: json)
        XCTAssertTrue(code.isExpired)

        let future = ISO8601DateFormatter.permissiveNoFraction.string(from: Date().addingTimeInterval(3600))
        let futureJSON = """
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "household_id": "h1",
            "code": "XYZ789",
            "role": "member",
            "created_by": "u1",
            "expires_at": "\(future)"
        }
        """.data(using: .utf8)!
        let futureCode = try JSONDecoder.supabase.decode(HouseholdInviteCode.self, from: futureJSON)
        XCTAssertFalse(futureCode.isExpired)
    }
}
