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

    /// Returns a strength score from 0 to 1.
    static func strength(_ password: String) -> Double {
        let result = validate(password)
        let totalChecks = 5.0
        let passedChecks = totalChecks - Double(result.errors.count)
        return passedChecks / totalChecks
    }
}
