import Foundation

/// US-380: force-update gate. Fetches the server-provided minimum supported
/// iOS build on launch and flags whether this install is too old. Pairs with
/// the backward-compat-breaking migration model in CLAUDE.md — when a
/// migration can't stay backward compatible, bump `min_ios_build` in
/// `app_config` one release ahead so old clients are gated out.
///
/// AC3: the gate FAILS OPEN. A network error or missing config never blocks
/// the user — `needsUpdate` only flips true when we positively learn the
/// current build is below the server minimum.
@MainActor
final class ForceUpdateService: ObservableObject {
    static let shared = ForceUpdateService()

    @Published private(set) var needsUpdate = false

    private init() {}

    private var currentBuild: Int {
        let raw = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return Int(raw) ?? 0
    }

    /// App Store URL for the update button. Reads an optional Info.plist
    /// `APP_STORE_URL` override; falls back to the EatPal listing search.
    var appStoreURL: URL? {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "APP_STORE_URL") as? String,
           !raw.isEmpty, raw != "$(APP_STORE_URL)",
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://apps.apple.com/search?term=eatpal")
    }

    private struct ConfigRow: Decodable {
        let value: Int
    }

    /// Fetch the minimum supported build and set `needsUpdate`. Fails open.
    func checkMinimumVersion() async {
        do {
            let rows: [ConfigRow] = try await SupabaseManager.client
                .from("app_config")
                .select("value")
                .eq("key", value: "min_ios_build")
                .limit(1)
                .execute()
                .value
            guard let minBuild = rows.first?.value else {
                needsUpdate = false // no config row → fail open
                return
            }
            needsUpdate = currentBuild < minBuild
        } catch {
            // US-380 AC3: a config outage must not lock everyone out.
            needsUpdate = false
        }
    }
}
