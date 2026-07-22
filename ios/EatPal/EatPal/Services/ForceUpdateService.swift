import Foundation

/// US-380: force-update gate. Fetches the server-provided minimum supported
/// iOS build on launch and flags whether this install is too old. Pairs with
/// the backward-compat-breaking migration model in CLAUDE.md — when a
/// migration can't stay backward compatible, bump `min_ios_build` in
/// `app_config` one release ahead so old clients are gated out.
///
/// AC3: the gate FAILS OPEN. A network error, missing config, or a build
/// string we can't parse never blocks the user — `needsUpdate` only flips
/// true when we positively learn the current build is below the server
/// minimum.
///
/// Build numbers are NOT plain integers. CI stamps `CFBundleVersion` as a
/// dotted, date-based string (`YYYYMMDD.<run>`, e.g. `20260719.42`), so a
/// naive `Int(CFBundleVersion)` collapses every real build to 0 and gates
/// everyone. We instead compare dot-separated fields numerically, matching
/// Apple's own CFBundleVersion ordering. `BuildVersion` is a pure, testable
/// value type; the seeded `min_ios_build = 1` correctly means "any build ≥ 1".
struct BuildVersion: Comparable {
    let components: [Int]

    /// Parse a dotted build string (`"1"`, `"20260719.42"`). Returns nil for
    /// empty input or any non-numeric field, so callers can fail open.
    init?(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        var parsed: [Int] = []
        for field in trimmed.split(separator: ".", omittingEmptySubsequences: false) {
            guard let n = Int(field) else { return nil }
            parsed.append(n)
        }
        guard !parsed.isEmpty else { return nil }
        components = parsed
    }

    static func < (lhs: BuildVersion, rhs: BuildVersion) -> Bool {
        let width = max(lhs.components.count, rhs.components.count)
        for i in 0..<width {
            let l = i < lhs.components.count ? lhs.components[i] : 0
            let r = i < rhs.components.count ? rhs.components[i] : 0
            if l != r { return l < r }
        }
        return false
    }
}

@MainActor
final class ForceUpdateService: ObservableObject {
    static let shared = ForceUpdateService()

    @Published private(set) var needsUpdate = false

    private init() {}

    /// Raw `CFBundleVersion` string (e.g. "20260719.42"). Kept as a string —
    /// never flattened to an Int — so dotted builds compare correctly.
    private var currentBuildString: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
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

    /// `app_config.value` is jsonb and may arrive as a JSON number (the seeded
    /// `1`) or a JSON string (a dotted threshold like `"20260720.0"`). Decode
    /// both into the raw string form `BuildVersion` understands.
    private struct ConfigRow: Decodable {
        let minBuildRaw: String

        private enum CodingKeys: String, CodingKey { case value }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            if let s = try? container.decode(String.self, forKey: .value) {
                minBuildRaw = s
            } else if let i = try? container.decode(Int.self, forKey: .value) {
                minBuildRaw = String(i)
            } else {
                // Unexpected shape (e.g. a bare JSON float) — surface as a
                // decode error so checkMinimumVersion() fails open.
                throw DecodingError.dataCorruptedError(
                    forKey: .value, in: container,
                    debugDescription: "min_ios_build is neither string nor integer")
            }
        }
    }

    /// Decide whether `current` is below `minRaw`. Pure so it can be unit
    /// tested without a network round-trip — `nonisolated` because it touches
    /// no actor state, which lets the synchronous XCTest cases call it directly
    /// instead of hopping to the main actor. Fails OPEN (returns false)
    /// whenever either side can't be parsed — an unknown build shape must never
    /// lock a user out.
    nonisolated static func isUpdateRequired(current: String, minimum minRaw: String) -> Bool {
        guard let current = BuildVersion(current),
              let minimum = BuildVersion(minRaw) else {
            return false
        }
        return current < minimum
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
            guard let minBuildRaw = rows.first?.minBuildRaw else {
                needsUpdate = false // no config row → fail open
                return
            }
            needsUpdate = Self.isUpdateRequired(current: currentBuildString, minimum: minBuildRaw)
        } catch {
            // US-380 AC3: a config outage must not lock everyone out.
            needsUpdate = false
        }
    }
}
