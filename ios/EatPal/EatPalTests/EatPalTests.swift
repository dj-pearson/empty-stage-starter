import XCTest
@testable import EatPal

final class EatPalTests: XCTestCase {
    // MARK: - Sanity

    func testAppCompiles() {
        XCTAssertTrue(true)
    }

    // MARK: - Models

    func testFoodDecoding() throws {
        let json = """
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "user_id": "user-1",
            "name": "Apple",
            "category": "fruit",
            "is_safe": true,
            "is_try_bite": false,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let food = try? decoder.decode(Food.self, from: json)
        XCTAssertNotNil(food, "Food should decode from snake_case JSON")
    }

    // MARK: - Password validator

    func testPasswordValidatorRejectsShort() {
        let result = PasswordValidator.validate("abc")
        XCTAssertFalse(result.isValid, "3-char password must be rejected")
    }

    func testPasswordValidatorAcceptsStrong() {
        let result = PasswordValidator.validate("Str0ng!Passw0rd")
        XCTAssertTrue(result.isValid, "Strong password must pass")
    }
}
