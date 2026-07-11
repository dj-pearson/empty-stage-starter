import XCTest
@testable import EatPal

/// US-355 / US-354: Tests for `RecipeIngredientLegacyParser` delimiter
/// detection. Imports (URL paste + share extension) join ingredients with
/// newlines; the historical `additional_ingredients` blob is comma-separated.
/// The parser must handle both without splitting a single newline-delimited
/// line on its internal comma.
final class RecipeIngredientParserTests: XCTestCase {

    func testNewlineDelimitedImportSplitsPerLine() {
        let blob = "2 cups flour\n1 cup sugar\n3 large eggs"
        let rows = RecipeIngredientLegacyParser.parse(blob, recipeId: "r1")

        XCTAssertEqual(rows.count, 3)
        XCTAssertEqual(rows[0].name, "flour")
        XCTAssertEqual(rows[0].quantity, 2)
        XCTAssertEqual(rows[0].unit, "cup")
        XCTAssertEqual(rows[1].name, "sugar")
        XCTAssertEqual(rows[2].name, "eggs")
        XCTAssertEqual(rows.map(\.sortOrder), [0, 1, 2])
        XCTAssertTrue(rows.allSatisfy { $0.recipeId == "r1" })
    }

    func testNewlineLineWithInternalCommaStaysOneIngredient() {
        // Regression: "salt, to taste" on its own line must not become a bogus
        // "to taste" ingredient (the comma is a descriptor, not a separator).
        let blob = "1 lb chicken\nsalt, to taste"
        let rows = RecipeIngredientLegacyParser.parse(blob, recipeId: "r1")

        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[1].name, "salt")
        XCTAssertFalse(rows.contains { $0.name == "to taste" })
    }

    func testLegacyCommaBlobStillSplits() {
        let blob = "flour, sugar, eggs"
        let rows = RecipeIngredientLegacyParser.parse(blob, recipeId: "r1")

        XCTAssertEqual(rows.count, 3)
        XCTAssertEqual(rows.map(\.name), ["flour", "sugar", "eggs"])
    }

    func testStartingSortOrderOffsetsRows() {
        let rows = RecipeIngredientLegacyParser.parse("milk\nbutter", recipeId: "r1", startingSortOrder: 5)
        XCTAssertEqual(rows.map(\.sortOrder), [5, 6])
    }

    func testBlankLinesAreSkipped() {
        let rows = RecipeIngredientLegacyParser.parse("milk\n\n  \nbutter", recipeId: "r1")
        XCTAssertEqual(rows.map(\.name), ["milk", "butter"])
    }

    // MARK: - US-453: quantity parsing (count+size vs range vs mixed number)

    func testCountPlusPackageSizeUsesTheCount() {
        // "1 8 oz package cream cheese" is ONE package, not (1+8)/2 = 4.5.
        XCTAssertEqual(IngredientTextParser.parse("1 8 oz package cream cheese").quantity, 1)
        XCTAssertEqual(IngredientTextParser.parse("2 15 oz cans black beans").quantity, 2)
        XCTAssertEqual(IngredientTextParser.parse("1 14.5 oz can diced tomatoes").quantity, 1)
    }

    func testCompoundHyphenSizeIsNotARange() {
        // The hyphen in "8-ounce" is a compound adjective, not a range.
        XCTAssertEqual(IngredientTextParser.parse("1 8-ounce package cream cheese").quantity, 1)
    }

    func testHyphenAndWordRangesStillAverage() {
        XCTAssertEqual(IngredientTextParser.parse("1-2 cups flour").quantity, 1.5)
        XCTAssertEqual(IngredientTextParser.parse("2 to 3 cloves garlic").quantity, 2.5)
    }

    func testMixedNumbersStillSum() {
        XCTAssertEqual(IngredientTextParser.parse("1 1/2 cups sugar").quantity, 1.5)
        XCTAssertEqual(IngredientTextParser.parse("1½ cups sugar").quantity, 1.5)
        XCTAssertEqual(IngredientTextParser.parse("1/2 cup milk").quantity, 0.5)
    }
}
