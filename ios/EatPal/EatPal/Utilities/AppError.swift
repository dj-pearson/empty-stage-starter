import Foundation

/// US-247: A small, parent-friendly error vocabulary the whole app shares so
/// users never see a raw `localizedDescription` like "Operation could not be
/// completed (NSURLErrorDomain error -1009)".
///
/// Each case provides a short user-facing title and a recovery hint. Use
/// `AppError.wrap(_:context:)` at catch-sites to convert any underlying
/// error into one of these — the original is preserved in `.underlying`
/// for Sentry reporting without leaking it to the UI.
enum AppError: Error, LocalizedError {
    /// No internet / offline-banner-relevant networking failure.
    case offline
    /// Generic networking error (5xx, timeout, DNS) where we know the request
    /// went out but didn't return cleanly.
    case network(underlying: Error?)
    /// User isn't signed in but the action requires it.
    case notSignedIn
    /// Couldn't save a record. `entity` is a user-facing noun ("food", "child").
    case save(entity: String, underlying: Error? = nil)
    /// Couldn't load a record or list.
    case load(entity: String, underlying: Error? = nil)
    /// Couldn't delete a record.
    case delete(entity: String, underlying: Error? = nil)
    /// Import / parse failed (recipe URL, photo OCR, voice transcript, etc.).
    case importFailed(source: String, underlying: Error? = nil)
    /// User denied a system permission we asked for.
    case permission(feature: String)
    /// User input failed validation (empty name, bad URL, etc.).
    case invalidInput(reason: String)
    /// Action requires a paid plan.
    case subscriptionRequired(feature: String)
    /// Last-resort wrapper for genuinely unexpected errors. Try to use a more
    /// specific case; this exists so call-sites never have to write
    /// `error.localizedDescription` again.
    case unknown(underlying: Error)

    // MARK: - User-facing copy

    /// Title shown in the toast / alert. Short and parent-friendly.
    var title: String {
        switch self {
        case .offline:                       return "You're offline"
        case .network:                       return "Network problem"
        case .notSignedIn:                   return "Sign in required"
        case .save(let entity, _):           return "Couldn't save \(entity)"
        case .load(let entity, _):           return "Couldn't load \(entity)"
        case .delete(let entity, _):         return "Couldn't delete \(entity)"
        case .importFailed(let source, _):   return "Couldn't import from \(source)"
        case .permission(let feature):       return "\(feature) access needed"
        case .invalidInput:                  return "Check your input"
        case .subscriptionRequired:          return "Upgrade required"
        case .unknown:                       return "Something went wrong"
        }
    }

    /// Recovery hint shown as the toast subtitle. Always actionable when possible.
    var recoveryHint: String {
        switch self {
        case .offline:
            return "Your changes will sync once you're back online."
        case .network(let underlying):
            // Surface the system error tail when it's short and human-readable.
            if let detail = Self.shortReason(underlying) { return detail }
            return "Check your connection and try again."
        case .notSignedIn:
            return "Sign in to your EatPal account to continue."
        case .save(_, let underlying),
             .load(_, let underlying),
             .delete(_, let underlying),
             .importFailed(_, let underlying):
            if let detail = Self.shortReason(underlying) { return detail }
            return "Try again in a moment."
        case .permission(let feature):
            return "Enable \(feature) in iOS Settings to use this feature."
        case .invalidInput(let reason):
            return reason
        case .subscriptionRequired(let feature):
            return "Upgrade your plan to unlock \(feature)."
        case .unknown(let underlying):
            return Self.shortReason(underlying) ?? "Try again — we'll keep an eye out."
        }
    }

    /// `LocalizedError` conformance — used when the AppError is rethrown and
    /// inspected by code that only knows about `Error`. Combines title + hint.
    var errorDescription: String? {
        "\(title) — \(recoveryHint)"
    }

    /// Underlying system error, when one was wrapped. Surfaced to Sentry but
    /// never to the user.
    var underlying: Error? {
        switch self {
        case .network(let e),
             .save(_, let e),
             .load(_, let e),
             .delete(_, let e),
             .importFailed(_, let e):
            return e
        case .unknown(let e):
            return e
        case .offline, .notSignedIn, .permission, .invalidInput, .subscriptionRequired:
            return nil
        }
    }

    /// Stable category string for telemetry / Sentry tagging.
    var telemetryCategory: String {
        switch self {
        case .offline:               return "offline"
        case .network:               return "network"
        case .notSignedIn:           return "auth"
        case .save:                  return "save"
        case .load:                  return "load"
        case .delete:                return "delete"
        case .importFailed:          return "import"
        case .permission:            return "permission"
        case .invalidInput:          return "input"
        case .subscriptionRequired:  return "subscription"
        case .unknown:               return "unknown"
        }
    }

    // MARK: - Wrapping helpers

    /// Convert an arbitrary thrown error into an `AppError`. If the input is
    /// already an `AppError`, returns it untouched. Otherwise applies the
    /// `context` factory — typically `.save(entity: "food")` etc.
    ///
    ///     do { try await save() }
    ///     catch { ToastManager.shared.show(.save(entity: "food", underlying: error)) }
    static func wrap(_ error: Error, as context: (Error) -> AppError) -> AppError {
        if let app = error as? AppError { return app }
        if Self.looksOffline(error) { return .offline }
        return context(error)
    }

    /// True when the system error chain looks like "no internet" rather than
    /// a server problem. URLError domain handles the iPhone-side cases; the
    /// Supabase SDK rethrows URLErrors directly so most offline-vs-server
    /// disambiguation works without us inspecting the response body.
    static func looksOffline(_ error: Error?) -> Bool {
        guard let error else { return false }
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorNotConnectedToInternet,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorDataNotAllowed,
                 NSURLErrorInternationalRoamingOff:
                return true
            default:
                return false
            }
        }
        return false
    }

    /// Trim the first sentence / 80 chars off a system error so we don't dump
    /// "The operation couldn't be completed. (NSURLErrorDomain error -1009.)"
    /// into a toast. Returns nil when the error string is empty or looks like
    /// a stack-trace / debug payload.
    private static func shortReason(_ error: Error?) -> String? {
        guard let error else { return nil }
        let raw = (error as NSError).localizedDescription
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        // Strip parenthesised debug suffixes like "(NSURLErrorDomain error -1009.)".
        let cleaned = raw.replacingOccurrences(
            of: #"\s*\([^)]*\)\.?$"#,
            with: "",
            options: .regularExpression
        )
        let truncated = cleaned.count > 100
            ? String(cleaned.prefix(100)) + "…"
            : cleaned
        return truncated
    }
}
