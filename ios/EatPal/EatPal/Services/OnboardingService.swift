import Foundation

/// US-708: whether this account still needs first-run setup, agreed with the
/// server rather than remembered on one device.
///
/// Completion lived in `@AppStorage("hasCompletedOnboarding")`, which is
/// device-local and was never written anywhere else. `profiles.onboarding_completed`
/// therefore read false for 174 of 200 accounts, including every Apple user who
/// had finished the slides -- so web's re-engagement nudges (US-770) were aimed
/// at people who had onboarded months ago, and a new phone sent them through
/// setup again.
///
/// Shaped after `ForceUpdateService`: a MainActor singleton with a `@Published`
/// gate, a pure static for the decision, and a fail-open read. A separate
/// service rather than a field on `AppState` because `AppState.loadAllData()`
/// is called from `MainTabView`'s `.task` -- so `AppState` cannot hold a value
/// `RootView` needs in order to decide whether `MainTabView` exists at all.
@MainActor
final class OnboardingService: ObservableObject {
    static let shared = OnboardingService()

    /// Drives `RootView`. Starts from the local cache so a cold launch never
    /// waits on the network (AC4).
    @Published private(set) var needsOnboarding: Bool

    /// The cache this service owns.
    static let cacheKey = "eatpal.onboardingCompleted"

    /// The device-local flag this replaces. Read once, on upgrade, so the
    /// people who already finished setup are not asked again (AC6).
    static let legacyKey = "hasCompletedOnboarding"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let completed = Self.seedFromCaches(
            cached: Self.storedFlag(in: defaults, key: Self.cacheKey),
            legacy: Self.storedFlag(in: defaults, key: Self.legacyKey)
        )
        needsOnboarding = !completed
        // Write the migrated value through so the legacy key is consulted once
        // and never again.
        defaults.set(completed, forKey: Self.cacheKey)
    }

    // MARK: - Pure decisions

    /// `UserDefaults.bool(forKey:)` cannot tell "false" from "never set", and
    /// that difference is the whole upgrade path. Returns nil when unset.
    nonisolated static func storedFlag(in defaults: UserDefaults, key: String) -> Bool? {
        defaults.object(forKey: key) as? Bool
    }

    /// What the local cache should say at launch.
    ///
    /// The new key wins once it exists. Until then an install that carries the
    /// legacy flag is an upgrade, and its answer is the truth we have. Both
    /// unset is a fresh install, which needs onboarding.
    nonisolated static func seedFromCaches(cached: Bool?, legacy: Bool?) -> Bool {
        if let cached { return cached }
        if let legacy { return legacy }
        return false
    }

    /// What the server told us, if anything.
    enum ServerAnswer: Equatable {
        /// The row says the account has onboarded.
        case completed
        /// The row says it has not.
        case notCompleted
        /// No row, an undecodable one, or the request threw.
        case unresolved
    }

    /// Fold a server answer into the gate.
    ///
    /// AC5: an unresolved read fails OPEN, the way `ForceUpdateService` fails
    /// open on a config outage -- a network blip must not put a long-standing
    /// user back through setup. It defers to the cache when there is one, and
    /// only in its absence lets the user straight in. That last case is the
    /// deliberate trade: someone whose very first launch is offline sees the
    /// app rather than a first-run flow they cannot finish, and the next
    /// successful refresh corrects it.
    nonisolated static func resolveNeedsOnboarding(
        server: ServerAnswer,
        cached: Bool?
    ) -> Bool {
        switch server {
        case .completed: return false
        case .notCompleted: return true
        case .unresolved: return !(cached ?? true)
        }
    }

    // MARK: - Server

    /// The signed-in user's id, or nil when there is no session or the session
    /// could not be read. Spelled out rather than `try?` over an optional
    /// chain, which would yield a doubly-optional `String??`.
    private func currentUserId() async -> String? {
        do {
            return try await AuthService.shared.currentUser()?.id.uuidString
        } catch {
            return nil
        }
    }

    /// Seed the gate from `profiles`. Safe to call on every foreground.
    ///
    /// Reads the row rather than a bare boolean (AC7) -- a service whose return
    /// type is `Bool` gets rewritten the first time anyone needs a second
    /// column, and `full_name` is already the obvious second one.
    func refresh() async {
        guard let userId = await currentUserId() else {
            // Not signed in, or the session could not be read. Nothing to seed
            // from; leave the cached answer alone.
            return
        }

        let answer: ServerAnswer
        do {
            let rows: [Profile] = try await SupabaseManager.client
                .from("profiles")
                .select("id, full_name, onboarding_completed")
                .eq("id", value: userId)
                .limit(1)
                .execute()
                .value

            if let completed = rows.first?.onboardingCompleted {
                answer = completed ? .completed : .notCompleted
            } else {
                // A row with a null column is not an answer either way. Older
                // accounts predate the column being written.
                answer = .unresolved
            }
        } catch {
            answer = .unresolved
        }

        let cached = Self.storedFlag(in: defaults, key: Self.cacheKey)
        needsOnboarding = Self.resolveNeedsOnboarding(server: answer, cached: cached)

        // Only persist something we actually learned. Caching a fail-open guess
        // would make one bad network call look like a completed setup forever.
        if answer != .unresolved {
            defaults.set(answer == .completed, forKey: Self.cacheKey)
        }
    }

    /// Record that setup is done -- from finishing it or from skipping it,
    /// which mean the same thing to the column (AC3).
    ///
    /// The local flip is unconditional and happens first. The user pressed the
    /// button; leaving them staring at the slides because a write failed is the
    /// wrong answer, and the queue will deliver it.
    func markCompleted() async {
        needsOnboarding = false
        defaults.set(true, forKey: Self.cacheKey)

        guard let userId = await currentUserId() else { return }

        let update = ProfileUpdate(onboardingCompleted: true)
        do {
            try await SupabaseManager.client
                .from("profiles")
                .update(update)
                .eq("id", value: userId)
                .execute()
        } catch {
            // US-809 made this replayable: `profiles` is a declared Table and
            // the update branch decodes a ProfileUpdate, so a queued write is
            // delivered on the next drain instead of draining to nothing.
            OfflineStore.shared.enqueueUpdate(
                update,
                table: .profiles,
                entityId: userId,
                userId: userId
            )
        }
    }
}
