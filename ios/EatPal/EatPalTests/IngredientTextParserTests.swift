import XCTest
@testable import EatPal

/// US-493: quantity parsing must not read a hyphenated size descriptor
/// ("15-ounce") as a quantity, and must average only genuine ranges.
final class IngredientTextParserTests: XCTestCase {

    func testHyphenatedSizeDescriptorIsNotAveragedIntoQuantity() {
        // Was parsed as a [1, 15] range → averaged to 8.
        let p = IngredientTextParser.parse("1 15-ounce can black beans")
        XCTAssertEqual(p.quantity, 1)
        XCTAssertEqual(p.unit, "can")
        XCTAssertEqual(p.name, "black beans")
    }

    func testSizeDescriptorWithMultipleCans() {
        let p = IngredientTextParser.parse("2 6-ounce cans tomato paste")
        XCTAssertEqual(p.quantity, 2)
        XCTAssertEqual(p.unit, "can")
        XCTAssertEqual(p.name, "tomato paste")
    }

    func testDashRangeAverages() {
        let p = IngredientTextParser.parse("2-3 cups flour")
        XCTAssertEqual(p.quantity, 2.5)
        XCTAssertEqual(p.unit, "cup")
        XCTAssertEqual(p.name, "flour")
    }

    func testToRangeAverages() {
        let p = IngredientTextParser.parse("1 to 2 tablespoons olive oil")
        XCTAssertEqual(p.quantity, 1.5)
        XCTAssertEqual(p.unit, "tbsp")
    }

    func testFractionalRangeAveragesNotSums() {
        // Old magnitude-based heuristic summed fractions (0.5 + 0.75 = 1.25);
        // keying off the range separator averages them to 0.625.
        let p = IngredientTextParser.parse("1/2 to 3/4 cup water")
        XCTAssertEqual(p.quantity ?? 0, 0.625, accuracy: 0.0001)
        XCTAssertEqual(p.unit, "cup")
    }

    func testMixedNumberStillSums() {
        // A space-separated mixed number is not a range and must sum.
        let p = IngredientTextParser.parse("1 1/2 cups sugar")
        XCTAssertEqual(p.quantity ?? 0, 1.5, accuracy: 0.0001)
        XCTAssertEqual(p.unit, "cup")
        XCTAssertEqual(p.name, "sugar")
    }
}
