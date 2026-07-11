import XCTest
@testable import EatPal

/// US-224 / US-455: scaling ingredient quantities, including mixed unicode
/// fractions like "1½" which previously scaled only the integer part.
final class RecipeScalingTests: XCTestCase {

    func testMixedUnicodeFractionScalesWholeValue() {
        // Regression: "1½ cups" × 2 was "2 ½ cups"; must be "3 cups".
        XCTAssertEqual(RecipeScaling.scaleIngredientLine("1½ cups sugar", scale: 2), "3 cups sugar")
        XCTAssertEqual(RecipeScaling.scaleIngredientLine("1 ½ cups sugar", scale: 2), "3 cups sugar")
    }

    func testBareUnicodeFractionScales() {
        XCTAssertEqual(RecipeScaling.scaleIngredientLine("½ cup milk", scale: 2), "1 cup milk")
    }

    func testAsciiMixedAndDecimalStillScale() {
        XCTAssertEqual(RecipeScaling.scaleIngredientLine("1 1/2 cups flour", scale: 2), "3 cups flour")
        XCTAssertEqual(RecipeScaling.scaleIngredientLine("1.5 tbsp oil", scale: 2), "3 tbsp oil")
        XCTAssertEqual(RecipeScaling.scaleIngredientLine("2 cups flour", scale: 0.5), "1 cups flour")
    }

    func testScaleOfOnePassesThrough() {
        XCTAssertEqual(RecipeScaling.scaleIngredientLine("1½ cups sugar", scale: 1), "1½ cups sugar")
    }

    func testHalvingProducesFractionGlyph() {
        // 1 × 0.5 = 0.5 → "½"
        XCTAssertEqual(RecipeScaling.scaleIngredientLine("1 cup rice", scale: 0.5), "½ cup rice")
    }
}
