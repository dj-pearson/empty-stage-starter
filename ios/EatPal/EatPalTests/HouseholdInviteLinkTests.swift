import XCTest
@testable import EatPal

/// US-851: an invite link tapped on an iPhone opens the app on the household
/// it points at, and survives everything between the tap and a session
/// existing.
///
/// The AASA and the Swift router are one contract split across two languages;
/// `src/lib/appSiteAssociation.test.ts` holds them together. These cover the
/// app's side: what a tapped link parses to, and what happens to the code in
/// the gap before anyone is signed in — which is the normal case, because an
/// invite is usually the first EatPal link a person ever receives.
@MainActor
final class HouseholdInviteLinkTests: XCTestCase {
    private var handler: DeepLinkHandler { DeepLinkHandler.shared }

    override func setUp() {
        super.setUp()
        handler.clearDestination()
        HouseholdInviteLink.clearPending()
    }

    override func tearDown() {
        handler.clearDestination()
        HouseholdInviteLink.clearPending()
        super.tearDown()
    }

    private func route(_ string: String) -> DeepLinkHandler.Destination? {
        handler.clearDestination()
        handler.handle(url: URL(string: string)!)
        return handler.activeDestination
    }

    // MARK: - AC1, AC6: the link itself

    func testInviteWithACodeOpensTheJoinFlow() {
        XCTAssertEqual(
            route("https://tryeatpal.com/join?code=ABC123"),
            .joinHousehold(code: "ABC123")
        )
    }

    func testInviteWithoutACodeSaysSoRatherThanDoingNothing() {
        // A truncated paste is a real case. Falling through would leave the
        // tap doing nothing at all -- worse than not opening the app, because
        // Safari no longer gets the link either.
        XCTAssertEqual(route("https://tryeatpal.com/join"), .joinHousehold(code: nil))
        XCTAssertEqual(route("https://tryeatpal.com/join?code="), .joinHousehold(code: nil))
    }

    func testTheWwwHostWorksToo() {
        // Both hosts are in the associated-domains entitlement, so both arrive
        // at the handler.
        XCTAssertEqual(
            route("https://www.tryeatpal.com/join?code=ABC123"),
            .joinHousehold(code: "ABC123")
        )
    }

    func testACodeIsNormalisedTheWayTheWebNormalisesIt() {
        // accept_household_invite compares the code uppercased, and
        // parseInviteCode on the web trims and uppercases before sending. A
        // code read off a text message is the same code in either client.
        XCTAssertEqual(
            route("https://tryeatpal.com/join?code=abc123"),
            .joinHousehold(code: "ABC123")
        )
        XCTAssertEqual(HouseholdInviteLink.normalise("  abc123  "), "ABC123")
        XCTAssertNil(HouseholdInviteLink.normalise("   "))
        XCTAssertNil(HouseholdInviteLink.normalise(nil))
    }

    // MARK: - AC3: /share stays in Safari

    func testAShareLinkIsLeftToTheBrowser() {
        // Not an oversight. /share is the PWA share_target action, handled by
        // a POST in public/sw.js that stashes the payload in a cache inside
        // that browser and redirects to /share?source=sw. The URL carries
        // nothing, and the data it refers to is unreachable from the app.
        // Routing it in-app would land the user on an empty screen; iOS has
        // the share extension instead (US-143).
        XCTAssertNil(route("https://tryeatpal.com/share?source=sw"))
        XCTAssertNil(route("https://tryeatpal.com/share"))
    }

    func testBillingStillStaysInSafari() {
        // The same rule that /share now falls under, and the one that already
        // had a user in it: swallowing Stripe checkout strands someone
        // mid-payment.
        XCTAssertNil(route("https://tryeatpal.com/dashboard/billing"))
    }

    // MARK: - AC2, AC4: the gap before a session exists

    func testTheCodeIsParkedSoItSurvivesAColdStart() {
        _ = route("https://tryeatpal.com/join?code=ABC123")

        // The web gets this free by letting ?code= ride through its /auth
        // redirect. The app has no redirect to ride, so the code is stored and
        // drained from the authenticated load.
        XCTAssertEqual(HouseholdInviteLink.pendingCode(), "ABC123")
    }

    func testALinkWithNoCodeParksNothing() {
        HouseholdInviteLink.storePending(code: "EARLIER")
        _ = route("https://tryeatpal.com/join")

        // A truncated link must not clear a code the person already tapped,
        // and must not park an empty one for the drain to send to the RPC.
        XCTAssertEqual(HouseholdInviteLink.pendingCode(), "EARLIER")
    }

    func testTakingThePendingCodeClearsIt() {
        HouseholdInviteLink.storePending(code: "abc123")

        XCTAssertEqual(HouseholdInviteLink.takePending(), "ABC123")
        // Cleared before the RPC runs, on purpose: the code is spent either
        // way, and leaving it parked would retry a doomed join on every launch
        // and show the same error with no way to dismiss it.
        XCTAssertNil(HouseholdInviteLink.takePending())
    }

    func testTheNewestTapWins() {
        // Two links tapped before signing in. Only the newest can be what they
        // meant -- an invite is single-use, so a queue would just send a code
        // the person has moved on from.
        HouseholdInviteLink.storePending(code: "OLD")
        HouseholdInviteLink.storePending(code: "NEW")

        XCTAssertEqual(HouseholdInviteLink.takePending(), "NEW")
    }

    // MARK: - The link the app hands out

    func testBuiltLinkMatchesTheWebShape() {
        // buildInviteLink on the web produces `${origin}/join?code=CODE`. A
        // link minted in the app has to open the same place.
        XCTAssertEqual(
            HouseholdInviteLink.buildLink(code: "abc123"),
            "https://tryeatpal.com/join?code=ABC123"
        )
        XCTAssertNil(HouseholdInviteLink.buildLink(code: "  "))
    }

    // MARK: - What the parent is told

    func testErrorMessagesMatchTheWebsWording() {
        struct Raised: Error, CustomStringConvertible { let description: String }

        XCTAssertEqual(
            HouseholdInviteLink.errorMessage(
                for: Raised(description: "Invite code is invalid or expired")
            ),
            "This invite link is invalid, expired, or already used."
        )
        XCTAssertEqual(
            HouseholdInviteLink.errorMessage(for: Raised(description: "Sign in required")),
            "Please sign in to accept this invite."
        )
        // Anything else gets a message that suggests an action rather than
        // showing a status code.
        XCTAssertEqual(
            HouseholdInviteLink.errorMessage(for: Raised(description: "timed out")),
            "Could not join the household. Please check the link and try again."
        )
    }
}
