import SwiftUI

#if DEBUG
/// US-257: SwiftUI preview gallery rendering every `AppError` case across
/// light + dark + reduce-motion variants so designers can review the
/// production toast surface without firing real failures.
///
/// Run from Xcode by opening this file and using the Canvas. Not compiled
/// into release builds.
///
/// Coverage matrix:
///   * Every `AppError` case (offline / network / notSignedIn / save /
///     load / delete / importFailed / permission / invalidInput /
///     subscriptionRequired / unknown)
///   * Light + dark color schemes
///   * Reduce-motion ON variant for the spring-vs-fade animation choice
///     made in `ToastManager.present(_:)` and `ToastManager.dismiss()`
///   * One sample with a retry button bound (the US-257 closure)
struct ErrorStatesGallery: View {

    /// Every concrete `AppError` we want to lock the visual contract for.
    /// Where a case takes an `Error?`, we pass `nil` — the toast surface
    /// renders title + recovery hint without leaking the raw error.
    static let samples: [AppError] = [
        .offline,
        .network(underlying: nil),
        .notSignedIn,
        .save(entity: "food", underlying: nil),
        .load(entity: "kids", underlying: nil),
        .delete(entity: "recipe", underlying: nil),
        .importFailed(source: "share extension", underlying: nil),
        .permission(feature: "Camera"),
        .invalidInput(reason: "Quantity must be greater than zero."),
        .subscriptionRequired(feature: "AI meal plan"),
        .unknown(underlying: NSError(
            domain: "com.eatpal.preview",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Mock unexpected error"]
        )),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("AppError surface — US-257 preview gallery")
                    .font(.headline)
                    .padding(.horizontal)

                ForEach(Array(Self.samples.enumerated()), id: \.offset) { _, appError in
                    sampleRow(appError)
                }

                Divider()
                    .padding(.horizontal)

                Text("With retry closure (US-257)")
                    .font(.headline)
                    .padding(.horizontal)

                sampleRow(
                    .save(entity: "food", underlying: nil),
                    retry: { /* preview only — no-op */ }
                )
            }
            .padding(.vertical)
        }
    }

    @ViewBuilder
    private func sampleRow(_ appError: AppError, retry: (@MainActor () async -> Void)? = nil) -> some View {
        let toast = Toast(
            type: appError.telemetryCategory == "offline" ? .warning : .error,
            title: appError.title,
            message: appError.recoveryHint,
            duration: 4.0,
            retry: retry
        )
        VStack(alignment: .leading, spacing: 4) {
            Text(caseLabel(for: appError))
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            ToastView(toast: toast) { /* dismiss no-op in preview */ }
        }
    }

    private func caseLabel(for appError: AppError) -> String {
        switch appError {
        case .offline:                  return ".offline"
        case .network:                  return ".network(underlying:)"
        case .notSignedIn:              return ".notSignedIn"
        case .save(let entity, _):      return ".save(entity: \"\(entity)\")"
        case .load(let entity, _):      return ".load(entity: \"\(entity)\")"
        case .delete(let entity, _):    return ".delete(entity: \"\(entity)\")"
        case .importFailed(let src, _): return ".importFailed(source: \"\(src)\")"
        case .permission(let feature):  return ".permission(feature: \"\(feature)\")"
        case .invalidInput(let reason): return ".invalidInput(reason: \"\(reason)\")"
        case .subscriptionRequired(let feature):
            return ".subscriptionRequired(feature: \"\(feature)\")"
        case .unknown:                  return ".unknown(underlying:)"
        }
    }
}

// MARK: - Previews

#Preview("Light") {
    ErrorStatesGallery()
        .preferredColorScheme(.light)
}

#Preview("Dark") {
    ErrorStatesGallery()
        .preferredColorScheme(.dark)
}

// Note: `accessibilityReduceMotion` is a read-only environment value and cannot
// be overridden in a `#Preview`. To preview reduced-motion behavior, toggle
// "Reduce Motion" in the simulator/canvas accessibility settings instead.
#endif
