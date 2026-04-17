import ActivityKit
import Foundation

/// US-145: Starts / updates / ends the grocery-trip Live Activity from the
/// main app. The widget extension renders the UI using the same shared
/// `GroceryTripAttributes` type.
///
/// A trip can only have ONE active Activity at a time — starting a new one
/// while one is already live ends the previous. Activities auto-end 8 hours
/// after start as a safety net so abandoned trips don't stick on the Lock
/// Screen forever.
@MainActor
final class GroceryTripActivityService {
    static let shared = GroceryTripActivityService()

    private var current: Activity<GroceryTripAttributes>?
    private let autoEndInterval: TimeInterval = 8 * 60 * 60  // 8 hours

    private init() {
        // Recover a lingering activity from a previous app launch — prevents
        // state drift when the user force-quit mid-trip.
        if let existing = Activity<GroceryTripAttributes>.activities.first {
            self.current = existing
        }
    }

    /// Whether Live Activities are available and enabled for this app.
    var isAvailable: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    var isActive: Bool {
        current?.activityState == .active
    }

    var currentState: GroceryTripAttributes.TripState? {
        current?.content.state
    }

    // MARK: - Lifecycle

    /// Starts a new grocery-trip Live Activity. Silently no-ops when the user
    /// has disabled Live Activities in Settings.
    func start(listTitle: String, totalCount: Int, checkedCount: Int) async {
        guard isAvailable else { return }

        // If an activity is already live, update it instead of launching a second.
        if let current, current.activityState == .active {
            await update(totalCount: totalCount, checkedCount: checkedCount, lastCheckedName: "")
            return
        }

        let attributes = GroceryTripAttributes(listTitle: listTitle)
        let state = GroceryTripAttributes.TripState(
            totalCount: totalCount,
            checkedCount: checkedCount,
            lastCheckedName: ""
        )
        let content = ActivityContent(
            state: state,
            staleDate: Date().addingTimeInterval(autoEndInterval)
        )

        do {
            let activity = try Activity<GroceryTripAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
            self.current = activity
            SentryService.leaveBreadcrumb(
                category: "liveactivity",
                message: "Grocery trip started: \(listTitle) (\(checkedCount)/\(totalCount))"
            )
        } catch {
            SentryService.capture(error, extras: ["context": "GroceryTripActivity.start"])
        }
    }

    /// Updates the dynamic state. Safe to call with the same values —
    /// ActivityKit coalesces identical updates.
    func update(
        totalCount: Int,
        checkedCount: Int,
        lastCheckedName: String
    ) async {
        guard let current, current.activityState == .active else { return }

        let state = GroceryTripAttributes.TripState(
            totalCount: totalCount,
            checkedCount: checkedCount,
            lastCheckedName: lastCheckedName
        )
        let content = ActivityContent(
            state: state,
            staleDate: Date().addingTimeInterval(autoEndInterval)
        )

        await current.update(content)

        if state.isComplete {
            // Auto-end 3 seconds after completion so the user sees the 100% bar.
            try? await Task.sleep(for: .seconds(3))
            await end(finalState: state, dismissalPolicy: .default)
        }
    }

    /// Explicitly ends the activity, keeping the last state visible per the
    /// dismissalPolicy (default: a short grace period before it disappears).
    func end(
        finalState: GroceryTripAttributes.TripState? = nil,
        dismissalPolicy: ActivityUIDismissalPolicy = .default
    ) async {
        guard let current else { return }

        let state = finalState ?? current.content.state
        let content = ActivityContent(
            state: state,
            staleDate: nil
        )

        await current.end(content, dismissalPolicy: dismissalPolicy)
        self.current = nil

        SentryService.leaveBreadcrumb(
            category: "liveactivity",
            message: "Grocery trip ended"
        )
    }
}
