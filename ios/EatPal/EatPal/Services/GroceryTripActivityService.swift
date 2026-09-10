import ActivityKit
import Foundation

/// US-145: Starts / updates / ends the grocery-trip Live Activity from the
/// main app. The widget extension renders the UI using the same shared
/// `GroceryTripAttributes` type.
///
/// A trip can only have ONE active Activity at a time — starting a new one
/// while one is already live ends the previous.
///
/// Abandoned trips are ended 8 hours after they started. That safety net was
/// described here before it existed: `autoEndInterval` was only ever passed as
/// `ActivityContent.staleDate`, which does not end anything. A stale date tells
/// the widget its content is out of date so it can render accordingly; the
/// activity stays on the Lock Screen regardless. Worse, every `update` pushed
/// the stale date forward from "now", so a trip being actively checked off
/// never even reached it. `endIfExpired()` is the actual net, checked on launch
/// and on every foreground.
@MainActor
final class GroceryTripActivityService {
    static let shared = GroceryTripActivityService()

    private var current: Activity<GroceryTripAttributes>?
    private static let autoEndInterval: TimeInterval = 8 * 60 * 60

    private init() {
        // Recover a lingering activity from a previous app launch — prevents
        // state drift when the user force-quit mid-trip. Adopt the most recent
        // one; anything older is an orphan this process can no longer manage,
        // so end it rather than leave it on the Lock Screen forever.
        let existing = Activity<GroceryTripAttributes>.activities
            .sorted { $0.attributes.startedAt > $1.attributes.startedAt }
        self.current = existing.first

        let orphans = existing.dropFirst()
        if !orphans.isEmpty {
            Task {
                for orphan in orphans {
                    await orphan.end(nil, dismissalPolicy: .immediate)
                }
            }
        }

        Task { await endIfExpired() }
    }

    /// Ends the current activity once it is past `autoEndInterval`.
    ///
    /// Called on launch and on foreground. There is no timer to rely on: a
    /// suspended app runs no code, so the only honest place to check is when
    /// the app is running again.
    func endIfExpired() async {
        guard let current, current.activityState == .active else { return }
        guard Date() >= Self.deadline(for: current.attributes) else { return }

        SentryService.leaveBreadcrumb(
            category: "liveactivity",
            message: "Grocery trip auto-ended after \(Self.autoEndInterval / 3600)h"
        )
        await end(dismissalPolicy: .immediate)
    }

    /// When a trip stops being worth showing. Fixed to the start, so it does
    /// not move every time an item is checked off.
    private static func deadline(for attributes: GroceryTripAttributes) -> Date {
        attributes.startedAt.addingTimeInterval(autoEndInterval)
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
            staleDate: Self.deadline(for: attributes)
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
            staleDate: Self.deadline(for: current.attributes)
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
