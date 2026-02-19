import SwiftUI

struct ProgressDashboardView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $selectedTab) {
                Text("Overview").tag(0)
                Text("Achievements").tag(1)
                Text("Weekly").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            switch selectedTab {
            case 0:
                OverviewTab()
            case 1:
                AchievementsTab()
            case 2:
                WeeklyReportsTab()
            default:
                EmptyView()
            }
        }
        .navigationTitle("Progress")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Overview Tab

struct OverviewTab: View {
    @EnvironmentObject var appState: AppState

    private var totalFoodsTried: Int {
        appState.foods.count
    }

    private var successRate: Double {
        let results = appState.planEntries.compactMap(\.result)
        guard !results.isEmpty else { return 0 }
        let ateCount = results.filter { $0 == "ate" }.count
        return Double(ateCount) / Double(results.count) * 100
    }

    private var thisWeekMeals: Int {
        let thisWeek = Date().weekDates
        return thisWeek.reduce(0) { total, date in
            let kidId = appState.activeKidId ?? ""
            return total + (kidId.isEmpty ? 0 : appState.planEntriesForDate(date, kidId: kidId).count)
        }
    }

    private var categoryDiversity: Int {
        let categories = Set(appState.foods.map(\.category))
        return categories.count
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Stats Grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ProgressStatCard(
                        title: "Foods Tried",
                        value: "\(totalFoodsTried)",
                        icon: "leaf.fill",
                        color: .green
                    )
                    ProgressStatCard(
                        title: "Success Rate",
                        value: String(format: "%.0f%%", successRate),
                        icon: "chart.line.uptrend.xyaxis",
                        color: .blue
                    )
                    ProgressStatCard(
                        title: "This Week",
                        value: "\(thisWeekMeals) meals",
                        icon: "calendar",
                        color: .orange
                    )
                    ProgressStatCard(
                        title: "Categories",
                        value: "\(categoryDiversity)",
                        icon: "square.grid.2x2.fill",
                        color: .purple
                    )
                }

                // Results Chart
                if #available(iOS 17.0, *) {
                    FoodResultsChart(planEntries: appState.planEntries)
                }

                // Safe vs Try Bite
                VStack(alignment: .leading, spacing: 10) {
                    Text("Food Safety Breakdown")
                        .font(.headline)

                    let safe = appState.safeFoods.count
                    let tryBite = appState.tryBiteFoods.count
                    let total = max(appState.foods.count, 1)

                    ProgressRow(label: "Safe Foods", count: safe, total: total, color: .green)
                    ProgressRow(label: "Try Bite Foods", count: tryBite, total: total, color: .orange)
                    ProgressRow(label: "Other", count: total - safe - tryBite, total: total, color: .gray)
                }
                .padding()
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            }
            .padding()
        }
    }
}

struct ProgressRow: View {
    let label: String
    let count: Int
    let total: Int
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.subheadline)
                Spacer()
                Text("\(count)")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(color)
            }
            ProgressView(value: Double(count), total: Double(total))
                .tint(color)
        }
    }
}

struct ProgressStatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Achievements Tab

struct AchievementsTab: View {
    @EnvironmentObject var appState: AppState

    private var achievements: [Achievement] {
        var list: [Achievement] = []

        // Food milestones
        if appState.foods.count >= 1 {
            list.append(Achievement(icon: "leaf.fill", title: "First Food", description: "Added your first food to the pantry", color: .green))
        }
        if appState.safeFoods.count >= 10 {
            list.append(Achievement(icon: "checkmark.shield.fill", title: "Safe 10", description: "10 foods marked as safe", color: .blue))
        }
        if appState.safeFoods.count >= 25 {
            list.append(Achievement(icon: "star.fill", title: "Super Safe", description: "25 foods marked as safe", color: .yellow))
        }
        if appState.safeFoods.count >= 50 {
            list.append(Achievement(icon: "crown.fill", title: "Food Champion", description: "50 safe foods - incredible!", color: .purple))
        }

        // Recipe milestones
        if appState.recipes.count >= 1 {
            list.append(Achievement(icon: "book.fill", title: "First Recipe", description: "Created your first recipe", color: .orange))
        }
        if appState.recipes.count >= 10 {
            list.append(Achievement(icon: "books.vertical.fill", title: "Recipe Collection", description: "10 recipes in your collection", color: .teal))
        }

        // Category diversity
        let categories = Set(appState.foods.map(\.category))
        if categories.count >= 5 {
            list.append(Achievement(icon: "square.grid.3x3.fill", title: "Diverse Eater", description: "Foods in 5+ categories", color: .indigo))
        }

        // Meal planning
        let resultsLogged = appState.planEntries.filter { $0.result != nil }.count
        if resultsLogged >= 7 {
            list.append(Achievement(icon: "calendar.badge.checkmark", title: "Week Warrior", description: "Logged 7+ meal results", color: .green))
        }
        if resultsLogged >= 30 {
            list.append(Achievement(icon: "flame.fill", title: "Consistent Tracker", description: "Logged 30+ meal results", color: .red))
        }

        // Grocery
        if appState.groceryItems.count >= 1 {
            list.append(Achievement(icon: "cart.fill", title: "Grocery Starter", description: "Created your first grocery list", color: .green))
        }

        return list
    }

    private var lockedAchievements: [Achievement] {
        var locked: [Achievement] = []

        if appState.foods.isEmpty {
            locked.append(Achievement(icon: "leaf.fill", title: "First Food", description: "Add your first food to the pantry", color: .gray))
        }
        if appState.safeFoods.count < 10 {
            locked.append(Achievement(icon: "checkmark.shield.fill", title: "Safe 10", description: "Mark 10 foods as safe (\(appState.safeFoods.count)/10)", color: .gray))
        }
        if appState.recipes.isEmpty {
            locked.append(Achievement(icon: "book.fill", title: "First Recipe", description: "Create your first recipe", color: .gray))
        }

        let resultsLogged = appState.planEntries.filter { $0.result != nil }.count
        if resultsLogged < 7 {
            locked.append(Achievement(icon: "calendar.badge.checkmark", title: "Week Warrior", description: "Log 7 meal results (\(resultsLogged)/7)", color: .gray))
        }

        return locked
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Earned
                if !achievements.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Earned (\(achievements.count))")
                            .font(.headline)
                            .padding(.horizontal)

                        ForEach(achievements) { achievement in
                            AchievementRow(achievement: achievement, isEarned: true)
                        }
                    }
                }

                // Locked
                if !lockedAchievements.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("In Progress")
                            .font(.headline)
                            .padding(.horizontal)

                        ForEach(lockedAchievements) { achievement in
                            AchievementRow(achievement: achievement, isEarned: false)
                        }
                    }
                }
            }
            .padding()
        }
    }
}

struct Achievement: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let description: String
    let color: Color
}

struct AchievementRow: View {
    let achievement: Achievement
    let isEarned: Bool

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: achievement.icon)
                .font(.title2)
                .foregroundStyle(isEarned ? achievement.color : .gray)
                .frame(width: 40, height: 40)
                .background(
                    (isEarned ? achievement.color : .gray).opacity(0.15),
                    in: Circle()
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(achievement.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(isEarned ? .primary : .secondary)
                Text(achievement.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if isEarned {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .opacity(isEarned ? 1 : 0.7)
    }
}

// MARK: - Weekly Reports Tab

struct WeeklyReportsTab: View {
    @EnvironmentObject var appState: AppState

    private var weeklyReports: [WeekReport] {
        let calendar = Calendar.current
        return (0..<4).map { weekOffset in
            let weekStart = calendar.date(byAdding: .weekOfYear, value: -weekOffset, to: Date())!.weekDates.first ?? Date()
            let dates = (0..<7).map { calendar.date(byAdding: .day, value: $0, to: weekStart)! }
            let kidId = appState.activeKidId ?? ""

            let entries = dates.flatMap { date in
                kidId.isEmpty ? [] : appState.planEntriesForDate(date, kidId: kidId)
            }

            let mealsPlanned = entries.count
            let resultsLogged = entries.filter { $0.result != nil }.count
            let ateCount = entries.filter { $0.result == "ate" }.count

            let foodIds = Set(entries.map(\.foodId))
            let newFoods = foodIds.count

            return WeekReport(
                weekStart: weekStart,
                mealsPlanned: mealsPlanned,
                resultsLogged: resultsLogged,
                ateCount: ateCount,
                newFoodsTried: newFoods,
                isCurrentWeek: weekOffset == 0
            )
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(weeklyReports) { report in
                    WeekReportCard(report: report)
                }
            }
            .padding()
        }
    }
}

struct WeekReport: Identifiable {
    let id = UUID()
    let weekStart: Date
    let mealsPlanned: Int
    let resultsLogged: Int
    let ateCount: Int
    let newFoodsTried: Int
    let isCurrentWeek: Bool
}

struct WeekReportCard: View {
    let report: WeekReport

    private var weekLabel: String {
        if report.isCurrentWeek {
            return "This Week"
        }
        return "Week of \(DateFormatter.shortDisplay.string(from: report.weekStart))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(weekLabel)
                    .font(.headline)
                if report.isCurrentWeek {
                    Text("Current")
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.green.opacity(0.15), in: Capsule())
                        .foregroundStyle(.green)
                }
                Spacer()
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                WeekStat(label: "Meals Planned", value: "\(report.mealsPlanned)", icon: "fork.knife")
                WeekStat(label: "Results Logged", value: "\(report.resultsLogged)", icon: "checkmark.circle")
                WeekStat(label: "Ate Successfully", value: "\(report.ateCount)", icon: "hand.thumbsup.fill")
                WeekStat(label: "Foods Tried", value: "\(report.newFoodsTried)", icon: "leaf.fill")
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct WeekStat: View {
    let label: String
    let value: String
    let icon: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(.green)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.subheadline)
                    .fontWeight(.bold)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    NavigationStack {
        ProgressDashboardView()
    }
    .environmentObject(AppState())
}
