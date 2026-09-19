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

    // MARK: - Activation funnel (US-810)

    /// These three exist so iOS and web aggregate. A typo in a name or a key
    /// does not fail anything -- it splits the funnel in two and stays
    /// invisible until somebody reads a dashboard and finds half the numbers
    /// missing. The literals below are the ones in src/pages/Onboarding.tsx.

    func testOnboardingPlanningForSelectedContract() {
        let event = AnalyticsEvent.onboardingPlanningForSelected(planningFor: "my_family")
        XCTAssertEqual(event.name, "onboarding_planning_for_selected")
        XCTAssertEqual(event.category, "auth")
        XCTAssertEqual(event.properties["planning_for"], "my_family")
    }

    func testOnboardingCompletedContract() {
        let event = AnalyticsEvent.onboardingCompleted(planningFor: "my_family", addedChild: true)
        XCTAssertEqual(event.name, "onboarding_completed")
        XCTAssertEqual(event.category, "auth")
        XCTAssertEqual(event.properties["planning_for"], "my_family")
        XCTAssertEqual(event.properties["added_child"], "true")
    }

    func testOnboardingSkippedContract() {
        let event = AnalyticsEvent.onboardingSkipped(planningFor: "unanswered", addedChild: false)
        XCTAssertEqual(event.name, "onboarding_skipped")
        XCTAssertEqual(event.category, "auth")
        // "unanswered" is web's placeholder for a skip taken before any choice,
        // so both platforms land in the same bucket rather than one sending an
        // empty string.
        XCTAssertEqual(event.properties["planning_for"], "unanswered")
        XCTAssertEqual(event.properties["added_child"], "false")
    }

    func testCompletedAndSkippedCarryTheSameKeys() {
        // They are read as one funnel, so a key present on one and missing on
        // the other is a hole in it.
        let completed = AnalyticsEvent.onboardingCompleted(planningFor: "just_me", addedChild: false)
        let skipped = AnalyticsEvent.onboardingSkipped(planningFor: "just_me", addedChild: false)
        XCTAssertEqual(Set(completed.properties.keys), Set(skipped.properties.keys))
    }

    func testTheEventsCarryNoUserTypedString() {
        // planning_for is a raw enum value, never the display title and never a
        // child's name. The file's own rule: every property value is either
        // enum-derived or hashed.
        let event = AnalyticsEvent.onboardingCompleted(planningFor: PlanningFor.myFamily.rawValue, addedChild: true)
        XCTAssertEqual(event.properties["planning_for"], "my_family")
        XCTAssertNotEqual(event.properties["planning_for"], PlanningFor.myFamily.title)
    }
}
