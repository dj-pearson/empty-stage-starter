import SwiftUI

extension View {
    /// Applies an animation only when the user has not enabled Reduce Motion.
    /// Use everywhere instead of `.animation(...)` for accessibility compliance.
    func accessibleAnimation<V: Equatable>(
        _ animation: Animation?,
        value: V
    ) -> some View {
        modifier(AccessibleAnimationModifier(animation: animation, value: value))
    }
}

private struct AccessibleAnimationModifier<V: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let animation: Animation?
    let value: V

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}

/// Runs a closure with animation, unless Reduce Motion is on, in which case
/// it runs without animation. Use instead of `withAnimation { ... }`.
@MainActor
func accessibleWithAnimation<Result>(
    _ animation: Animation? = .default,
    reduceMotion: Bool,
    _ body: () throws -> Result
) rethrows -> Result {
    if reduceMotion {
        return try body()
    }
    return try withAnimation(animation, body)
}
