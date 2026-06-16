import XCTest
@testable import EatPal

/// Routing tests for `DeepLinkHandler`.
///
/// This is the in-app surface every paid acquisition click lands on: an
/// Apple Search Ads install opens the app (cold start) and, increasingly,
/// deep/universal links drop the user onto a specific screen. If routing
/// silently breaks, paid traffic bounces — so these cases guard the exact
/// URL → `Destination` mapping that `MainTabView.route(to:)` consumes.
///
/// Only the pure routing cases are exercised here. The grocery/recipe
/// `import` paths are intentionally excluded because they hit the parser,
/// the shared import queue, and (for recipes) the network — those belong in
/// their own integration tests, not in this fast, side-effect-free suite.
@MainActor
final class DeepLinkHandlerTests: XCTestCase {
    private var handler: DeepLinkHandler { DeepLinkHandler.shared }

    override func setUp() {
        super.setUp()
        // Singleton is shared across tests — start each case from a clean slate.
        handler.clearDestination()
    }

    override func tearDown() {
        handler.clearDestination()
        super.tearDown()
    }

    private func route(_ string: String) -> DeepLinkHandler.Destination? {
        handler.clearDestination()
        handler.handle(url: URL(string: string)!)
        return handler.activeDestination
    }

    // MARK: - Custom scheme (eatpal://)

    func testCustomSchemeDashboard() {
        XCTAssertEqual(route("eatpal://dashboard"), .dashboard)
    }

    func testCustomSchemePantry() {
        XCTAssertEqual(route("eatpal://pantry"), .pantry)
    }

    func testCustomSchemeRecipes() {
        XCTAssertEqual(route("eatpal://recipes"), .recipes)
    }

    func testCustomSchemeGroceryWithoutImportOpensTab() {
        // Bare grocery host (no `/import`) must just open the tab, never
        // enter the parse-and-enqueue path.
        XCTAssertEqual(route("eatpal://grocery"), .grocery)
    }

    func testCustomSchemeScanner() {
        XCTAssertEqual(route("eatpal://scanner"), .scanner)
    }

    func testCustomSchemeSettings() {
        XCTAssertEqual(route("eatpal://settings"), .settings)
    }

    func testCustomSchemeQuiz() {
        XCTAssertEqual(route("eatpal://quiz"), .quiz)
    }

    func testCustomSchemeProgress() {
        XCTAssertEqual(route("eatpal://progress"), .progress)
    }

    func testCustomSchemeFoodChaining() {
        XCTAssertEqual(route("eatpal://food-chaining"), .foodChaining)
    }

    func testCustomSchemeMealPlanWithDate() {
        XCTAssertEqual(route("eatpal://meal-plan?date=2026-06-16"), .mealPlan(date: "2026-06-16"))
    }

    func testCustomSchemeMealPlanWithoutDate() {
        XCTAssertEqual(route("eatpal://meal-plan"), .mealPlan(date: nil))
    }

    func testCustomSchemeKidProfile() {
        XCTAssertEqual(route("eatpal://kid?id=kid-123"), .kidProfile(id: "kid-123"))
    }

    func testCustomSchemeKidProfileWithoutIdIsIgnored() {
        // No `id` query → no destination change, so the user lands on whatever
        // tab was already showing rather than an empty kid editor.
        XCTAssertNil(route("eatpal://kid"))
    }

    func testCustomSchemeUnknownHostIsIgnored() {
        XCTAssertNil(route("eatpal://not-a-real-screen"))
    }

    // MARK: - Universal links (https://tryeatpal.com/app/...)

    func testUniversalLinkDashboard() {
        XCTAssertEqual(route("https://tryeatpal.com/app/dashboard"), .dashboard)
    }

    func testUniversalLinkMealPlanWithDate() {
        XCTAssertEqual(
            route("https://tryeatpal.com/app/meal-plan?date=2026-06-16"),
            .mealPlan(date: "2026-06-16")
        )
    }

    func testUniversalLinkKidProfile() {
        XCTAssertEqual(route("https://tryeatpal.com/app/kid/kid-987"), .kidProfile(id: "kid-987"))
    }

    func testUniversalLinkProgress() {
        XCTAssertEqual(route("https://tryeatpal.com/app/progress"), .progress)
    }

    func testUniversalLinkWithoutAppPrefixIsIgnored() {
        // Marketing pages (e.g. /pricing) must NOT be swallowed by the router.
        XCTAssertNil(route("https://tryeatpal.com/pricing"))
    }

    func testForeignHostIsIgnored() {
        XCTAssertNil(route("https://example.com/app/dashboard"))
    }

    // MARK: - Notification routing (US-406)

    func testNotificationMealReminderRoutesToPlanner() {
        handler.clearDestination()
        handler.routeFromNotification(categoryIdentifier: "MEALREMINDERS")
        XCTAssertEqual(handler.activeDestination, .mealPlan(date: nil))
    }

    func testNotificationGroceryReadyRoutesToGrocery() {
        handler.clearDestination()
        handler.routeFromNotification(categoryIdentifier: "GROCERYREADY")
        XCTAssertEqual(handler.activeDestination, .grocery)
    }

    func testNotificationExpiringFoodRoutesToPantry() {
        handler.clearDestination()
        handler.routeFromNotification(categoryIdentifier: "EXPIRINGFOOD")
        XCTAssertEqual(handler.activeDestination, .pantry)
    }

    func testNotificationStreakMilestoneRoutesToProgress() {
        handler.clearDestination()
        handler.routeFromNotification(categoryIdentifier: "STREAKMILESTONE")
        XCTAssertEqual(handler.activeDestination, .progress)
    }

    func testNotificationUnknownCategoryIsIgnored() {
        handler.clearDestination()
        handler.routeFromNotification(categoryIdentifier: "NOT_A_TOPIC")
        XCTAssertNil(handler.activeDestination)
    }

    // MARK: - URL.queryValue helper

    func testQueryValueExtractsNamedParameter() {
        let url = URL(string: "eatpal://x?a=1&b=two&c=3")!
        XCTAssertEqual(url.queryValue(for: "b"), "two")
    }

    func testQueryValueReturnsNilForMissingKey() {
        let url = URL(string: "eatpal://x?a=1")!
        XCTAssertNil(url.queryValue(for: "missing"))
    }
}
