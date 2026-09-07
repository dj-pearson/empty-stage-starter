import Foundation

/// US-807: the signed-in user's access token, made readable by the app
/// extensions.
///
/// The share extension has no Supabase client — supabase-swift is too heavy for
/// its memory budget, and its session lives in the main app's keychain anyway.
/// So `RecipeParseAPI` sent the anon key as its bearer, which was fine until
/// `parse-recipe` started requiring a real user (b9d0427b) and every share
/// import began answering 401. This is the missing piece: the app publishes the
/// token it already holds, the extension spends it.
///
/// What is shared, deliberately:
///
///   * The ACCESS token only. It expires in about an hour, so a copy that
///     leaks out of the App Group container stops being useful quickly.
///   * The refresh token NEVER leaves the app's keychain. A refresh token is a
///     long-lived credential, and refreshing from two processes would also
///     rotate it out from under the main app.
///
/// A token that has expired is treated as absent rather than sent and rejected,
/// so the extension can say something true to the user instead of surfacing a
/// bare status code. While US-806's anon allowance is in place the fallback
/// still works; once that is retired, an absent token is the whole story.
public struct SharedAuthToken: Codable, Equatable {
    public let accessToken: String
    public let expiresAt: Date

    public init(accessToken: String, expiresAt: Date) {
        self.accessToken = accessToken
        self.expiresAt = expiresAt
    }

    /// Tokens are treated as expired slightly early: a token with four seconds
    /// left will not survive the request it is about to be attached to.
    public static let expiryLeeway: TimeInterval = 30

    public func isUsable(at now: Date = Date()) -> Bool {
        !accessToken.isEmpty && expiresAt.timeIntervalSince(now) > Self.expiryLeeway
    }
}

/// App Group store for `SharedAuthToken`. Written by the main app on every
/// session change, read by the extensions.
public enum SharedAuthTokenStore {
    public static let appGroup = "group.com.eatpal.app"
    public static let key = "shared_auth_token"

    /// Optional on purpose, where `WatchSnapshotStore` falls back to
    /// `.standard`. A misconfigured App Group means the extension cannot read
    /// what we write, so falling back would buy nothing and would put a live
    /// bearer token in a second place on disk. No group, no write.
    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    /// Publish the current session's access token. Called from the app's auth
    /// listener, including on token refresh, so the stored copy tracks the one
    /// the app itself is using.
    public static func save(accessToken: String, expiresAt: Date) {
        guard let defaults,
              let data = try? JSONEncoder().encode(
                  SharedAuthToken(accessToken: accessToken, expiresAt: expiresAt)
              ) else { return }
        defaults.set(data, forKey: key)
    }

    /// The stored token, or nil when there is none or it has expired.
    public static func load(at now: Date = Date()) -> SharedAuthToken? {
        guard let defaults,
              let data = defaults.data(forKey: key),
              let token = try? JSONDecoder().decode(SharedAuthToken.self, from: data),
              token.isUsable(at: now) else {
            return nil
        }
        return token
    }

    /// Drop the token. Called on sign-out: leaving a valid bearer readable by
    /// an extension after the user signed out is exactly the thing not to do.
    public static func clear() {
        defaults?.removeObject(forKey: key)
    }
}
