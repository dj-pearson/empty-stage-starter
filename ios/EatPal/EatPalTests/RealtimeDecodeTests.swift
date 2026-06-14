import XCTest
@testable import EatPal

/// US-381: RealtimeService used `JSONDecoder.supabase` with
/// `.convertFromSnakeCase`, which double-converted incoming snake_case keys
/// against the models' EXPLICIT snake_case CodingKeys, throwing on every
/// multi-word non-optional field and silently dropping live insert/update
/// events. These tests feed realtime-shaped payloads through the actual
/// `JSONDecoder.supabase` and assert all fields populate.
final class RealtimeDecodeTests: XCTestCase {

    private let decoder = JSONDecoder.supabase

    func testFoodDecodesFromRealtimePayload() throws {
        let json = """
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "user_id": "user-1",
            "household_id": "house-1",
            "name": "Apple",
            "category": "fruit",
            "is_safe": true,
            "is_try_bite": false,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!

        let food = try decoder.decode(Food.self, from: json)
        XCTAssertEqual(food.userId, "user-1")
        XCTAssertEqual(food.householdId, "house-1")
        XCTAssertTrue(food.isSafe)
        XCTAssertFalse(food.isTryBite)
        XCTAssertEqual(food.createdAt, "2026-01-01T00:00:00Z")
    }

    func testGroceryItemDecodesFromRealtimePayload() throws {
        let json = """
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "user_id": "user-1",
            "name": "Milk",
            "category": "dairy",
            "quantity": 2,
            "unit": "gal",
            "checked": false,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!

        let item = try decoder.decode(GroceryItem.self, from: json)
        XCTAssertEqual(item.userId, "user-1")
        XCTAssertEqual(item.quantity, 2)
        XCTAssertEqual(item.unit, "gal")
        XCTAssertFalse(item.checked)
    }

    func testPlanEntryDecodesFromRealtimePayload() throws {
        let json = """
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "user_id": "user-1",
            "kid_id": "kid-1",
            "date": "2026-01-01",
            "meal_slot": "dinner",
            "food_id": "food-1",
            "is_primary_dish": true,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!

        let entry = try decoder.decode(PlanEntry.self, from: json)
        XCTAssertEqual(entry.userId, "user-1")
        XCTAssertEqual(entry.kidId, "kid-1")
        XCTAssertEqual(entry.mealSlot, "dinner")
        XCTAssertEqual(entry.foodId, "food-1")
        XCTAssertEqual(entry.isPrimaryDish, true)
    }
}
