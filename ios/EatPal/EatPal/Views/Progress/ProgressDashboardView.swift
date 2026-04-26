import SwiftUI

struct ProgressDashboardView: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject private var badgeService = BadgeService.shared
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
        // US-241: surface newly-earned badge from any screen that's currently
        // showing the Progress dashboard. The sheet auto-clears the queued
        // celebration on dismiss so re-earns can refire.
        .sheet(item: $badgeService.pendingCelebration) { earned in
            BadgeCelebrationSheet(
                earned: earned,
                kidName: appState.kids.first { $0.id == earned.kidId }?.name ?? "Your child"
            )
        }
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

// MARK: - Achievements Tab (US-241)

struct AchievementsTab: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject private var badgeService = BadgeService.shared

    /// Per-kid scope. Falls back to the first kid when the active selection
    /// is unset so the screen never empties out — parents wandering into
    /// Progress without selecting a kid still see meaningful data.
    private var activeKidId: String {
        appState.activeKidId ?? appState.kids.first?.id ?? ""
    }

    private var activeKidName: String {
        appState.kids.first { $0.id == activeKidId }?.name ?? "your child"
    }

    private var currentStreak: Int {
        badgeService.currentStreak(kidId: activeKidId, planEntries: appState.planEntries)
    }

    private var bestStreak: Int {
        badgeService.bestStreak(kidId: activeKidId, planEntries: appState.planEntries)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if appState.kids.isEmpty {
                    ContentUnavailableView(
                        "Add a child profile",
                        systemImage: "person.crop.circle.badge.plus",
                        description: Text("Streaks and badges are tracked per child.")
                    )
                    .padding(.top, 40)
                } else {
                    StreakCard(
                        kidName: activeKidName,
                        current: currentStreak,
                        best: bestStreak
                    )

                    BadgesGrid(kidId: activeKidId)
                }
            }
            .padding()
        }
        // Touching revisionCounter forces SwiftUI to re-read the per-kid
        // earned set when a new badge gets persisted. The grid otherwise
        // wouldn't refresh until something else dirtied appState.
        .id(badgeService.revisionCounter)
    }
}

// MARK: - Streak card

private struct StreakCard: View {
    let kidName: String
    let current: Int
    let best: Int

    private var headline: String {
        if current == 0 {
            return "Start a streak!"
        }
        if current == 1 {
            return "1 day streak"
        }
        return "\(current) day streak"
    }

    private var subtitle: String {
        if current == 0 {
            return "Log a try-bite today to begin."
        }
        if current >= best {
            return "New personal best for \(kidName)!"
        }
        return "Best ever: \(best) days"
    }

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color.orange.opacity(0.18))
                    .frame(width: 64, height: 64)

                Image(systemName: current > 0 ? "flame.fill" : "flame")
                    .font(.system(size: 30))
                    .foregroundStyle(current > 0 ? .orange : .secondary)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(headline)
                    .font(.title3)
                    .fontWeight(.bold)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding()
        .background(
            LinearGradient(
                colors: [Color.orange.opacity(0.10), Color.red.opacity(0.05)],
                startPoint: .leading,
                endPoint: .trailing
            ),
            in: RoundedRectangle(cornerRadius: 14)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(Color.orange.opacity(0.20), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(headline). \(subtitle)")
    }
}

// MARK: - Badges grid

private struct BadgesGrid: View {
    let kidId: String
    @ObservedObject private var badgeService = BadgeService.shared

    private var earnedIds: Set<String> {
        badgeService.earnedIds(forKid: kidId)
    }

    private var earnedBadges: [Badge] {
        Badge.allCases.filter { earnedIds.contains($0.id) }
            // Highest tier first so the prized badges sit at the top.
            .sorted { $0.tier.rawValue > $1.tier.rawValue }
    }

    private var lockedBadges: [Badge] {
        Badge.allCases.filter { !earnedIds.contains($0.id) }
            .sorted { $0.tier.rawValue < $1.tier.rawValue }
    }

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if !earnedBadges.isEmpty {
                Text("Earned (\(earnedBadges.count))")
                    .font(.headline)
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(earnedBadges) { badge in
                        BadgeTile(badge: badge, isEarned: true)
                    }
                }
            }

            Text(earnedBadges.isEmpty ? "Badges to unlock" : "Locked (\(lockedBadges.count))")
                .font(.headline)
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(lockedBadges) { badge in
                    BadgeTile(badge: badge, isEarned: false)
                }
            }
        }
    }
}

private struct BadgeTile: View {
    let badge: Badge
    let isEarned: Bool

    @State private var showingDetail = false

    var body: some View {
        Button {
            showingDetail = true
        } label: {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill((isEarned ? badge.color : Color.gray).opacity(0.15))
                        .frame(width: 56, height: 56)

                    Image(systemName: badge.icon)
                        .font(.title2)
                        .foregroundStyle(isEarned ? badge.color : .gray)
                }

                Text(badge.title)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(isEarned ? .primary : .secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, minHeight: 110)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            .opacity(isEarned ? 1.0 : 0.65)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showingDetail) {
            BadgeDetailView(badge: badge, isEarned: isEarned)
        }
        .accessibilityLabel("\(isEarned ? "Earned" : "Locked"): \(badge.title)")
        .accessibilityHint(badge.description)
    }
}

private struct BadgeDetailView: View {
    @Environment(\.dismiss) var dismiss
    let badge: Badge
    let isEarned: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                ZStack {
                    Circle()
                        .fill((isEarned ? badge.color : Color.gray).opacity(0.18))
                        .frame(width: 140, height: 140)
                    Image(systemName: badge.icon)
                        .font(.system(size: 64))
                        .foregroundStyle(isEarned ? badge.color : .gray)
                }

                VStack(spacing: 8) {
                    Text(badge.title)
                        .font(.title)
                        .fontWeight(.bold)

                    Text(badge.description)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)

                    if !isEarned {
                        Text("Keep going — every meal log counts!")
                            .font(.callout)
                            .foregroundStyle(.tertiary)
                            .padding(.top, 8)
                    }
                }

                Spacer()

                Button("Done") { dismiss() }
                    .buttonStyle(.borderedProminent)
                    .tint(isEarned ? badge.color : .gray)
                    .padding(.bottom, 24)
            }
            .padding(.horizontal)
            .navigationBarTitleDisplayMode(.inline)
            .presentationDetents([.medium])
        }
    }
}

// MARK: - Weekly Reports Tab

struct WeeklyReportsTab: View {
    @EnvironmentObject var appState: AppState

    private var weeklyReports: [WeekReport] {
        let calendar = Calendar.current
        return (0..<4).map { weekOffset in
            let weekStart = (calendar.date(byAdding: .weekOfYear, value: -weekOffset, to: Date()) ?? Date())
                .weekDates.first ?? Date()
            let dates = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: weekStart) }
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
