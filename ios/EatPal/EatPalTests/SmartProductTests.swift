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

    // MARK: - US-276 RestockPredictor

    /// Helper to build a preference row with a synthetic add history.
    private func pref(name: String, daysAgo: [Int], aisle: String? = "produce") -> UserProductPreference {
        let formatter = ISO8601DateFormatter()
        let now = Date()
        let history = daysAgo
            .sorted(by: >)  // oldest first after .reversed below
            .reversed()
            .map { formatter.string(from: now.addingTimeInterval(-Double($0) * 86_400)) }
        return UserProductPreference(
            id: UUID().uuidString,
            userId: "u",
            householdId: nil,
            catalogId: nil,
            name: name,
            nameNormalized: name.lowercased(),
            barcode: nil,
            preferredAisleSection: aisle,
            preferredCategory: "vegetable",
            preferredUnit: "count",
            preferredQuantity: 1,
            preferredBrand: nil,
            notes: nil,
            timesAdded: daysAgo.count,
            lastAddedAt: nil,
            addHistory: Array(history),
            createdAt: nil,
            updatedAt: nil
        )
    }

    func testRestockPredictsOverdue() {
        // Bought every ~7 days; most recent add was 14d ago, so 7d overdue.
        let p = pref(name: "Milk", daysAgo: [49, 42, 35, 28, 21, 14])
        let suggestions = RestockPredictor.suggestions(from: [p])
        XCTAssertEqual(suggestions.count, 1)
        let s = suggestions[0]
        XCTAssertEqual(s.cadenceDays, 7)
        XCTAssertLessThan(s.daysUntilDue, 0, "overdue should be negative")
    }

    func testRestockHidesLowConfidence() {
        // Only two adds → confidence 2/8 = 0.25, below default floor 0.5.
        let p = pref(name: "Bread", daysAgo: [10, 3])
        XCTAssertTrue(RestockPredictor.suggestions(from: [p]).isEmpty)
    }

    func testRestockSortsMostOverdueFirst() {
        let overdue = pref(name: "Apples", daysAgo: [40, 35, 30, 25, 20, 15, 10, 5])
        // Cadence ~5d, last 5d ago → due now-ish.
        let dueSoon = pref(name: "Bananas", daysAgo: [49, 42, 35, 28, 21, 14, 7, 1])
        let result = RestockPredictor.suggestions(from: [dueSoon, overdue])
        // Apples last add was 5d ago with 5d cadence = due now (0).
        // Bananas last add was 1d ago with 7d cadence = due in 6.
        // So Apples should sort first.
        XCTAssertEqual(result.first?.name, "Apples")
        XCTAssertEqual(result.last?.name, "Bananas")
    }

    func testRestockFilterRemovesItemsAlreadyOnList() {
        let p = pref(name: "Milk", daysAgo: [49, 42, 35, 28, 21, 14])
        let raw = RestockPredictor.suggestions(from: [p])
        XCTAssertEqual(raw.count, 1)

        let onList = GroceryItem(
            id: "1", userId: "u", name: "milk", category: "dairy",
            quantity: 1, unit: "gal", checked: false
        )
        let filtered = RestockPredictor.filterNotInList(suggestions: raw, groceryItems: [onList])
        XCTAssertTrue(filtered.isEmpty, "case-insensitive match should remove the suggestion")
    }

    // MARK: - US-275 StoreLayout fallback

    func testStoreLayoutDecodes() throws {
        let json = """
        {
          "id": "00000000-0000-0000-0000-000000000099",
          "name": "Trader Joe's",
          "slug": "trader_joes",
          "banner_image_url": null,
          "aisle_overrides": {"produce": 200, "meat_deli": 220},
          "created_at": "2026-05-07T00:00:00Z",
          "updated_at": "2026-05-07T00:00:00Z"
        }
        """.data(using: .utf8)!
        let layout = try JSONDecoder().decode(StoreLayout.self, from: json)
        XCTAssertEqual(layout.slug, "trader_joes")
        XCTAssertEqual(layout.aisleOverrides["produce"], 200)
    }

    // MARK: - Existing US-272 tests below

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
