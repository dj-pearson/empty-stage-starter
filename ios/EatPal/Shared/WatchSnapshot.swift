import Foundation

/// US-407: shared snapshot persistence so the watch app AND its complication
/// extension read/write the SAME store. Both targets must declare the
/// `group.com.eatpal.app` App Group entitlement; the `.standard` fallback
/// keeps things from crashing if the group isn't configured (data just won't
/// cross the process boundary until it is).
enum WatchSnapshotStore {
    static let appGroupSuite = "group.com.eatpal.app"
    static let cacheKey = "EatPal.watch.snapshot"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupSuite) ?? .standard
    }

    static func save(_ snapshot: WatchSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: cacheKey)
    }

    static func load() -> WatchSnapshot? {
        guard let data = defaults.data(forKey: cacheKey),
              let decoded = try? JSONDecoder().decode(WatchSnapshot.self, from: data) else {
            return nil
        }
        return decoded
    }
}

/// US-237: Compact today + grocery payload sent from iPhone → Apple Watch
/// via `WCSession.transferUserInfo`. Mirrors the slimmest subset of
/// AppState the watch needs — keep it small (Apple caps userInfo at 64KB).
///
/// Lives in `ios/EatPal/Shared/` so both the iOS app target and the
/// watchOS target can include it as a Compile-Sources reference without
/// duplicating the type.
struct WatchSnapshot: Codable, Equatable, Hashable {
    let generatedAt: Date
    let meals: [Meal]
    let grocery: [GroceryRow]
    let totalGroceryCount: Int
    let checkedGroceryCount: Int

    struct Meal: Codable, Equatable, Hashable, Identifiable {
        let id: String           // matches PlanEntry.id so the watch can echo a
                                 // log-result back over WCSession
        let slot: String
        let name: String
        let resultLogged: Bool
    }

    struct GroceryRow: Codable, Equatable, Hashable, Identifiable {
        let id: String           // matches GroceryItem.id; the watch sends this
                                 // back via session.sendMessage({grocery_toggle: id})
        let name: String
        let category: String
        let quantity: Double
        let unit: String
    }

    /// Empty placeholder for "haven't received a snapshot yet" state on the
    /// watch — drives the "Open EatPal on iPhone" UI.
    static let empty = WatchSnapshot(
        generatedAt: Date.distantPast,
        meals: [],
        grocery: [],
        totalGroceryCount: 0,
        checkedGroceryCount: 0
    )

    var hasReceivedSnapshot: Bool {
        generatedAt != Date.distantPast
    }
}
