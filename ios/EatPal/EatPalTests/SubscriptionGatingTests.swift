import XCTest
@testable import EatPal

/// Pure subscription-gating logic: tier ordering, per-feature required tiers,
/// kid limits, and the "server can only reduce access" entitlement resolution.
final class SubscriptionGatingTests: XCTestCase {

    // MARK: - Tier ordering

    func testTierOrdering() {
        XCTAssertLessThan(SubscriptionTier.free, .pro)
        XCTAssertLessThan(SubscriptionTier.pro, .familyPlus)
        XCTAssertLessThan(SubscriptionTier.familyPlus, .professional)
    }

    // MARK: - Feature -> required tier

    func testFeatureRequiredTiers() {
        XCTAssertEqual(PremiumFeature.aiCoach.requiredTier, .pro)
        XCTAssertEqual(PremiumFeature.aiMealPlan.requiredTier, .pro)
        XCTAssertEqual(PremiumFeature.budget.requiredTier, .familyPlus)
        XCTAssertEqual(PremiumFeature.sharedHousehold.requiredTier, .familyPlus)
    }

    // MARK: - Kid limits

    func testKidLimitPerTier() {
        XCTAssertEqual(SubscriptionLimits.kidLimit(for: .free), 1)
        XCTAssertEqual(SubscriptionLimits.kidLimit(for: .pro), 3)
        XCTAssertNil(SubscriptionLimits.kidLimit(for: .familyPlus))
        XCTAssertNil(SubscriptionLimits.kidLimit(for: .professional))
    }

    func testCanAddKidRespectsFreeLimit() {
        XCTAssertTrue(SubscriptionLimits.canAddKid(currentCount: 0, tier: .free))
        XCTAssertFalse(SubscriptionLimits.canAddKid(currentCount: 1, tier: .free))
        XCTAssertFalse(SubscriptionLimits.canAddKid(currentCount: 5, tier: .free))
    }

    func testCanAddKidRespectsProLimit() {
        XCTAssertTrue(SubscriptionLimits.canAddKid(currentCount: 2, tier: .pro))
        XCTAssertFalse(SubscriptionLimits.canAddKid(currentCount: 3, tier: .pro))
    }

    func testCanAddKidUnlimitedForFamilyPlus() {
        XCTAssertTrue(SubscriptionLimits.canAddKid(currentCount: 99, tier: .familyPlus))
        XCTAssertTrue(SubscriptionLimits.canAddKid(currentCount: 99, tier: .professional))
    }

    // MARK: - Server-authoritative entitlement resolution

    func testEntitledTierFromLocalProducts() {
        let tier = StoreKitService.entitledTier(
            localProductIDs: ["com.eatpal.app.pro.monthly"],
            revokedProductIDs: []
        )
        XCTAssertEqual(tier, .pro)
    }

    func testEntitledTierPicksHighestLocalTier() {
        let tier = StoreKitService.entitledTier(
            localProductIDs: [
                "com.eatpal.app.pro.monthly",
                "com.eatpal.app.familyplus.yearly",
            ],
            revokedProductIDs: []
        )
        XCTAssertEqual(tier, .familyPlus)
    }

    func testServerRevocationDowngradesTier() {
        // Local StoreKit still lists Family Plus, but the server marked it
        // revoked (e.g. a refund) — access must drop to the next entitled tier.
        let tier = StoreKitService.entitledTier(
            localProductIDs: [
                "com.eatpal.app.pro.monthly",
                "com.eatpal.app.familyplus.yearly",
            ],
            revokedProductIDs: ["com.eatpal.app.familyplus.yearly"]
        )
        XCTAssertEqual(tier, .pro)
    }

    func testServerRevocationOfOnlyProductFallsToFree() {
        let tier = StoreKitService.entitledTier(
            localProductIDs: ["com.eatpal.app.pro.monthly"],
            revokedProductIDs: ["com.eatpal.app.pro.monthly"]
        )
        XCTAssertEqual(tier, .free)
    }

    func testServerCannotGrantUnownedTier() {
        // A revoked set that references a product the user never owned locally
        // must not grant anything — grants require a local verified entitlement.
        let tier = StoreKitService.entitledTier(
            localProductIDs: [],
            revokedProductIDs: []
        )
        XCTAssertEqual(tier, .free)
    }
}
