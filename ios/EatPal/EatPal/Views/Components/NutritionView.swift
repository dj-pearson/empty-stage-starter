import SwiftUI

/// Displays nutrition information for a food item or daily summary.
struct NutritionCard: View {
    let nutrition: NutritionInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Nutrition Facts")
                .font(.headline)

            VStack(spacing: 0) {
                macroRow("Calories", value: nutrition.calories, unit: "kcal", bold: true)
                Divider()
                macroRow("Protein", value: nutrition.proteinG, unit: "g", bold: true)
                macroRow("Carbohydrates", value: nutrition.carbsG, unit: "g", bold: true)
                macroRow("Fat", value: nutrition.fatG, unit: "g", bold: true)
                Divider()
                macroRow("Fiber", value: nutrition.fiberG, unit: "g")
                macroRow("Calcium", value: nutrition.calciumMg, unit: "mg")
                macroRow("Iron", value: nutrition.ironMg, unit: "mg")
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func macroRow(_ label: String, value: Double?, unit: String, bold: Bool = false) -> some View {
        if let value {
            HStack {
                Text(label)
                    .font(.subheadline)
                    .fontWeight(bold ? .semibold : .regular)
                Spacer()
                Text(String(format: "%.1f%@", value, unit))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}

/// Compact macro ring display for daily summaries.
struct MacroRingsView: View {
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double

    // Daily targets (configurable)
    var calorieTarget: Double = 2000
    var proteinTarget: Double = 50
    var carbTarget: Double = 250
    var fatTarget: Double = 65

    var body: some View {
        HStack(spacing: 16) {
            MacroRing(
                label: "Cal",
                value: calories,
                target: calorieTarget,
                color: .red,
                unit: ""
            )
            MacroRing(
                label: "Protein",
                value: protein,
                target: proteinTarget,
                color: .blue,
                unit: "g"
            )
            MacroRing(
                label: "Carbs",
                value: carbs,
                target: carbTarget,
                color: .orange,
                unit: "g"
            )
            MacroRing(
                label: "Fat",
                value: fat,
                target: fatTarget,
                color: .purple,
                unit: "g"
            )
        }
    }
}

struct MacroRing: View {
    let label: String
    let value: Double
    let target: Double
    let color: Color
    let unit: String

    private var progress: Double {
        min(value / target, 1.0)
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.2), lineWidth: 6)
                    .frame(width: 56, height: 56)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(color, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .frame(width: 56, height: 56)
                    .rotationEffect(.degrees(-90))

                Text(String(format: "%.0f", value))
                    .font(.caption2)
                    .fontWeight(.bold)
                    // US-411: 3-4 digit values (e.g. calories) must not
                    // overflow the fixed 56pt ring under large Dynamic Type.
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .frame(maxWidth: 48)
            }

            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(String(format: "%.0f", value))\(unit) of \(String(format: "%.0f", target))\(unit)")
    }
}

/// Daily nutrition summary that aggregates all meals for a given day.
struct DailyNutritionSummary: View {
    let entries: [PlanEntry]
    let foods: [Food]

    /// US-411: the Food model carries no per-item macro/calorie data today, so
    /// real daily totals cannot be computed. Surfacing zeroed rings reads as
    /// "0 calories logged" — a placeholder masquerading as live data. Until
    /// nutrition lands on Food, show an explicit unavailable state.
    private var hasNutritionData: Bool { false }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Daily Nutrition")
                .font(.headline)

            if entries.isEmpty {
                Text("No meals logged yet today.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else if !hasNutritionData {
                Label("Nutrition data not available", systemImage: "chart.bar.doc.horizontal")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text("\(entries.count) meals logged")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// Note: NutritionInfo is defined in Models/Recipe.swift

#Preview {
    MacroRingsView(calories: 1450, protein: 62, carbs: 180, fat: 45)
        .padding()
}
