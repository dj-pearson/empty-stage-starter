import XCTest
@testable import EatPal

/// US-493: whole-word egg matching and canned-milk precedence in the
/// keyword aisle classifier.
final class GroceryAisleClassifierTests: XCTestCase {

    func testBareEggsClassifyAsEggs() {
        XCTAssertEqual(GroceryAisle.classify("eggs"), .eggs)
        XCTAssertEqual(GroceryAisle.classify("egg"), .eggs)
        XCTAssertEqual(GroceryAisle.classify("dozen eggs"), .eggs)
        XCTAssertEqual(GroceryAisle.classify("egg whites"), .eggs)
    }

    func testEggplantIsProduceNotEggs() {
        XCTAssertEqual(GroceryAisle.classify("eggplant"), .produce)
    }

    func testCannedMilksClassifyAsCannedNotDairy() {
        XCTAssertEqual(GroceryAisle.classify("evaporated milk"), .canned)
        XCTAssertEqual(GroceryAisle.classify("condensed milk"), .canned)
        XCTAssertEqual(GroceryAisle.classify("coconut milk"), .canned)
    }

    func testRegularMilkStaysDairy() {
        XCTAssertEqual(GroceryAisle.classify("whole milk"), .dairy)
        XCTAssertEqual(GroceryAisle.classify("2% milk"), .dairy)
    }
}
