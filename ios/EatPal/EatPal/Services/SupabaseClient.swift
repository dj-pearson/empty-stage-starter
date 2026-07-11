import Foundation
import Supabase

/// Singleton Supabase client configured for EatPal.
/// Reads URL and anon key from the app's Info.plist or falls back to
/// environment-provided defaults. Never hardcode real keys here.
enum SupabaseManager {
    /// The shared Supabase client instance.
    static let client: SupabaseClient = {
        let url = configValue("SUPABASE_URL") ?? "https://api.tryeatpal.com"
        let anonKey = configValue("SUPABASE_ANON_KEY") ?? "REPLACE_WITH_YOUR_ANON_KEY"

        guard let supabaseURL = URL(string: url) else {
            fatalError("Invalid Supabase URL: \(url)")
        }

        return SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: anonKey
        )
    }()

    /// Reads a build-injected value from Info.plist, then the environment.
    /// Treats an unexpanded `$(NAME)` placeholder or an empty string as
    /// ABSENT: Info.plist variable substitution leaves the literal
    /// `"$(SUPABASE_ANON_KEY)"` in place when the build setting is unset, and
    /// a plain `?? env ?? default` chain would ship that placeholder as the
    /// key (non-nil, so the fallback never fires). Mirrors the guard in
    /// `EdgeFunctions.anonKey()`.
    private static func configValue(_ name: String) -> String? {
        let candidates = [
            Bundle.main.object(forInfoDictionaryKey: name) as? String,
            ProcessInfo.processInfo.environment[name],
        ]
        for case let value? in candidates where !value.isEmpty && value != "$(\(name))" {
            return value
        }
        return nil
    }
}
