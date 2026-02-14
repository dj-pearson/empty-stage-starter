import SwiftUI

/// Centralized design system for EatPal iOS.
/// Use these constants instead of hardcoded values for consistency.
enum AppTheme {

    // MARK: - Colors

    enum Colors {
        // Brand
        static let primary = Color.green
        static let primaryLight = Color.green.opacity(0.15)
        static let primaryDark = Color(red: 0.18, green: 0.55, blue: 0.24)

        // Semantic
        static let success = Color.green
        static let successLight = Color.green.opacity(0.12)
        static let warning = Color.orange
        static let warningLight = Color.orange.opacity(0.12)
        static let danger = Color.red
        static let dangerLight = Color.red.opacity(0.12)
        static let info = Color.blue
        static let infoLight = Color.blue.opacity(0.12)

        // Surfaces
        static let background = Color(.systemBackground)
        static let surface = Color(.secondarySystemBackground)
        static let surfaceElevated = Color(.tertiarySystemBackground)
        static let surfaceGrouped = Color(.systemGroupedBackground)

        // Text
        static let textPrimary = Color(.label)
        static let textSecondary = Color(.secondaryLabel)
        static let textTertiary = Color(.tertiaryLabel)

        // Borders
        static let border = Color(.separator)
        static let borderLight = Color(.opaqueSeparator)

        // Category colors
        static func categoryColor(_ category: String) -> Color {
            switch category {
            case "protein": return .red
            case "carb": return .orange
            case "dairy": return .blue
            case "fruit": return .pink
            case "vegetable": return .green
            case "snack": return .purple
            default: return .secondary
            }
        }

        // Difficulty colors
        static func difficultyColor(_ level: String) -> Color {
            switch level {
            case "easy": return success
            case "medium": return warning
            case "hard": return danger
            default: return .secondary
            }
        }

        // Pickiness colors
        static func pickinessColor(_ level: String) -> Color {
            switch level {
            case "not_picky": return success
            case "somewhat_picky": return warning
            case "very_picky": return danger
            default: return .secondary
            }
        }

        // Meal result colors
        static func resultColor(_ result: String) -> Color {
            switch result {
            case "ate": return success
            case "tasted": return warning
            case "refused": return danger
            default: return .secondary
            }
        }
    }

    // MARK: - Spacing

    enum Spacing {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 32
        static let huge: CGFloat = 40
    }

    // MARK: - Corner Radius

    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 10
        static let lg: CGFloat = 12
        static let xl: CGFloat = 16
        static let full: CGFloat = 999
    }

    // MARK: - Animation

    enum Animation {
        static let quick = SwiftUI.Animation.easeInOut(duration: 0.15)
        static let standard = SwiftUI.Animation.easeInOut(duration: 0.25)
        static let slow = SwiftUI.Animation.easeInOut(duration: 0.4)
        static let spring = SwiftUI.Animation.spring(response: 0.35, dampingFraction: 0.7)
    }

    // MARK: - Shadows

    enum Shadow {
        static let sm = SwiftUI.Color.black.opacity(0.05)
        static let md = SwiftUI.Color.black.opacity(0.1)
        static let lg = SwiftUI.Color.black.opacity(0.15)
    }

    // MARK: - Icon Sizes

    enum IconSize {
        static let sm: CGFloat = 16
        static let md: CGFloat = 20
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }
}
