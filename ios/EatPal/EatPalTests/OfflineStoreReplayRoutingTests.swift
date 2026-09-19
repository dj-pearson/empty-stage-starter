import XCTest
@testable import EatPal

/// US-809: a queued update must reach the server or fail loudly -- never be
/// cleared as though it landed.
///
/// `replay` reads a non-throwing return as "the server has it" and deletes the
/// pending row. Its update switch used to end in `default: break`, so a
/// mutation for a table the switch did not name was marked done and discarded:
/// no error, no toast, nothing in Sentry, and the user's edit gone. `kids` and
/// `recipes` were both missing that way.
///
/// `replay` itself needs a live Supabase client, so the routing is extracted
/// into `OfflineStore.decodeUpdate` and tested here. That function is the part
/// that decides whether a queued write is understood at all, which is exactly
/// the part that was losing data.
///
/// The decoder is a plain `JSONDecoder`, which is what `replay` uses: the
/// domain structs declare their own snake_case `CodingKeys`, so no key strategy
/// is set (setting one would double-convert).
@MainActor
final class OfflineStoreReplayRoutingTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func data(_ json: String) -> Data {
        Data(json.utf8)
    }

    // MARK: - profiles (AC1)

    func testProfilesUpdateDecodesInsteadOfBeingDropped() throws {
        // What US-708 queues when onboarding finishes with no signal.
        let decoded = try OfflineStore.decodeUpdate(
            table: "profiles",
            data: data(#"{"onboarding_completed":true}"#),
            decoder: decoder
        )

        guard case .profile(let update) = decoded else {
            return XCTFail("profiles routed to \(decoded) rather than .profile")
        }
        XCTAssertEqual(update.onboardingCompleted, true)
        // Absent keys stay nil, so replaying this write cannot blank a name the
        // user set on another device.
        XCTAssertNil(update.fullName)
    }

    func testProfilesUpdateCarriesTheName() throws {
        let decoded = try OfflineStore.decodeUpdate(
            table: "profiles",
            data: data(#"{"full_name":"Sam Rivera","onboarding_completed":false}"#),
            decoder: decoder
        )

        guard case .profile(let update) = decoded else {
            return XCTFail("profiles routed to \(decoded) rather than .profile")
        }
        XCTAssertEqual(update.fullName, "Sam Rivera")
        XCTAssertEqual(update.onboardingCompleted, false)
    }

    func testProfilesIsADeclaredTable() {
        // The enum is what `enqueueUpdate` is generic over, so a missing case
        // means the write cannot even be queued.
        XCTAssertEqual(OfflineStore.Table.profiles.rawValue, "profiles")
        XCTAssertEqual(OfflineStore.Table(rawValue: "profiles"), .profiles)
    }

    // MARK: - kids (AC2)

    func testKidsUpdateDecodesInsteadOfBeingDropped() throws {
        let decoded = try OfflineStore.decodeUpdate(
            table: "kids",
            data: data(#"{"name":"Ada","pickiness_level":"moderate"}"#),
            decoder: decoder
        )

        guard case .kid(let update) = decoded else {
            return XCTFail("kids routed to \(decoded) rather than .kid")
        }
        XCTAssertEqual(update.name, "Ada")
        XCTAssertEqual(update.pickinessLevel, "moderate")
    }

    // MARK: - the unhandled table (AC3)

    func testAnUnknownTableThrowsRatherThanReportingSuccess() {
        // The whole point. A return here -- of any kind -- is read as "landed"
        // and clears the queued row.
        XCTAssertThrowsError(
            try OfflineStore.decodeUpdate(
                table: "household_members",
                data: data(#"{"role":"parent"}"#),
                decoder: decoder
            )
        ) { error in
            guard let replayError = error as? OfflineStore.ReplayError else {
                return XCTFail("expected ReplayError, got \(error)")
            }
            guard case .unsupported(let table, let operation) = replayError else {
                return XCTFail("expected .unsupported, got \(replayError)")
            }
            XCTAssertEqual(table, "household_members")
            XCTAssertEqual(operation, "update")
            // Permanent, so the drain quarantines it instead of burning five
            // passes on something that cannot start working.
            XCTAssertTrue(replayError.isPermanent)
        }
    }

    func testMalformedPayloadForAKnownTableAlsoThrows() {
        // Distinct from the unknown-table case and just as important: a payload
        // that no longer matches its struct must not be swallowed either.
        XCTAssertThrowsError(
            try OfflineStore.decodeUpdate(
                table: "profiles",
                data: data(#"{"onboarding_completed":"yes please"}"#),
                decoder: decoder
            )
        )
    }

    // MARK: - every declared table has a route

    /// Tables that carry no update payload, and why.
    ///
    /// US-609: `food_attempts` is written only by the `ladderAttempt`
    /// operation. Routing a plain update to it would skip the re-derivation
    /// the conflict rule needs, so its absence from `decodeUpdate` is the
    /// design rather than an omission.
    private static let updateExemptTables: Set<OfflineStore.Table> = [.foodAttempts]

    /// A minimal valid payload per table.
    ///
    /// Empty for every *Update struct, because each of their fields is
    /// optional -- checked here, not assumed. `kid_food_ladder` queues an
    /// absolute `LadderState` instead, whose progression fields are not
    /// optional, so it gets a whole one.
    private func minimalPayload(for table: OfflineStore.Table) -> String {
        switch table {
        case .kidFoodLadder:
            return #"{"rung":"licking","consecutiveSuccesses":1,"# +
                #""consecutiveHolds":0,"consecutiveRefusals":0,"status":"active"}"#
        default:
            return "{}"
        }
    }

    func testEveryTableInTheEnumDecodesSomething() {
        // A case added to Table without a branch in decodeUpdate would queue
        // writes that then throw on every drain until they quarantine. Driven
        // off allCases rather than a hand-written list so a new table cannot
        // be added past this guard.
        for table in OfflineStore.Table.allCases
        where !Self.updateExemptTables.contains(table) {
            XCTAssertNoThrow(
                try OfflineStore.decodeUpdate(
                    table: table.rawValue,
                    data: data(minimalPayload(for: table)),
                    decoder: decoder
                ),
                "\(table.rawValue) is a declared table with no decode branch"
            )
        }
    }

    // MARK: - kid_food_ladder (US-609)

    func testLadderUpdateDecodesToTheAbsoluteState() throws {
        // A parent's pause is absolute, unlike an exposure, which queues
        // intent and re-derives. The state round-trips into the Encodable-only
        // KidFoodLadderUpdate at replay.
        let decoded = try OfflineStore.decodeUpdate(
            table: "kid_food_ladder",
            data: data(minimalPayload(for: .kidFoodLadder)),
            decoder: decoder
        )

        guard case .ladder(let state) = decoded else {
            return XCTFail("kid_food_ladder routed to \(decoded) rather than .ladder")
        }
        XCTAssertEqual(state.rung, .licking)
        XCTAssertEqual(state.consecutiveSuccesses, 1)
        XCTAssertEqual(state.status, .active)
    }

    func testAPlainUpdateToFoodAttemptsIsRefused() {
        // The one table that must NOT have an update route: replaying an
        // exposure as a plain write would stamp arithmetic done hours ago on a
        // phone with no signal over whatever the household has since logged.
        XCTAssertThrowsError(
            try OfflineStore.decodeUpdate(
                table: "food_attempts",
                data: data("{}"),
                decoder: decoder
            )
        )
    }
}
