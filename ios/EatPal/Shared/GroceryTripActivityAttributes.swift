import ActivityKit
import Foundation

/// US-145: Shared ActivityAttributes for the grocery-trip Live Activity.
/// Lives in the Shared/ folder so both the main app (which starts/updates/
/// ends the activity) and the widget extension (which renders it on the
/// Lock Screen + Dynamic Island) can see the same type.
public struct GroceryTripAttributes: ActivityAttributes {
    public typealias ContentState = TripState

    /// Dynamic, mutable state. Updated as items get checked off.
    public struct TripState: Codable, Hashable {
        /// Total number of items in the trip when it started.
        public var totalCount: Int
        /// Items checked off so far.
        public var checkedCount: Int
        /// Most recently checked item's name, for the Dynamic Island expanded
        /// trailing cell. Empty at trip start.
        public var lastCheckedName: String

        public init(totalCount: Int, checkedCount: Int, lastCheckedName: String) {
            self.totalCount = totalCount
            self.checkedCount = checkedCount
            self.lastCheckedName = lastCheckedName
        }

        public var progress: Double {
            guard totalCount > 0 else { return 0 }
            return min(1.0, Double(checkedCount) / Double(totalCount))
        }

        public var isComplete: Bool {
            totalCount > 0 && checkedCount >= totalCount
        }
    }

    /// Static attributes, set once at start.
    public var listTitle: String
    public var startedAt: Date

    public init(listTitle: String, startedAt: Date = .now) {
        self.listTitle = listTitle
        self.startedAt = startedAt
    }
}
