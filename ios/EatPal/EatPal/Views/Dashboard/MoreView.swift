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
                            Text("Nutrition analytics and charts")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "chart.pie.fill")
                            .foregroundStyle(.purple)
                    }
                }

                NavigationLink {
                    AICoachView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("AI Coach")
                                .font(.body)
                            Text("Meal coaching and advice")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "bubble.left.and.text.bubble.right.fill")
                            .foregroundStyle(.green)
                    }
                }

                NavigationLink {
                    FoodChainingView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Food Chaining")
                                .font(.body)
                            Text("Bridge to new foods from favorites")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "link.circle.fill")
                            .foregroundStyle(.teal)
                    }
                }

                NavigationLink {
                    PickyEaterQuizView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Picky Eater Quiz")
                                .font(.body)
                            Text("Discover your child's eating style")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "questionmark.circle.fill")
                            .foregroundStyle(.pink)
                    }
                }

                NavigationLink {
                    ProgressDashboardView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Progress")
                                .font(.body)
                            Text("Achievements and weekly reports")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "trophy.fill")
                            .foregroundStyle(.yellow)
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

// MARK: - Insights View (Charts)

struct InsightsView: View {
    @EnvironmentObject var appState: AppState

    private var weekStart: Date {
        Date().weekDates.first ?? Date()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Summary stats
                HStack(spacing: 12) {
                    StatCard(title: "Total Foods", value: "\(appState.foods.count)", icon: "leaf.fill", color: .green)
                    StatCard(title: "Safe Foods", value: "\(appState.safeFoods.count)", icon: "checkmark.shield.fill", color: .blue)
                    StatCard(title: "Recipes", value: "\(appState.recipes.count)", icon: "book.fill", color: .orange)
                }
                .padding(.horizontal)

                if #available(iOS 17.0, *) {
                    PantryDistributionChart(foods: appState.foods)
                        .padding(.horizontal)

                    WeeklyMealChart(planEntries: appState.planEntries, weekStart: weekStart)
                        .padding(.horizontal)

                    FoodResultsChart(planEntries: appState.planEntries)
                        .padding(.horizontal)

                    AllergenChart(foods: appState.foods)
                        .padding(.horizontal)
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("Insights")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    NavigationStack {
        MoreView()
    }
    .environmentObject(AppState())
    .environmentObject(AuthViewModel())
}
