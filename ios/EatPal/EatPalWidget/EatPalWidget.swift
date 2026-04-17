import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct MealPlanEntry: TimelineEntry {
    let date: Date
    let meals: [WidgetMeal]
    let groceryCount: Int
    let pantryLowCount: Int
    let tonightDish: String?
    let tryBiteStreak: Int
}

struct WidgetMeal {
    let slot: String
    let foodName: String
    let icon: String
}

// MARK: - Timeline Provider

struct MealPlanProvider: TimelineProvider {
    func placeholder(in context: Context) -> MealPlanEntry {
        MealPlanEntry(
            date: Date(),
            meals: [
                WidgetMeal(slot: "Breakfast", foodName: "Oatmeal", icon: "sunrise.fill"),
                WidgetMeal(slot: "Lunch", foodName: "Sandwich", icon: "sun.max.fill"),
                WidgetMeal(slot: "Dinner", foodName: "Pasta", icon: "moon.fill"),
            ],
            groceryCount: 5,
            pantryLowCount: 2,
            tonightDish: "Pasta",
            tryBiteStreak: 3
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (MealPlanEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MealPlanEntry>) -> Void) {
        // Fetch from shared UserDefaults (App Group)
        let entry = loadFromAppGroup()
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadFromAppGroup() -> MealPlanEntry {
        // Load from shared App Group UserDefaults. Keys mirror WidgetSnapshot.Key
        // in the main app so writes and reads line up.
        let defaults = UserDefaults(suiteName: "group.com.eatpal.app")

        let mealsData = defaults?.array(forKey: "widget_meals") as? [[String: String]] ?? []
        let meals = mealsData.map { dict in
            WidgetMeal(
                slot: dict["slot"] ?? "",
                foodName: dict["food"] ?? "No meal planned",
                icon: dict["icon"] ?? "fork.knife"
            )
        }

        let groceryCount = defaults?.integer(forKey: "widget_grocery_count") ?? 0
        let pantryLowCount = defaults?.integer(forKey: "widget_pantry_low_count") ?? 0
        let tonightDish = defaults?.string(forKey: "widget_tonight_dish")
        let tryBiteStreak = defaults?.integer(forKey: "widget_try_bite_streak") ?? 0

        return MealPlanEntry(
            date: Date(),
            meals: meals.isEmpty ? [
                WidgetMeal(slot: "No meals", foodName: "Open EatPal to plan", icon: "calendar.badge.plus")
            ] : meals,
            groceryCount: groceryCount,
            pantryLowCount: pantryLowCount,
            tonightDish: tonightDish,
            tryBiteStreak: tryBiteStreak
        )
    }
}

// MARK: - Lock Screen widgets (US-146)

/// Lock Screen rectangular accessory: "Tonight: <dish>" on line 1,
/// grocery / pantry status on line 2. Uses accented rendering mode.
struct MealPlanAccessoryRectangular: View {
    let entry: MealPlanEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "fork.knife")
                Text("Tonight")
                    .font(.caption2)
                    .fontWeight(.semibold)
            }

            Text(entry.tonightDish ?? "No dinner planned")
                .font(.caption)
                .fontWeight(.medium)
                .lineLimit(1)

            HStack(spacing: 8) {
                if entry.groceryCount > 0 {
                    Label("\(entry.groceryCount)", systemImage: "cart.fill")
                        .font(.caption2)
                }
                if entry.pantryLowCount > 0 {
                    Label("\(entry.pantryLowCount) low", systemImage: "leaf")
                        .font(.caption2)
                }
            }
        }
        .widgetAccentable()
    }
}

/// Lock Screen inline accessory: single tinted line. iOS lays this out
/// alongside other inline widgets on the Lock Screen.
struct MealPlanAccessoryInline: View {
    let entry: MealPlanEntry

    var body: some View {
        if let tonight = entry.tonightDish {
            Label("Tonight: \(tonight)", systemImage: "fork.knife")
        } else if entry.groceryCount > 0 {
            Label("\(entry.groceryCount) to buy", systemImage: "cart.fill")
        } else if entry.pantryLowCount > 0 {
            Label("\(entry.pantryLowCount) pantry items low", systemImage: "leaf")
        } else {
            Label("EatPal", systemImage: "leaf.fill")
        }
    }
}

/// Lock Screen circular accessory: shows the try-bite streak inside a
/// progress ring. Falls back to grocery count when no streak.
struct MealPlanAccessoryCircular: View {
    let entry: MealPlanEntry

    private var displayValue: Int {
        entry.tryBiteStreak > 0 ? entry.tryBiteStreak : entry.groceryCount
    }

    private var displayIcon: String {
        entry.tryBiteStreak > 0 ? "star.fill" : "cart.fill"
    }

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: displayIcon)
                    .font(.system(size: 12))
                Text("\(displayValue)")
                    .font(.system(size: 16, weight: .bold))
                    .monospacedDigit()
            }
        }
        .widgetAccentable()
    }
}

// MARK: - Widget Views

struct MealPlanWidgetSmall: View {
    let entry: MealPlanEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "fork.knife.circle.fill")
                    .foregroundStyle(.green)
                Text("Today")
                    .font(.caption)
                    .fontWeight(.bold)
            }

            ForEach(entry.meals.prefix(3), id: \.slot) { meal in
                HStack(spacing: 4) {
                    Image(systemName: meal.icon)
                        .font(.caption2)
                        .foregroundStyle(.green)
                        .frame(width: 14)

                    Text(meal.foodName)
                        .font(.caption2)
                        .lineLimit(1)
                }
            }

            Spacer()

            if entry.groceryCount > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "cart.fill")
                        .font(.caption2)
                        .foregroundStyle(.purple)
                    Text("\(entry.groceryCount) items")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
    }
}

struct MealPlanWidgetMedium: View {
    let entry: MealPlanEntry

    var body: some View {
        HStack(spacing: 16) {
            // Meals
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Image(systemName: "fork.knife.circle.fill")
                        .foregroundStyle(.green)
                    Text("Today's Meals")
                        .font(.caption)
                        .fontWeight(.bold)
                }
                .padding(.bottom, 2)

                ForEach(entry.meals.prefix(4), id: \.slot) { meal in
                    HStack(spacing: 6) {
                        Image(systemName: meal.icon)
                            .font(.caption2)
                            .foregroundStyle(.green)
                            .frame(width: 16)

                        Text(meal.slot)
                            .font(.caption2)
                            .fontWeight(.medium)
                            .frame(width: 60, alignment: .leading)

                        Text(meal.foodName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            // Grocery count
            VStack {
                Spacer()
                VStack(spacing: 4) {
                    Image(systemName: "cart.fill")
                        .font(.title3)
                        .foregroundStyle(.purple)
                    Text("\(entry.groceryCount)")
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("grocery\nitems")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                Spacer()
            }
        }
        .padding()
    }
}

// MARK: - Widget Definition

struct EatPalMealWidget: Widget {
    let kind = "EatPalMealWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MealPlanProvider()) { entry in
            MealPlanWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's Meals")
        .description("See today's meal plan, grocery count, and pantry status at a glance.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCircular
        ])
    }
}

/// Family-aware view router. Picks the correct layout for the family the
/// widget system is requesting and applies the appropriate container style.
struct MealPlanWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MealPlanEntry

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                MealPlanWidgetSmall(entry: entry)
            case .systemMedium:
                MealPlanWidgetMedium(entry: entry)
            case .accessoryRectangular:
                MealPlanAccessoryRectangular(entry: entry)
            case .accessoryInline:
                MealPlanAccessoryInline(entry: entry)
            case .accessoryCircular:
                MealPlanAccessoryCircular(entry: entry)
            default:
                MealPlanWidgetSmall(entry: entry)
            }
        }
        .containerBackground(for: .widget) {
            switch family {
            case .accessoryRectangular, .accessoryInline, .accessoryCircular:
                Color.clear
            default:
                Color(.systemBackground)
            }
        }
    }
}

// MARK: - Widget Bundle

@main
struct EatPalWidgetBundle: WidgetBundle {
    var body: some Widget {
        EatPalMealWidget()
    }
}

#Preview(as: .systemSmall) {
    EatPalMealWidget()
} timeline: {
    MealPlanEntry(
        date: Date(),
        meals: [
            WidgetMeal(slot: "Breakfast", foodName: "Oatmeal with berries", icon: "sunrise.fill"),
            WidgetMeal(slot: "Lunch", foodName: "Chicken sandwich", icon: "sun.max.fill"),
            WidgetMeal(slot: "Dinner", foodName: "Pasta with veggies", icon: "moon.fill"),
        ],
        groceryCount: 8,
        pantryLowCount: 3,
        tonightDish: "Pasta with veggies",
        tryBiteStreak: 5
    )
}
