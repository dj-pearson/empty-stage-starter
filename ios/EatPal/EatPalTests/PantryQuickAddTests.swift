import XCTest
@testable import EatPal

/// US-289: Verifies the three-tier parse chain that the quick-add bar
/// uses (FoodBulkParser → UnitInference → bare-name fallback) returns
/// the expected confidence + filled fields.
final class PantryQuickAddTests: XCTestCase {

    // MARK: - Tier 1: explicit qty + unit

    func testExactQuantityAndUnitYieldsHighConfidence() {
        let result = PantryQuickAddBar.parse("2 lb chicken breast")
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.confidence, 1.0)
        XCTAssertEqual(result?.row.name, "chicken breast")
        XCTAssertEqual(result?.row.quantity, 2)
        XCTAssertEqual(result?.row.unit, "lb")
        XCTAssertEqual(result?.row.category, .protein)
    }

    func testFractionalQuantityParses() {
        let result = PantryQuickAddBar.parse("1/2 cup flour")
        XCTAssertEqual(result?.row.quantity, 0.5)
        XCTAssertEqual(result?.row.unit, "cup")
        XCTAssertEqual(result?.confidence, 1.0)
    }

    func testDecimalQuantityParses() {
        let result = PantryQuickAddBar.parse("1.5 lb ground beef")
        XCTAssertEqual(result?.row.quantity, 1.5)
        XCTAssertEqual(result?.row.unit, "lb")
        XCTAssertEqual(result?.confidence, 1.0)
    }

    // MARK: - Tier 2: bare name + UnitInference hit

    func testBareMilkInfersGallon() {
        let result = PantryQuickAddBar.parse("milk")
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.row.name, "milk")
        XCTAssertEqual(result?.row.unit, "gal", "UnitInference should pick gallon for milk")
        XCTAssertEqual(result?.row.quantity, 1)
        XCTAssertEqual(result?.confidence, 0.7, "Inferred unit is medium-confidence")
        XCTAssertEqual(result?.row.category, .dairy)
    }

    func testBareEggsInfersDozen() {
        // UnitInference's egg rule requires a trailing space in the key
        // ("egg ") to avoid matching "eggplant". The parser passes the
        // raw name so we exercise that boundary here.
        let result = PantryQuickAddBar.parse("egg carton")
        XCTAssertEqual(result?.row.unit, "dozen")
        XCTAssertEqual(result?.confidence, 0.7)
    }

    func testBareRiceInfersBag() {
        let result = PantryQuickAddBar.parse("rice")
        XCTAssertEqual(result?.row.unit, "bag")
        XCTAssertEqual(result?.row.quantity, 1)
        XCTAssertEqual(result?.confidence, 0.7)
        XCTAssertEqual(result?.row.category, .carb)
    }

    // MARK: - Tier 3: bare name fallback

    func testUnknownNameFallsBackToOnePlusNilUnit() {
        let result = PantryQuickAddBar.parse("xyzzy")
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.row.name, "xyzzy")
        XCTAssertEqual(result?.row.quantity, 1)
        XCTAssertNil(result?.row.unit)
        XCTAssertEqual(result?.confidence, 0.3)
    }

    // MARK: - Edge cases

    func testEmptyStringReturnsNil() {
        XCTAssertNil(PantryQuickAddBar.parse(""))
    }

    func testWhitespaceOnlyReturnsNil() {
        XCTAssertNil(PantryQuickAddBar.parse("   \n\t  "))
    }

    func testLeadingWhitespaceIsTrimmed() {
        let result = PantryQuickAddBar.parse("   2 lb chicken")
        XCTAssertEqual(result?.row.quantity, 2)
        XCTAssertEqual(result?.row.unit, "lb")
        XCTAssertEqual(result?.row.name, "chicken")
    }

    // MARK: - Confidence bucketing matches Analytics

    func testConfidenceBucketsMatchAnalyticsThresholds() {
        // Analytics buckets: >=0.9 exact, >=0.6 auto, else guess.
        XCTAssertGreaterThanOrEqual(
            PantryQuickAddBar.parse("2 lb chicken")?.confidence ?? 0,
            0.9
        )
        XCTAssertGreaterThanOrEqual(
            PantryQuickAddBar.parse("milk")?.confidence ?? 0,
            0.6
        )
        XCTAssertLessThan(
            PantryQuickAddBar.parse("widgetfoo")?.confidence ?? 1,
            0.6
        )
    }
}
