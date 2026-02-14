import Foundation
import Supabase

/// Singleton Supabase client configured for EatPal.
/// Reads URL and anon key from the app's Info.plist or falls back to
/// environment-provided defaults. Never hardcode real keys here.
enum SupabaseManager {
    /// The shared Supabase client instance.
    static let client: SupabaseClient = {
        let url = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String
            ?? ProcessInfo.processInfo.environment["SUPABASE_URL"]
            ?? "https://api.tryeatpal.com"

        let anonKey = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String
            ?? ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"]
            ?? "REPLACE_WITH_YOUR_ANON_KEY"

        guard let supabaseURL = URL(string: url) else {
            fatalError("Invalid Supabase URL: \(url)")
        }

        return SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: anonKey
        )
    }()
}
