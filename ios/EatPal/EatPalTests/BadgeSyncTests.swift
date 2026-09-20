import XCTest
@testable import EatPal

/// US-871: badges survive a new phone, and the merge that makes that true does
/// not lose the ones that were only ever on the old one.
///
/// Every account that used the app between US-241 and this story holds its
/// badges solely in UserDefaults. The first launch of the build that added
/// `kid_badges` finds a server with nothing on it. If that answer wins, the
/// grid clears and a year of a child's progress is gone -- from the change
/// whose entire purpose was to stop losing it.
final class BadgeSyncTests: XCTestCase {

    func testAnAccountThatPredatesTheTableUploadsEverythingAndLosesNothing() {
        // The migration case, and the one that matters most. Server empty,
        // cache full.
        let plan = BadgeSync.plan(
            local: ["first_try_bite", "five_day_streak", "veggie_explorer"],
            server: []
        )

        XCTAssertEqual(plan.download, [])
        XCTAssertEqual(plan.upload, ["first_try_bite", "five_day_streak", "veggie_explorer"])
    }

    func testANewPhoneDownloadsEverything() {
        // The story's own headline: a family gets a new phone, the cache is
        // empty, and the badges come back.
        let plan = BadgeSync.plan(local: [], server: ["first_try_bite", "ten_day_streak"])

        XCTAssertEqual(plan.download, ["first_try_bite", "ten_day_streak"])
        XCTAssertEqual(plan.upload, [])
    }

    func testTwoPhonesWithDifferentBadgesConvergeOnBoth() {
        // The second-parent case. Neither device is authoritative, so neither
        // loses. One pass leaves both holding the union.
        let plan = BadgeSync.plan(
            local: ["first_try_bite", "offline_earn"],
            server: ["first_try_bite", "partner_earn"]
        )

        XCTAssertEqual(plan.download, ["partner_earn"])
        XCTAssertEqual(plan.upload, ["offline_earn"])
    }

    func testAgreementIsNoWork() {
        // Called on every launch, so the steady state has to be free.
        let plan = BadgeSync.plan(
            local: ["first_try_bite", "ten_day_streak"],
            server: ["ten_day_streak", "first_try_bite"]
        )

        XCTAssertTrue(plan.isEmpty)
    }

    func testNothingOnEitherSideIsEverDropped() {
        // The property, stated directly: for any two sets, the cache plus the
        // downloads and the server plus the uploads both end as the union. A
        // plan that lost an id would break this whatever the case above said.
        let local: Set<String> = ["a", "b", "c"]
        let server: Set<String> = ["c", "d"]
        let plan = BadgeSync.plan(local: local, server: server)

        let union = local.union(server)
        XCTAssertEqual(local.union(plan.download), union)
        XCTAssertEqual(server.union(plan.upload), union)
    }

    func testBothSidesEmpty() {
        XCTAssertTrue(BadgeSync.plan(local: [], server: []).isEmpty)
    }

    func testAPlanIsDeterministic() {
        // Sets have no order. An unsorted plan makes the upload order vary
        // between runs, which turns a failure into one that reproduces on
        // Tuesdays.
        let first = BadgeSync.plan(local: ["z", "a", "m"], server: [])
        let second = BadgeSync.plan(local: ["m", "z", "a"], server: [])

        XCTAssertEqual(first, second)
        XCTAssertEqual(first.upload, ["a", "m", "z"])
    }

    // MARK: - The row that gets written

    func testBadgeInsertCarriesAClientIdAndSnakeCaseKeys() throws {
        let row = KidBadgeInsert(
            kidId: "33333333-3333-3333-3333-333333333333",
            badgeId: "first_try_bite",
            earnedAt: "2026-03-01T18:00:00Z"
        )
        let decoded = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(row)) as? [String: Any]
        )

        XCTAssertEqual(decoded["id"] as? String, row.id)
        XCTAssertFalse(row.id.isEmpty)
        XCTAssertEqual(decoded["kid_id"] as? String, "33333333-3333-3333-3333-333333333333")
        XCTAssertEqual(decoded["badge_id"] as? String, "first_try_bite")
        // The date the child earned it, not the date the row was written. A
        // badge uploaded by the seed is months old.
        XCTAssertEqual(decoded["earned_at"] as? String, "2026-03-01T18:00:00Z")
    }

    func testBadgeIdsAreCarriedVerbatimFromTheCatalog() {
        // AC4: a device that already holds these has to recognise what it
        // reads back, so the enum's raw values ARE the stored ids.
        for badge in Badge.allCases {
            XCTAssertEqual(badge.id, badge.rawValue)
            XCTAssertFalse(badge.id.isEmpty)
            XCTAssertLessThanOrEqual(
                badge.id.count, 64,
                "\(badge.id) is longer than the badge_id CHECK allows"
            )
        }
    }
}
