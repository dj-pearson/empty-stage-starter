import SwiftUI
import Charts

/// Pantry distribution pie chart showing food counts by category.
@available(iOS 17.0, *)
struct PantryDistributionChart: View {
    let foods: [Food]

    private var categoryData: [(category: String, count: Int, color: Color)] {
        let grouped = Dictionary(grouping: foods, by: { $0.category })
        return grouped.map { (category, items) in
            let cat = FoodCategory(rawValue: category)
            return (
                category: cat?.displayName ?? category,
                count: items.count,
                color: AppTheme.Colors.categoryColor(category)
            )
        }
        .sorted { $0.count > $1.count }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pantry Distribution")
                .font(.headline)

            if categoryData.isEmpty {
                Text("No foods in pantry")
                    .foregroundStyle(.secondary)
            } else {
                Chart(categoryData, id: \.category) { item in
                    SectorMark(
                        angle: .value("Count", item.count),
                        innerRadius: .ratio(0.5),
                        angularInset: 2
                    )
                    .foregroundStyle(item.color)
                    .annotation(position: .overlay) {
                        if item.count > 0 {
                            Text("\(item.count)")
                                .font(.caption2)
                                .fontWeight(.bold)
                                .foregroundStyle(.white)
                        }
                    }
                }
                .frame(height: 200)

                // Legend
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 4) {
                    ForEach(categoryData, id: \.category) { item in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(item.color)
                                .frame(width: 8, height: 8)
                            Text("\(item.category) (\(item.count))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Weekly meal tracking chart showing meals logged per day.
@available(iOS 17.0, *)
struct WeeklyMealChart: View {
    let planEntries: [PlanEntry]
    let weekStart: Date

    private var dailyData: [(day: String, count: Int)] {
        let calendar = Calendar.current
        return (0..<7).map { dayOffset in
            let date = calendar.date(byAdding: .day, value: dayOffset, to: weekStart)!
            let dateStr = DateFormatter.isoDate.string(from: date)
            let count = planEntries.filter { $0.date == dateStr }.count
            let dayName = DateFormatter.dayOfWeek.string(from: date)
            return (day: String(dayName.prefix(3)), count: count)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("This Week's Meals")
                .font(.headline)

            Chart(dailyData, id: \.day) { item in
                BarMark(
                    x: .value("Day", item.day),
                    y: .value("Meals", item.count)
                )
                .foregroundStyle(Color.green.gradient)
                .cornerRadius(4)
            }
            .chartYAxis {
                AxisMarks(values: .automatic(desiredCount: 5))
            }
            .frame(height: 180)
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Food introduction results chart (ate/tasted/refused breakdown).
@available(iOS 17.0, *)
struct FoodResultsChart: View {
    let planEntries: [PlanEntry]

    private var resultData: [(result: String, count: Int, color: Color)] {
        let results = planEntries.compactMap(\.result)
        let grouped = Dictionary(grouping: results, by: { $0 })
        return [
            ("Ate", grouped["ate"]?.count ?? 0, AppTheme.Colors.success),
            ("Tasted", grouped["tasted"]?.count ?? 0, AppTheme.Colors.warning),
            ("Refused", grouped["refused"]?.count ?? 0, AppTheme.Colors.danger),
        ].filter { $0.1 > 0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Food Introduction Results")
                .font(.headline)

            if resultData.isEmpty {
                Text("No meal results logged yet")
                    .foregroundStyle(.secondary)
            } else {
                Chart(resultData, id: \.result) { item in
                    SectorMark(
                        angle: .value("Count", item.count),
                        innerRadius: .ratio(0.6),
                        angularInset: 2
                    )
                    .foregroundStyle(item.color)
                }
                .frame(height: 160)

                HStack(spacing: 16) {
                    ForEach(resultData, id: \.result) { item in
                        HStack(spacing: 4) {
                            Circle()
                                .fill(item.color)
                                .frame(width: 8, height: 8)
                            Text("\(item.result): \(item.count)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Allergen summary chart.
@available(iOS 17.0, *)
struct AllergenChart: View {
    let foods: [Food]

    private var allergenData: [(allergen: String, count: Int)] {
        let allAllergens = foods.flatMap { $0.allergens ?? [] }
        let grouped = Dictionary(grouping: allAllergens, by: { $0 })
        return grouped.map { ($0.key, $0.value.count) }
            .sorted { $0.count > $1.count }
            .prefix(8)
            .map { ($0.0, $0.1) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Allergen Overview")
                .font(.headline)

            if allergenData.isEmpty {
                Text("No allergens tracked")
                    .foregroundStyle(.secondary)
            } else {
                Chart(allergenData, id: \.allergen) { item in
                    BarMark(
                        x: .value("Count", item.count),
                        y: .value("Allergen", item.allergen)
                    )
                    .foregroundStyle(Color.red.gradient)
                    .cornerRadius(4)
                }
                .frame(height: CGFloat(allergenData.count * 32 + 20))
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    ScrollView {
        VStack(spacing: 16) {
            PantryDistributionChart(foods: [])
            WeeklyMealChart(planEntries: [], weekStart: Date())
            FoodResultsChart(planEntries: [])
        }
        .padding()
    }
}
