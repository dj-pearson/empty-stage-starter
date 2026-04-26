import Foundation
@preconcurrency import WatchConnectivity

/// US-237: WatchConnectivity glue.
///
/// On the iPhone side this watches AppState changes (via the existing
/// debounced widget-snapshot pattern) and forwards a slim payload to the
/// paired Apple Watch using `transferUserInfo` — fire-and-forget, queued
/// while the watch is offline, drained when it reconnects.
///
/// The watch sends grocery-checked deltas back via the inverse direction;
/// `WatchConnectivityService` decodes and applies them via the same
/// `appState.toggleGroceryItem` path the iPhone UI uses.
@MainActor
final class WatchConnectivityService: NSObject, ObservableObject {
    static let shared = WatchConnectivityService()

    /// True when a watch is paired AND has the EatPal companion app installed.
    /// Drives whether we bother sending payloads at all.
    @Published private(set) var isReachableWatch: Bool = false

    private weak var appState: AppState?

    /// Limit how often we sync — every AppState mutation would otherwise
    /// be a watch round-trip. 1.5s matches the existing widget debounce.
    private var pendingWorkItem: DispatchWorkItem?
    private static let debounce: TimeInterval = 1.5

    private override init() {
        super.init()
    }

    /// Wire the service up at app launch. Idempotent.
    func start(appState: AppState) {
        self.appState = appState
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        if session.activationState != .activated {
            session.activate()
        }
        refreshReachability(session: session)
    }

    /// Schedule a debounced snapshot send. Call from AppState whenever the
    /// today-plan or grocery list changes.
    func scheduleSnapshotPush() {
        pendingWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in self?.pushSnapshot() }
        }
        pendingWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.debounce, execute: work)
    }

    // MARK: - Push

    /// Send the current today-plan + grocery list to the watch. Uses
    /// `transferUserInfo` so it's queued offline rather than dropped.
    private func pushSnapshot() {
        guard let appState else { return }
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        let payload = Self.buildSnapshot(appState: appState)
        guard let data = try? JSONEncoder().encode(payload) else { return }

        // transferUserInfo is the right tool for "queued when offline,
        // delivered next time the watch is reachable" semantics.
        session.transferUserInfo(["snapshot": data])
    }

    /// Pure builder — also used by the watch-side preview to render with
    /// realistic shapes.
    static func buildSnapshot(appState: AppState) -> WatchSnapshot {
        let todayString = DateFormatter.isoDate.string(from: Date())
        let todays = appState.planEntries
            .filter { $0.date == todayString }
            .sorted { $0.mealSlot < $1.mealSlot }

        let mealRows: [WatchSnapshot.Meal] = todays.compactMap { entry in
            let name: String
            if let rid = entry.recipeId,
               let recipe = appState.recipes.first(where: { $0.id == rid }) {
                name = recipe.name
            } else if let food = appState.foods.first(where: { $0.id == entry.foodId }) {
                name = food.name
            } else {
                return nil
            }
            return WatchSnapshot.Meal(
                id: entry.id,
                slot: entry.mealSlot,
                name: name,
                resultLogged: entry.result != nil
            )
        }

        let unchecked = appState.groceryItems
            .filter { !$0.checked }
            .sorted { $0.category < $1.category }
            .prefix(50)

        let groceryRows = unchecked.map { item in
            WatchSnapshot.GroceryRow(
                id: item.id,
                name: item.name,
                category: item.category,
                quantity: item.quantity,
                unit: item.unit
            )
        }

        return WatchSnapshot(
            generatedAt: Date(),
            meals: mealRows,
            grocery: Array(groceryRows),
            totalGroceryCount: appState.groceryItems.count,
            checkedGroceryCount: appState.groceryItems.filter(\.checked).count
        )
    }

    // MARK: - Inbound

    /// Apply a grocery toggle requested from the watch. We re-route through
    /// AppState so the iPhone UI, realtime channel, and offline queue all
    /// stay in sync — the watch never talks to Supabase directly.
    func handleGroceryToggleFromWatch(itemId: String) {
        Task { @MainActor in
            guard let appState else { return }
            try? await appState.toggleGroceryItem(itemId)
        }
    }

    private func refreshReachability(session: WCSession) {
        // `isPaired` and `isWatchAppInstalled` only exist on iOS; on
        // watchOS we're always "the watch" so reachability is the only
        // meaningful signal.
        #if os(iOS)
        isReachableWatch = session.isPaired && session.isWatchAppInstalled
        #else
        isReachableWatch = session.isReachable
        #endif
    }
}

extension WatchConnectivityService: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        Task { @MainActor in self.refreshReachability(session: session) }
    }

    #if os(iOS)
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        // Per Apple docs: re-activate after deactivation so we keep
        // receiving events from a paired watch swap or post-restore.
        WCSession.default.activate()
    }
    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in self.refreshReachability(session: session) }
    }
    #endif

    /// Inbound message — used on the iPhone side to receive grocery toggles
    /// from the watch.
    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        if let toggleId = message["grocery_toggle"] as? String {
            Task { @MainActor in self.handleGroceryToggleFromWatch(itemId: toggleId) }
        }
    }

    /// Snapshot delivery — used on the watch side. The same delegate type
    /// handles both directions so we don't ship two near-identical files.
    nonisolated func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any] = [:]
    ) {
        guard let data = userInfo["snapshot"] as? Data,
              let snapshot = try? JSONDecoder().decode(WatchSnapshot.self, from: data) else {
            return
        }
        Task { @MainActor in
            // The watch app's WatchSessionStore observes Notification.Name.watchSnapshotReceived.
            NotificationCenter.default.post(
                name: .watchSnapshotReceived,
                object: nil,
                userInfo: ["snapshot": snapshot]
            )
        }
    }
}

extension Notification.Name {
    static let watchSnapshotReceived = Notification.Name("EatPal.watchSnapshotReceived")
}
