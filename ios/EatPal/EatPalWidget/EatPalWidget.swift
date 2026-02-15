import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct MealPlanEntry: TimelineEntry {
    let date: Date
    let meals: [WidgetMeal]
    let groceryCount: Int
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
            groceryCount: 5
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
        // Load from shared App Group UserDefaults
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

        return MealPlanEntry(
            date: Date(),
            meals: meals.isEmpty ? [
                WidgetMeal(slot: "No meals", foodName: "Open EatPal to plan", icon: "calendar.badge.plus")
            ] : meals,
            groceryCount: groceryCount
        )
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
            Group {
                if #available(iOSApplicationExtension 17.0, *) {
                    MealPlanWidgetSmall(entry: entry)
                        .containerBackground(.fill.tertiary, for: .widget)
                } else {
                    MealPlanWidgetSmall(entry: entry)
                }
            }
        }
        .configurationDisplayName("Today's Meals")
        .description("See today's meal plan at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
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
        groceryCount: 8
    )
}
