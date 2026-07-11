import XCTest
@testable import EatPal

/// US-244 / US-456: bulk paste → foods. Guards the category classifier
/// against substring false positives ("eggplant" -> protein, "peanut butter"
/// -> dairy/vegetable) and the "name, category" shape keeping a leading
/// quantity in the food name.
final class FoodBulkParserTests: XCTestCase {

    func testEggplantIsVegetableNotProtein() {
        XCTAssertEqual(FoodBulkParser.guessCategory(for: "eggplant"), .vegetable)
    }

    func testPeanutButterIsProtein() {
        XCTAssertEqual(FoodBulkParser.guessCategory(for: "peanut butter"), .protein)
    }

    func testPluralsStillClassify() {
        XCTAssertEqual(FoodBulkParser.guessCategory(for: "eggs"), .protein)
        XCTAssertEqual(FoodBulkParser.guessCategory(for: "oats"), .carb)
        XCTAssertEqual(FoodBulkParser.guessCategory(for: "strawberries"), .fruit)
    }

    func testAlmondMilkStaysDairy() {
        // Compound "peanut/almond butter" must not drag plain almond milk into
        // protein.
        XCTAssertEqual(FoodBulkParser.guessCategory(for: "almond milk"), .dairy)
    }

    func testCommaShapeExtractsLeadingQuantity() {
        let row = FoodBulkParser.parseLine("2 cups milk, dairy")
        XCTAssertEqual(row?.name, "milk")
        XCTAssertEqual(row?.category, .dairy)
        XCTAssertEqual(row?.quantity, 2)
        XCTAssertEqual(row?.unit, "cups")
    }

    func testCommaShapeWithoutQuantityUnchanged() {
        let row = FoodBulkParser.parseLine("milk, dairy")
        XCTAssertEqual(row?.name, "milk")
        XCTAssertEqual(row?.category, .dairy)
        XCTAssertNil(row?.quantity)
    }
}
