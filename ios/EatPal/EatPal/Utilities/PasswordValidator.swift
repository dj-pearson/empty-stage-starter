import Foundation

/// Validates password strength matching the web app's requirements:
/// 12+ characters, uppercase, lowercase, number, special character.
enum PasswordValidator {
    struct ValidationResult {
        let isValid: Bool
        let errors: [String]
    }

    static func validate(_ password: String) -> ValidationResult {
        var errors: [String] = []

        if password.count < 12 {
            errors.append("Must be at least 12 characters")
        }
        // bcrypt (GoTrue's password hasher) truncates at 72 bytes and silently
        // ignores anything beyond, so a longer passphrase would authenticate on
        // just its 72-byte prefix. Reject over-long input up front.
        if password.utf8.count > 72 {
            errors.append("Must be at most 72 characters")
        }
        if !password.contains(where: { $0.isUppercase }) {
            errors.append("Must contain an uppercase letter")
        }
        if !password.contains(where: { $0.isLowercase }) {
            errors.append("Must contain a lowercase letter")
        }
        if !password.contains(where: { $0.isNumber }) {
            errors.append("Must contain a number")
        }

        let specialCharacters = CharacterSet.punctuationCharacters
            .union(.symbols)
        if !password.unicodeScalars.contains(where: { specialCharacters.contains($0) }) {
            errors.append("Must contain a special character")
        }

        return ValidationResult(isValid: errors.isEmpty, errors: errors)
    }

    /// Returns a strength score from 0 to 1 based on the five composition
    /// checks. Independent of the max-length ceiling so an over-long password
    /// (invalid) doesn't skew the meter negative.
    static func strength(_ password: String) -> Double {
        var passed = 0.0
        if password.count >= 12 { passed += 1 }
        if password.contains(where: { $0.isUppercase }) { passed += 1 }
        if password.contains(where: { $0.isLowercase }) { passed += 1 }
        if password.contains(where: { $0.isNumber }) { passed += 1 }
        let special = CharacterSet.punctuationCharacters.union(.symbols)
        if password.unicodeScalars.contains(where: { special.contains($0) }) { passed += 1 }
        return passed / 5.0
    }
}
