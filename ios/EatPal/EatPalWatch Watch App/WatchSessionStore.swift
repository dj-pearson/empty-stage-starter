import Foundation
import WatchConnectivity
import Combine
import WidgetKit

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

    /// Checks the row off locally and asks the iPhone to write the change.
    /// Fire-and-forget; the next snapshot confirms whatever the phone
    /// persisted.
    ///
    /// The message carries an explicit desired state, not a flip. The watch
    /// only ever lists unchecked rows, so a tap always means "check this off"
    /// -- but the old `grocery_toggle` key made the phone flip whatever the
    /// current state was, which is wrong over a store-and-forward channel. If
    /// the phone was out of range, the tap went out via `transferUserInfo` and
    /// could arrive after the same row had already been checked on the phone,
    /// flipping it back to unchecked and putting a bought item back on the
    /// list.
    ///
    /// `grocery_toggle` is still sent so an older phone build paired with this
    /// watch keeps working. A phone that understands `grocery_checked` reads
    /// that instead and ignores the legacy key.
    func toggleGrocery(_ row: WatchSnapshot.GroceryRow) {
        // Drop the row from the local list so the user gets immediate
        // visual feedback even if WCSession is slow.
        var grocery = snapshot.grocery
        grocery.removeAll { $0.id == row.id }
        snapshot = WatchSnapshot(
            generatedAt: snapshot.generatedAt,
            meals: snapshot.meals,
            grocery: grocery,
            totalGroceryCount: snapshot.totalGroceryCount,
            checkedGroceryCount: snapshot.checkedGroceryCount + 1
        )

        let payload: [String: Any] = [
            "grocery_toggle": row.id,
            "grocery_checked": true
        ]

        guard WCSession.default.activationState == .activated else { return }
        // sendMessage is the right call here — we want low latency for the
        // user-visible action. transferUserInfo would queue across an offline
        // gap, but we already updated the local snapshot so the queue would
        // arrive after the iPhone-side state has changed anyway.
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(
                payload,
                replyHandler: nil,
                errorHandler: nil
            )
        } else {
            // iPhone is asleep / out of range — fall back to the queued
            // userInfo channel. Will deliver next time the phone reaches
            // out, which is the correct fallback.
            WCSession.default.transferUserInfo(payload)
        }
    }

    // MARK: - Snapshot persistence

    /// Persist the latest snapshot to UserDefaults so a re-launched watch
    /// app immediately shows the last-known-good data instead of the
    /// "Open EatPal on iPhone" empty state.
    private func cache(_ snapshot: WatchSnapshot) {
        // US-407: write to the shared App Group store so the complication
        // extension reads the same data.
        WatchSnapshotStore.save(snapshot)
        // US-450: nudge the complication timelines so a freshly-received
        // snapshot (new dinner, checked-off groceries) shows on the watch
        // face promptly instead of waiting up to the next scheduled reload.
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func loadCachedSnapshot() {
        if let cached = WatchSnapshotStore.load() {
            snapshot = cached
        }
    }
}

extension WatchSessionStore: WCSessionDelegate {
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
