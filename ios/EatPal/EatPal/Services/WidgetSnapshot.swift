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

    /// US-412: build a snapshot payload from raw collections. Shared by the
    /// AppState change-stream path and the Siri-intent server-rebuild path so
    /// both produce an identical snapshot. `activeKidId` nil → meals across all
    /// kids (the intent path has no active-kid context).
    static func buildPayload(
        planEntries: [PlanEntry],
        foods: [Food],
        recipes: [Recipe],
        groceryItems: [GroceryItem],
        activeKidId: String?
    ) -> Payload {
        let todayString = DateFormatter.isoDate.string(from: Date())
        let todaysEntries = planEntries.filter { entry in
            entry.date == todayString && (activeKidId == nil || entry.kidId == activeKidId)
        }

        let meals: [Payload.Meal] = MealSlot.allCases.compactMap { slot in
            guard let entry = todaysEntries.first(where: { $0.mealSlot == slot.rawValue }) else {
                return nil
            }
            let foodName: String = {
                if let recipeId = entry.recipeId,
                   let recipe = recipes.first(where: { $0.id == recipeId }) {
                    return recipe.name
                }
                if let food = foods.first(where: { $0.id == entry.foodId }) {
                    return food.name
                }
                return "Unnamed"
            }()
            return Payload.Meal(slot: slot.displayName, foodName: foodName, icon: slot.icon)
        }

        let tonightDish = todaysEntries
            .first(where: { $0.mealSlot == MealSlot.dinner.rawValue })
            .flatMap { entry -> String? in
                if let recipeId = entry.recipeId,
                   let recipe = recipes.first(where: { $0.id == recipeId }) {
                    return recipe.name
                }
                return foods.first(where: { $0.id == entry.foodId })?.name
            }

        let pantryLowCount = foods.filter { food in
            guard let qty = food.quantity else { return false }
            return qty > 0 && qty <= 2
        }.count

        let unchecked = groceryItems.filter { !$0.checked }.count

        return Payload(
            meals: meals,
            groceryCount: unchecked,
            pantryLowCount: pantryLowCount,
            tonightDish: tonightDish,
            tryBiteStreak: 0
        )
    }

    /// US-412: rebuild the widget snapshot from the server. Background Siri
    /// intents bypass AppState entirely, so after a Siri mutation they call
    /// this to fetch the current data, write the snapshot, and reload the
    /// widget timeline — keeping the widget fresh without opening the app.
    /// Best-effort: any fetch failure simply skips the refresh.
    static func rebuildFromServer() async {
        let ds = DataService.shared
        async let foods = try? ds.fetchFoods()
        async let grocery = try? ds.fetchGroceryItems()
        async let plan = try? ds.fetchPlanEntries()
        async let recipes = try? ds.fetchRecipes()
        let (f, g, p, r) = await (foods ?? [], grocery ?? [], plan ?? [], recipes ?? [])
        let payload = buildPayload(
            planEntries: p,
            foods: f,
            recipes: r,
            groceryItems: g,
            activeKidId: nil
        )
        writeImmediately(payload)
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
