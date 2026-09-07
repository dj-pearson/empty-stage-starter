import XCTest
@testable import EatPal

/// US-807: the token the main app hands to the share extension.
///
/// The bug behind this file: `parse-recipe` started requiring a real user in
/// July 2026 and `RecipeParseAPI` was still sending the anon key, so Share ->
/// EatPal answered 401 on every recipe. The fix hangs on two decisions worth
/// pinning — an expired token counts as no token (so the extension can say
/// "sign in" rather than surfacing a status code), and sign-out clears it (so a
/// live bearer is not left readable by an extension after the user leaves).
final class SharedAuthTokenTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    // MARK: - Expiry

    func testTokenWithPlentyOfLifeLeftIsUsable() {
        let token = SharedAuthToken(accessToken: "jwt", expiresAt: now.addingTimeInterval(3600))
        XCTAssertTrue(token.isUsable(at: now))
    }

    func testExpiredTokenIsNotUsable() {
        let token = SharedAuthToken(accessToken: "jwt", expiresAt: now.addingTimeInterval(-1))
        XCTAssertFalse(token.isUsable(at: now))
    }

    /// A token with a couple of seconds left will not survive the request it is
    /// about to be attached to; parse-recipe runs a page fetch and a Claude
    /// call and can take tens of seconds.
    func testTokenInsideTheLeewayIsTreatedAsExpired() {
        let token = SharedAuthToken(
            accessToken: "jwt",
            expiresAt: now.addingTimeInterval(SharedAuthToken.expiryLeeway - 1)
        )
        XCTAssertFalse(token.isUsable(at: now))
    }

    func testEmptyTokenIsNeverUsable() {
        let token = SharedAuthToken(accessToken: "", expiresAt: now.addingTimeInterval(3600))
        XCTAssertFalse(token.isUsable(at: now))
    }

    // MARK: - Round trip through the App Group

    func testSavedTokenIsReadBack() throws {
        try XCTSkipUnless(appGroupAvailable, "App Group not configured in this test host")
        defer { SharedAuthTokenStore.clear() }

        SharedAuthTokenStore.save(accessToken: "jwt-abc", expiresAt: now.addingTimeInterval(3600))

        let loaded = SharedAuthTokenStore.load(at: now)
        XCTAssertEqual(loaded?.accessToken, "jwt-abc")
    }

    func testExpiredStoredTokenReadsAsAbsent() throws {
        try XCTSkipUnless(appGroupAvailable, "App Group not configured in this test host")
        defer { SharedAuthTokenStore.clear() }

        SharedAuthTokenStore.save(accessToken: "jwt-stale", expiresAt: now.addingTimeInterval(-60))

        XCTAssertNil(SharedAuthTokenStore.load(at: now))
    }

    func testClearRemovesTheToken() throws {
        try XCTSkipUnless(appGroupAvailable, "App Group not configured in this test host")

        SharedAuthTokenStore.save(accessToken: "jwt-abc", expiresAt: now.addingTimeInterval(3600))
        SharedAuthTokenStore.clear()

        XCTAssertNil(SharedAuthTokenStore.load(at: now))
    }

    // MARK: - What the user is told

    func testUnauthorizedTellsTheUserToSignInRatherThanShowingAStatusCode() {
        let message = RecipeParseAPI.importError(forStatus: 401).errorDescription ?? ""
        XCTAssertTrue(message.contains("sign in"), "got: \(message)")
        XCTAssertFalse(message.contains("401"))
    }

    func testRateLimitedReadsAsBusyNotAsAnAuthProblem() {
        let message = RecipeParseAPI.importError(forStatus: 429).errorDescription ?? ""
        XCTAssertTrue(message.contains("busy"), "got: \(message)")
    }

    func testOtherFailuresStillCarryTheirStatus() {
        let message = RecipeParseAPI.importError(forStatus: 503).errorDescription ?? ""
        XCTAssertTrue(message.contains("503"), "got: \(message)")
    }

    private var appGroupAvailable: Bool {
        UserDefaults(suiteName: SharedAuthTokenStore.appGroup) != nil
    }
}
