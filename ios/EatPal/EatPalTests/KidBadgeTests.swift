import XCTest
@testable import EatPal

/// US-249: kid_badges decode (explicit snake_case CodingKeys, like the other
/// models) + earned-at parsing.
final class KidBadgeTests: XCTestCase {

    func testDecodesFromSnakeCasePayload() throws {
        let json = """
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "kid_id": "kid-1",
            "badge_id": "fiveDayStreak",
            "earned_at": "2026-01-02T03:04:05Z",
            "household_id": "house-1"
        }
        """.data(using: .utf8)!

        // RealtimeService decodes with JSONDecoder.supabase (no
        // convertFromSnakeCase) — the explicit CodingKeys must match.
        let badge = try JSONDecoder.supabase.decode(KidBadge.self, from: json)
        XCTAssertEqual(badge.kidId, "kid-1")
        XCTAssertEqual(badge.badgeId, "fiveDayStreak")
        XCTAssertEqual(badge.householdId, "house-1")
        XCTAssertNotNil(badge.earnedDate)
    }

    func testEarnedDateParsesFractionalSeconds() {
        var badge = KidBadge(id: "1", kidId: "k", badgeId: "b", earnedAt: "2026-01-02T03:04:05.123Z", householdId: nil)
        XCTAssertNotNil(badge.earnedDate, "fractional-seconds timestamp should parse")
        badge.earnedAt = "not-a-date"
        XCTAssertNil(badge.earnedDate)
    }
}
