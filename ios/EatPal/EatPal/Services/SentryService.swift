import Foundation
import Sentry

/// Thin wrapper around SentrySDK that reads the DSN from Info.plist (same
/// env-substitution pattern as SUPABASE_URL), applies PII-aware scrubbing,
/// and exposes helpers for breadcrumbs and user context updates.
///
/// Init happens in `EatPalApp.init()`, disabled in DEBUG so developer builds
/// don't flood the project with noise. Parity with the web Sentry integration
/// documented in the platform-hardening progress notes.
enum SentryService {
    /// Whether Sentry has been successfully configured during app launch.
    private(set) static var isEnabled: Bool = false

    static func configure() {
        #if DEBUG
        // Skip Sentry in developer builds so crash dumps during feature work
        // don't pollute the production project quota.
        return
        #else
        let dsn = Bundle.main.object(forInfoDictionaryKey: "SENTRY_DSN") as? String ?? ""
        guard !dsn.isEmpty, dsn != "$(SENTRY_DSN)" else { return }

        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = "production"
            options.releaseName = Self.releaseName
            options.enableAutoSessionTracking = true
            options.sessionTrackingIntervalMillis = 30_000
            options.attachStacktrace = true
            options.tracesSampleRate = 0.2
            options.profilesSampleRate = 0.1

            // PII scrub — strip emails, names, tokens, and anything under
            // known-sensitive extra keys before the event leaves the device.
            options.beforeSend = { event in
                Self.scrub(event: event)
                return event
            }

            options.beforeBreadcrumb = { breadcrumb in
                Self.scrub(breadcrumb: breadcrumb)
                return breadcrumb
            }
        }

        isEnabled = true
        #endif
    }

    // MARK: - Contextual helpers

    /// Update the Sentry user context. Only the user id (stable, non-PII)
    /// is attached — email, name, and profile data are deliberately excluded.
    static func setUserId(_ userId: String?) {
        guard isEnabled else { return }
        if let userId, !userId.isEmpty {
            let user = User(userId: userId)
            SentrySDK.setUser(user)
        } else {
            SentrySDK.setUser(nil)
        }
    }

    /// Record a breadcrumb for navigation or significant user actions.
    static func leaveBreadcrumb(
        category: String,
        message: String,
        level: SentryLevel = .info,
        data: [String: Any]? = nil
    ) {
        guard isEnabled else { return }
        let crumb = Breadcrumb(level: level, category: category)
        crumb.message = message
        if let data {
            crumb.data = data
        }
        SentrySDK.addBreadcrumb(crumb)
    }

    /// Capture an error with optional extra context. Use for caught errors
    /// the user can recover from but that still indicate a problem worth tracking.
    static func capture(_ error: Error, extras: [String: Any]? = nil) {
        guard isEnabled else { return }
        SentrySDK.capture(error: error) { scope in
            if let extras {
                for (key, value) in extras {
                    scope.setExtra(value: value, key: key)
                }
            }
        }
    }

    // MARK: - Private

    private static var releaseName: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "com.eatpal.app@\(version)+\(build)"
    }

    /// Drop obvious PII fields from the event payload before sending.
    private static func scrub(event: Event) {
        event.user?.email = nil
        event.user?.username = nil
        event.user?.ipAddress = nil
        event.user?.data = nil

        // SentryRequest in sentry-cocoa 8.x doesn't surface request bodies,
        // so there's nothing to scrub there. Cookies and headers are the
        // only interesting fields we want to redact.
        event.request?.cookies = nil
        event.request?.headers = Self.sanitise(headers: event.request?.headers)

        event.extra = Self.sanitise(dictionary: event.extra)
    }

    private static func scrub(breadcrumb: Breadcrumb) {
        breadcrumb.data = Self.sanitise(dictionary: breadcrumb.data)
    }

    private static let sensitiveKeys: Set<String> = [
        "authorization", "auth", "cookie", "password", "token",
        "email", "name", "first_name", "last_name", "phone",
        "dob", "birthday", "address"
    ]

    private static func sanitise(dictionary: [String: Any]?) -> [String: Any]? {
        guard let dictionary else { return nil }
        var result: [String: Any] = [:]
        for (key, value) in dictionary {
            if Self.sensitiveKeys.contains(key.lowercased()) {
                result[key] = "[redacted]"
            } else {
                result[key] = value
            }
        }
        return result
    }

    private static func sanitise(headers: [String: String]?) -> [String: String]? {
        guard let headers else { return nil }
        var result: [String: String] = [:]
        for (key, value) in headers {
            if Self.sensitiveKeys.contains(key.lowercased()) {
                result[key] = "[redacted]"
            } else {
                result[key] = value
            }
        }
        return result
    }
}
