import SwiftUI

struct MoreView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        List {
            // Dashboard
            Section {
                NavigationLink {
                    DashboardHomeView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Dashboard")
                                .font(.body)
                            Text("Overview and quick stats")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "square.grid.2x2.fill")
                            .foregroundStyle(.green)
                    }
                }
            }

            // Family
            Section("Family") {
                NavigationLink {
                    KidsView()
                } label: {
                    Label {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Children")
                                    .font(.body)
                                Text("\(appState.kids.count) profiles")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                    } icon: {
                        Image(systemName: "person.2.fill")
                            .foregroundStyle(.blue)
                    }
                }
            }

            // Tools
            Section("Tools") {
                NavigationLink {
                    FoodTrackerView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Food Tracker")
                                .font(.body)
                            Text("Track food introduction results")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .foregroundStyle(.orange)
                    }
                }

                NavigationLink {
                    InsightsView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Insights")
                                .font(.body)
                            Text("Nutrition analytics and progress")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "chart.pie.fill")
                            .foregroundStyle(.purple)
                    }
                }
            }

            // Settings
            Section {
                NavigationLink {
                    SettingsView()
                } label: {
                    Label("Settings", systemImage: "gearshape.fill")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("More")
    }
}

// MARK: - Food Tracker (simplified)

struct FoodTrackerView: View {
    @EnvironmentObject var appState: AppState

    private var recentEntries: [PlanEntry] {
        appState.planEntries
            .filter { $0.result != nil }
            .sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
    }

    private var stats: (ate: Int, tasted: Int, refused: Int) {
        let results = recentEntries.compactMap { $0.result }
        return (
            ate: results.filter { $0 == "ate" }.count,
            tasted: results.filter { $0 == "tasted" }.count,
            refused: results.filter { $0 == "refused" }.count
        )
    }

    var body: some View {
        List {
            // Stats Summary
            Section {
                HStack(spacing: 16) {
                    TrackerStat(label: "Ate", count: stats.ate, color: .green)
                    TrackerStat(label: "Tasted", count: stats.tasted, color: .orange)
                    TrackerStat(label: "Refused", count: stats.refused, color: .red)
                }
                .padding(.vertical, 8)
            }

            // Recent Results
            Section("Recent Results") {
                if recentEntries.isEmpty {
                    Text("No tracked results yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(recentEntries.prefix(20)) { entry in
                        HStack {
                            if let food = appState.foods.first(where: { $0.id == entry.foodId }) {
                                let cat = FoodCategory(rawValue: food.category)
                                Text(cat?.icon ?? "🍽")
                                Text(food.name)
                                    .font(.subheadline)
                            }

                            Spacer()

                            if let result = entry.result, let mealResult = MealResult(rawValue: result) {
                                Label(mealResult.displayName, systemImage: mealResult.icon)
                                    .font(.caption)
                                    .foregroundStyle(resultColor(mealResult))
                            }

                            Text(entry.date)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Food Tracker")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func resultColor(_ result: MealResult) -> Color {
        switch result {
        case .ate: return .green
        case .tasted: return .orange
        case .refused: return .red
        }
    }
}

struct TrackerStat: View {
    let label: String
    let count: Int
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text("\(count)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(color)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Insights View (simplified)

struct InsightsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        List {
            // Pantry Distribution
            Section("Pantry Distribution") {
                ForEach(FoodCategory.allCases, id: \.self) { category in
                    let count = appState.foods.filter { $0.category == category.rawValue }.count
                    let total = max(appState.foods.count, 1)
                    let percentage = Double(count) / Double(total)

                    HStack {
                        Text(category.icon)
                        Text(category.displayName)
                            .font(.subheadline)
                        Spacer()
                        Text("\(count)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        ProgressView(value: percentage)
                            .frame(width: 60)
                            .tint(.green)
                    }
                }
            }

            // Safety Stats
            Section("Food Safety") {
                let safe = appState.safeFoods.count
                let tryBite = appState.tryBiteFoods.count
                let other = appState.foods.count - safe - tryBite

                LabeledContent("Safe Foods") {
                    Text("\(safe)")
                        .foregroundStyle(.green)
                        .fontWeight(.semibold)
                }
                LabeledContent("Try Bite Foods") {
                    Text("\(tryBite)")
                        .foregroundStyle(.orange)
                        .fontWeight(.semibold)
                }
                LabeledContent("Other Foods") {
                    Text("\(other)")
                        .foregroundStyle(.secondary)
                }
            }

            // Meal Planning Coverage
            Section("This Week's Coverage") {
                let thisWeek = Date().weekDates
                ForEach(thisWeek, id: \.self) { date in
                    let entries = appState.activeKidId.map {
                        appState.planEntriesForDate(date, kidId: $0)
                    } ?? []

                    HStack {
                        Text(DateFormatter.shortDayOfWeek.string(from: date))
                            .font(.subheadline)
                            .frame(width: 40, alignment: .leading)

                        if Calendar.current.isDateInToday(date) {
                            Text("Today")
                                .font(.caption2)
                                .foregroundStyle(.green)
                                .fontWeight(.semibold)
                        }

                        Spacer()

                        Text("\(entries.count) meals")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Circle()
                            .fill(entries.isEmpty ? Color(.systemGray4) : .green)
                            .frame(width: 8, height: 8)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Insights")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        MoreView()
    }
    .environmentObject(AppState())
    .environmentObject(AuthViewModel())
}
