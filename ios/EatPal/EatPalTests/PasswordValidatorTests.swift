import XCTest
@testable import EatPal

/// US-457: password rules, including the bcrypt 72-byte ceiling.
final class PasswordValidatorTests: XCTestCase {

    func testValidPasswordPasses() {
        XCTAssertTrue(PasswordValidator.validate("Str0ng!Passw0rd").isValid)
    }

    func testTooShortFails() {
        let result = PasswordValidator.validate("Ab1!")
        XCTAssertFalse(result.isValid)
        XCTAssertTrue(result.errors.contains("Must be at least 12 characters"))
    }

    func testOverLongPasswordRejected() {
        // 73 ASCII bytes — bcrypt would silently truncate to 72.
        let long = String(repeating: "a", count: 70) + "A1!"
        XCTAssertEqual(long.utf8.count, 73)
        let result = PasswordValidator.validate(long)
        XCTAssertFalse(result.isValid)
        XCTAssertTrue(result.errors.contains("Must be at most 72 characters"))
    }

    func testExactly72BytesAllowed() {
        let ok = String(repeating: "a", count: 69) + "A1!" // 72 bytes
        XCTAssertEqual(ok.utf8.count, 72)
        XCTAssertTrue(PasswordValidator.validate(ok).isValid)
    }

    func testStrengthIgnoresLengthCeiling() {
        // An over-long but otherwise-complete password still scores 1.0 on
        // composition (the meter must not go negative).
        let long = String(repeating: "a", count: 80) + "A1!"
        XCTAssertEqual(PasswordValidator.strength(long), 1.0, accuracy: 0.001)
    }
}
