import Foundation
import WidgetKit

/// US-152: Keeps the home-screen / Lock Screen widget fresh by persisting a
/// compact snapshot of the data the widget needs into App Group UserDefaults
/// whenever the main app's AppState mutates. The widget reads these same keys
/// from its own process (see `EatPalWidget.swift`).
///
/// Debounced so a burst of mutations (e.g. the recipe→grocery batch insert)
/// doesn't ask WidgetKit to reload the timeline dozens of times in a second.
@MainActor
enum WidgetSnapshot {
    /// Shared App Group identifier. Must match both the main-app entitlement
    /// and the widget-extension entitlement (group.com.eatpal.app).
    static let appGroup = "group.com.eatpal.app"

    /// Keys stored in the App Group suite.
    enum Key {
        static let meals = "widget_meals"
        static let groceryCount = "widget_grocery_count"
        static let pantryLowCount = "widget_pantry_low_count"
        static let tonightDish = "widget_tonight_dish"
        static let tryBiteStreak = "widget_try_bite_streak"
        static let lastUpdatedAt = "widget_last_updated_at"
    }

    /// Name used when reloading timelines. Must match the `kind` on the
    /// `StaticConfiguration` in `EatPalWidget.swift` (currently "EatPalMealWidget").
    static let widgetKind = "EatPalMealWidget"

    // MARK: - Debounce state

    private static var pendingWorkItem: DispatchWorkItem?
    private static let debounceInterval: TimeInterval = 0.5

    // MARK: - Public API

    /// Snapshot model fed from `AppState`.
    struct Payload {
        let meals: [Meal]
        let groceryCount: Int
        let pantryLowCount: Int
        let tonightDish: String?
        let tryBiteStreak: Int

        struct Meal {
            let slot: String
            let foodName: String
            let icon: String
        }
    }

    /// Writes a snapshot immediately (skips debounce). Useful on app launch
    /// or when certainty matters (e.g. just before background handoff).
    static func writeImmediately(_ payload: Payload) {
        pendingWorkItem?.cancel()
        pendingWorkItem = nil
        persist(payload)
    }

    /// Writes a snapshot, debounced by 0.5s so a burst of mutations only
    /// triggers one widget reload.
    static func write(_ payload: Payload) {
        pendingWorkItem?.cancel()

        let work = DispatchWorkItem {
            Task { @MainActor in
                persist(payload)
            }
        }

        pendingWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + debounceInterval, execute: work)
    }

    // MARK: - Private

    private static func persist(_ payload: Payload) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }

        let mealDicts = payload.meals.map { meal in
            [
                "slot": meal.slot,
                "food": meal.foodName,
                "icon": meal.icon
            ]
        }

        defaults.set(mealDicts, forKey: Key.meals)
        defaults.set(payload.groceryCount, forKey: Key.groceryCount)
        defaults.set(payload.pantryLowCount, forKey: Key.pantryLowCount)
        defaults.set(payload.tonightDish, forKey: Key.tonightDish)
        defaults.set(payload.tryBiteStreak, forKey: Key.tryBiteStreak)
        defaults.set(Date().timeIntervalSince1970, forKey: Key.lastUpdatedAt)

        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }
}
