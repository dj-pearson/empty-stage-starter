import XCTest
@testable import EatPal

/// US-364: shared pantry dedup used by manual add, barcode scan, receipt scan.
final class PantryDedupTests: XCTestCase {

    private func food(id: String = UUID().uuidString, name: String, barcode: String? = nil) -> Food {
        Food(id: id, userId: "u1", name: name, category: "snack", isSafe: true, isTryBite: false, barcode: barcode)
    }

    func testManualAddOfExistingNameMatches() {
        let pantry = [food(name: "Apple"), food(name: "Milk")]
        let match = PantryDedup.match(name: "apple", barcode: nil, in: pantry)
        XCTAssertEqual(match?.name, "Apple", "Case-insensitive name should merge into the existing food")
    }

    func testNoMatchReturnsNil() {
        let pantry = [food(name: "Apple")]
        XCTAssertNil(PantryDedup.match(name: "Banana", barcode: nil, in: pantry))
    }

    func testBarcodeMatchTakesPrecedence() {
        let pantry = [
            food(id: "1", name: "Store Brand Beans", barcode: "12345"),
            food(id: "2", name: "Beans")
        ]
        let match = PantryDedup.match(name: "Beans", barcode: "12345", in: pantry)
        XCTAssertEqual(match?.id, "1", "Barcode match should win over a name match")
    }

    func testBlankNameDoesNotMatch() {
        let pantry = [food(name: "Apple")]
        XCTAssertNil(PantryDedup.match(name: "   ", barcode: nil, in: pantry))
    }
}
