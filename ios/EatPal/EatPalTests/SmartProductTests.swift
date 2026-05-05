import XCTest
@testable import EatPal

/// US-272: Sanity tests for the smart-add building blocks. The
/// SmartProductService itself talks to Supabase so we don't unit-test
/// network paths — we cover the deterministic helpers (normalization,
/// resolved-product source flagging, classifier integration) here so
/// regressions surface fast.
final class SmartProductTests: XCTestCase {

    // MARK: - ProductNameNormalizer

    func testNormalizeLowercases() {
        XCTAssertEqual(ProductNameNormalizer.normalize("Chicken Breast"), "chicken breast")
    }

    func testNormalizeTrimsAndCollapsesWhitespace() {
        XCTAssertEqual(
            ProductNameNormalizer.normalize("   Chicken    Breast  "),
            "chicken breast"
        )
    }

    func testNormalizeIsIdempotent() {
        let once = ProductNameNormalizer.normalize("Chicken    Breast")
        let twice = ProductNameNormalizer.normalize(once)
        XCTAssertEqual(once, twice)
    }

    func testNormalizeEmpty() {
        XCTAssertEqual(ProductNameNormalizer.normalize("   "), "")
    }

    // MARK: - ResolvedProduct.needsConfirmation

    func testUserPreferenceDoesNotNeedConfirmation() {
        let p = ResolvedProduct(
            name: "Chicken Breast",
            aisleSection: .meatDeli,
            category: .protein,
            unit: "lb",
            quantity: 1,
            brand: nil,
            barcode: nil,
            notes: nil,
            source: .userPreference
        )
        XCTAssertFalse(p.needsConfirmation)
    }

    func testCatalogDoesNotNeedConfirmation() {
        let p = ResolvedProduct(
            name: "Tortilla Chips",
            aisleSection: .snacks,
            category: .snack,
            unit: "bag",
            quantity: 1,
            brand: nil,
            barcode: nil,
            notes: nil,
            source: .catalog
        )
        XCTAssertFalse(p.needsConfirmation)
    }

    func testKeywordFallbackNeedsConfirmation() {
        let p = ResolvedProduct(
            name: "asdf",
            aisleSection: .other,
            category: .snack,
            unit: "count",
            quantity: 1,
            brand: nil,
            barcode: nil,
            notes: nil,
            source: .keywordFallback
        )
        XCTAssertTrue(p.needsConfirmation)
    }

    func testBarcodeFreshNeedsConfirmation() {
        let p = ResolvedProduct(
            name: "New Product",
            aisleSection: .other,
            category: .snack,
            unit: "count",
            quantity: 1,
            brand: nil,
            barcode: "0123456789012",
            notes: nil,
            source: .barcodeFresh
        )
        XCTAssertTrue(p.needsConfirmation)
    }

    // MARK: - GroceryAisle.classify integration

    /// Confirms the keyword classifier surfaces the meat aisle for a
    /// common product — this is the floor of the resolver chain and the
    /// only thing that runs when a user is fully offline with no prior
    /// adds.
    func testClassifierMapsChickenBreastToMeatDeli() {
        XCTAssertEqual(GroceryAisle.classify("Chicken Breast"), .meatDeli)
    }

    func testClassifierMapsAvocadoToProduce() {
        XCTAssertEqual(GroceryAisle.classify("avocado"), .produce)
    }

    /// "Frozen pizza" must beat the "pizza" → snacks tendency.
    func testClassifierFrozenPizzaWinsOverSnacks() {
        XCTAssertEqual(GroceryAisle.classify("frozen pizza"), .frozenMeals)
    }

    func testClassifierUnknownFallsBackToOther() {
        XCTAssertEqual(GroceryAisle.classify("zzqqxxhjk"), .other)
    }

    // MARK: - ProductCatalogEntry / UserProductPreference Codable

    func testCatalogEntryDecodes() throws {
        let json = """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "name": "Chicken Breast",
          "name_normalized": "chicken breast",
          "barcode": null,
          "default_aisle_section": "meat_deli",
          "default_category": "protein",
          "default_unit": "lb",
          "default_quantity": 1.0,
          "brand": null,
          "package_size": null,
          "package_unit": null,
          "times_added": 5,
          "last_added_at": "2026-05-05T00:00:00Z",
          "created_at": "2026-05-01T00:00:00Z",
          "updated_at": "2026-05-05T00:00:00Z"
        }
        """.data(using: .utf8)!
        let entry = try JSONDecoder().decode(ProductCatalogEntry.self, from: json)
        XCTAssertEqual(entry.nameNormalized, "chicken breast")
        XCTAssertEqual(entry.defaultAisleSection, "meat_deli")
        XCTAssertEqual(entry.timesAdded, 5)
    }

    func testUserPreferenceDecodes() throws {
        let json = """
        {
          "id": "00000000-0000-0000-0000-000000000002",
          "user_id": "00000000-0000-0000-0000-000000000003",
          "catalog_id": null,
          "name": "Chicken Breast",
          "name_normalized": "chicken breast",
          "barcode": null,
          "preferred_aisle_section": "refrigerated",
          "preferred_category": "protein",
          "preferred_unit": "lb",
          "preferred_quantity": 2.0,
          "preferred_brand": "Tyson",
          "notes": null,
          "times_added": 3,
          "last_added_at": "2026-05-05T00:00:00Z",
          "created_at": "2026-05-01T00:00:00Z",
          "updated_at": "2026-05-05T00:00:00Z"
        }
        """.data(using: .utf8)!
        let pref = try JSONDecoder().decode(UserProductPreference.self, from: json)
        XCTAssertEqual(pref.preferredAisleSection, "refrigerated")
        XCTAssertEqual(pref.preferredBrand, "Tyson")
        XCTAssertEqual(pref.preferredQuantity, 2.0)
    }
}
