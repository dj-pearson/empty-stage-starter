import UIKit

/// Centralized haptic feedback manager for native iOS feel.
/// Call these methods at key interaction points.
@MainActor
enum HapticManager {

    // MARK: - Impact

    /// Light tap - button presses, toggle switches, selections.
    static func lightImpact() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Medium tap - swipe actions, drag completion, state changes.
    static func mediumImpact() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    /// Heavy tap - destructive actions, significant state changes.
    static func heavyImpact() {
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    }

    // MARK: - Notification

    /// Success feedback - item saved, action completed.
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// Error feedback - validation failure, network error.
    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    /// Warning feedback - approaching limit, caution action.
    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    // MARK: - Selection

    /// Selection tick - scrolling through picker, tab change.
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}
