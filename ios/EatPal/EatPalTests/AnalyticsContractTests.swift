import XCTest
@testable import EatPal

/// Locks the analytics event contract — the stable, queryable names and
/// properties that downstream funnels depend on.
///
/// This matters specifically because EatPal is about to spend on Apple Search
/// Ads: ad ROI is measured against the *monetization* funnel (`paywall_shown`
/// → `purchase_completed`). If a refactor silently renames one of those
/// events or drops a property, conversion reporting breaks and ad spend flies
/// blind. These tests fail loudly the moment the wire contract drifts.
final class AnalyticsContractTests: XCTestCase {
    // MARK: - Monetization funnel (ad-ROI critical)

    func testPaywallShownContract() {
        let event = AnalyticsEvent.paywallShown(source: "onboarding")
        XCTAssertEqual(event.name, "paywall_shown")
        XCTAssertEqual(event.category, "monetization")
        XCTAssertEqual(event.properties["source"], "onboarding")
    }

    func testPurchaseCompletedContract() {
        let event = AnalyticsEvent.purchaseCompleted(productId: "eatpal_pro_monthly")
        XCTAssertEqual(event.name, "purchase_completed")
        XCTAssertEqual(event.category, "monetization")
        XCTAssertEqual(event.properties["product_id"], "eatpal_pro_monthly")
    }

    // MARK: - Auth funnel (acquisition lands here first)

    func testSignInCompletedContract() {
        let event = AnalyticsEvent.signInCompleted(method: "apple")
        XCTAssertEqual(event.name, "sign_in_completed")
        XCTAssertEqual(event.category, "auth")
        XCTAssertEqual(event.properties["method"], "apple")
    }

    // MARK: - PII guarantees

    func testHashIsDeterministic() {
        let a = AnalyticsService.hash("kid-uuid-123")
        let b = AnalyticsService.hash("kid-uuid-123")
        XCTAssertEqual(a, b, "Same input must hash to the same tag for per-kid grouping")
    }

    func testHashDiffersForDifferentInput() {
        XCTAssertNotEqual(
            AnalyticsService.hash("kid-a"),
            AnalyticsService.hash("kid-b")
        )
    }

    func testHashIsEightHexChars() {
        let hashed = AnalyticsService.hash("kid-uuid-123")
        XCTAssertEqual(hashed?.count, 8)
        XCTAssertNotNil(hashed?.range(of: "^[0-9a-f]{8}$", options: .regularExpression))
    }

    func testHashReturnsNilForNilOrEmpty() {
        XCTAssertNil(AnalyticsService.hash(nil))
        XCTAssertNil(AnalyticsService.hash(""))
    }

    func testKidScopedEventHashesRawId() {
        // The raw UUID must never appear in the outgoing properties — only the
        // 8-char hashed tag. Guards the "no raw kid IDs leave the device"
        // contract for an event that carries one.
        let rawId = "00000000-0000-0000-0000-000000000042"
        let event = AnalyticsEvent.mealPlanned(slot: "dinner", kidId: rawId)
        XCTAssertEqual(event.properties["slot"], "dinner")
        XCTAssertEqual(event.properties["kid_id"], AnalyticsService.hash(rawId))
        XCTAssertNotEqual(event.properties["kid_id"], rawId)
    }
}
