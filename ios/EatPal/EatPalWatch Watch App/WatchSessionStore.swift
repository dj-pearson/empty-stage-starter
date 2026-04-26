import Foundation
import WatchConnectivity
import Combine

/// US-237: watchOS-side mirror of the iPhone's AppState (snapshot only).
///
/// Receives `WatchSnapshot` payloads via `WCSession.transferUserInfo`
/// and republishes them to SwiftUI views. Holds the WCSession delegate
/// for the watch process — symmetric with `WatchConnectivityService` on
/// the iPhone but smaller because the watch only consumes snapshots
/// + sends grocery toggles back.
@MainActor
final class WatchSessionStore: NSObject, ObservableObject {
    static let shared = WatchSessionStore()

    @Published private(set) var snapshot: WatchSnapshot = .empty
    @Published private(set) var isReachable: Bool = false

    private override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
        loadCachedSnapshot()
    }

    // MARK: - Outbound

    /// Optimistically toggles the row locally + asks the iPhone to write
    /// the change. Network roundtrip is fire-and-forget; on next snapshot
    /// the iPhone confirms whatever it persisted.
    func toggleGrocery(_ row: WatchSnapshot.GroceryRow) {
        // Drop the row from the local list so the user gets immediate
        // visual feedback even if WCSession is slow.
        var meals = snapshot.meals
        var grocery = snapshot.grocery
        grocery.removeAll { $0.id == row.id }
        snapshot = WatchSnapshot(
            generatedAt: snapshot.generatedAt,
            meals: meals,
            grocery: grocery,
            totalGroceryCount: snapshot.totalGroceryCount,
            checkedGroceryCount: snapshot.checkedGroceryCount + 1
        )
        _ = meals  // keep meals in scope so the inout isn't optimized away

        guard WCSession.default.activationState == .activated else { return }
        // sendMessage is the right call here — we want low latency for the
        // user-visible action. transferUserInfo would queue across an offline
        // gap, but we already updated the local snapshot so the queue would
        // arrive after the iPhone-side state has changed anyway.
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(
                ["grocery_toggle": row.id],
                replyHandler: nil,
                errorHandler: nil
            )
        } else {
            // iPhone is asleep / out of range — fall back to the queued
            // userInfo channel. Will deliver next time the phone reaches
            // out, which is the correct fallback.
            WCSession.default.transferUserInfo(["grocery_toggle": row.id])
        }
    }

    // MARK: - Snapshot persistence

    /// Persist the latest snapshot to UserDefaults so a re-launched watch
    /// app immediately shows the last-known-good data instead of the
    /// "Open EatPal on iPhone" empty state.
    private static let cacheKey = "EatPal.watch.snapshot"

    private func cache(_ snapshot: WatchSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: Self.cacheKey)
    }

    private func loadCachedSnapshot() {
        guard let data = UserDefaults.standard.data(forKey: Self.cacheKey),
              let cached = try? JSONDecoder().decode(WatchSnapshot.self, from: data) else {
            return
        }
        snapshot = cached
    }
}

extension WatchSessionStore: @preconcurrency WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        let reachable = session.isReachable
        Task { @MainActor in self.isReachable = reachable }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in self.isReachable = reachable }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any] = [:]
    ) {
        guard let data = userInfo["snapshot"] as? Data,
              let decoded = try? JSONDecoder().decode(WatchSnapshot.self, from: data) else {
            return
        }
        Task { @MainActor in
            self.snapshot = decoded
            self.cache(decoded)
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        // The iPhone side may push a snapshot via sendMessage when the watch
        // is reachable for low-latency updates. Same payload key as userInfo.
        guard let data = message["snapshot"] as? Data,
              let decoded = try? JSONDecoder().decode(WatchSnapshot.self, from: data) else {
            return
        }
        Task { @MainActor in
            self.snapshot = decoded
            self.cache(decoded)
        }
    }
}
