import SwiftUI

/// US-405: programmatic push targets inside the More tab. Deep links and
/// notification taps drive these via the More tab's NavigationStack path so a
/// `.kidProfile`/`.quiz`/`.foodChaining`/`.settings` link opens the real
/// screen instead of dead-ending on the tab root.
enum MoreRoute: Hashable {
    case dashboard
    case kids
    case kidProfile(id: String)
    case foodChaining
    case quiz
    case settings
    case progress
    // US-373: Recipes moved out of the tab bar into More.
    case recipes
    // US-462: complete deep-link coverage for the remaining Tools so
    // notifications / widgets / Siri can open them instead of dead-ending
    // on the More root.
    case foodTracker
    case insights
    case aiCoach
    // US-470: Budget promoted out of Settings into the Tools section.
    case budget
    // US-851: household membership, which is where a /join link points. It is
    // reachable by hand through Settings; a tapped invite pushes straight to
    // it so the person sees the household they just joined rather than a
    // settings list they now have to read.
    case household
    // Logged meals with their notes and amounts, readable by the household.
    case foodJournal
}

struct MoreView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        List {
            // M9/M19: the children come first; their allergies and "about"
            // page are what a co-parent or sitter opens More for.
            // US-462: value-based links so a deep link / notification tap and a
            // manual tap resolve through the same navigationDestination map.
            Section("Family") {
                ForEach(appState.kids) { kid in
                    NavigationLink(value: MoreRoute.kidProfile(id: kid.id)) {
                        MoreKidRow(kid: kid)
                    }
                }

                NavigationLink(value: MoreRoute.kids) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Children")
                                .font(.body)
                            Text(childrenSubtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "person.2.fill")
                            .foregroundStyle(.blue)
                    }
                }
                NavigationLink(value: MoreRoute.household) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Household")
                                .font(.body)
                            Text("Co-parents and caregivers")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "house.fill")
                            .foregroundStyle(.indigo)
                    }
                }
            }

            Section("Feeding therapy") {
                NavigationLink(value: MoreRoute.foodChaining) {
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
                NavigationLink(value: MoreRoute.foodJournal) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Food Journal")
                                .font(.body)
                            Text("Every meal, with notes and how much was eaten")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "book.closed.fill")
                            .foregroundStyle(.teal)
                    }
                }
                NavigationLink(value: MoreRoute.progress) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Progress")
                                .font(.body)
                            Text("Exposures, milestones and weekly reports")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "trophy.fill")
                            .foregroundStyle(.yellow)
                    }
                }
                NavigationLink(value: MoreRoute.foodTracker) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Meal results")
                                .font(.body)
                            Text("What was eaten, tasted or left for another day")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .foregroundStyle(.orange)
                    }
                }
                NavigationLink(value: MoreRoute.quiz) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Eating Style Quiz")
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
            }

            // US-373: Recipes moved here from the tab bar.
            Section {
                NavigationLink(value: MoreRoute.recipes) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Recipes")
                                .font(.body)
                            Text("\(appState.recipes.count) saved")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "book.fill")
                            .foregroundStyle(.green)
                    }
                }
            }

            Section("Tools") {
                NavigationLink(value: MoreRoute.insights) {
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

                // US-470: Budget promoted here from deep inside Settings.
                NavigationLink(value: MoreRoute.budget) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Budget")
                                .font(.body)
                            Text("Weekly spend forecast and target")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "dollarsign.circle.fill")
                            .foregroundStyle(.green)
                    }
                }

                NavigationLink(value: MoreRoute.aiCoach) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("AI Coach")
                                .font(.body)
                            Text("Meal ideas and mealtime coaching")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "bubble.left.and.text.bubble.right.fill")
                            .foregroundStyle(.green)
                    }
                }
            }

            // Sync (US-234)
            Section {
                SyncStatusRow()
            }

            // Settings
            Section {
                NavigationLink(value: MoreRoute.settings) {
                    Label("Settings", systemImage: "gearshape.fill")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("More")
        // US-405: resolve programmatic pushes from deep links / notification taps.
        .navigationDestination(for: MoreRoute.self) { route in
            switch route {
            case .dashboard:
                DashboardHomeView()
            case .kids:
                KidsView()
            case .kidProfile(let id):
                if let kid = appState.kids.first(where: { $0.id == id }) {
                    // Already inside the More tab's NavigationStack.
                    KidDetailView(kid: kid, embedInNavigationStack: false)
                } else {
                    KidsView()
                }
            case .foodChaining:
                FoodChainingView()
            case .quiz:
                PickyEaterQuizView()
            case .settings:
                SettingsView()
            case .progress:
                ProgressDashboardView()
            case .recipes:
                RecipesView()
            case .foodTracker:
                FoodTrackerView()
            case .insights:
                InsightsView()
            case .aiCoach:
                AICoachView()
            case .budget:
                BudgetView()
            case .household:
                HouseholdSettingsView()
            case .foodJournal:
                FoodJournalView()
            }
        }
    }
}

extension MoreView {
    private var childrenSubtitle: String {
        let n = appState.kids.count
        if n == 0 { return "Add a child" }
        return n == 1 ? "1 profile" : "\(n) profiles"
    }
}

/// A child in the More hub, with the allergy line a sitter needs first.
private struct MoreKidRow: View {
    let kid: Kid

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(kid.name)
                    .font(.body)
                if let allergens = kid.allergens, !allergens.isEmpty {
                    Text(KidAllergySummary.line(for: kid))
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("No allergies recorded")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } icon: {
            Text(String(kid.name.prefix(1)).uppercased())
                .font(.headline)
                .foregroundStyle(.green)
        }
    }
}

// MARK: - Sync Status Row (US-234)

private struct SyncStatusRow: View {
    @ObservedObject private var store = OfflineStore.shared
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var showingSheet = false

    private var subtitle: String {
        if !network.isConnected {
            let n = store.pendingMutationCount
            if n == 0 { return "Offline. Changes will sync when you're back online" }
            return "Offline. \(n) change\(n == 1 ? "" : "s") waiting to sync"
        }
        if store.isSyncing { return "Syncing now…" }
        if let err = store.lastSyncError, !err.isEmpty {
            return "Paused — \(err)"
        }
        if store.pendingMutationCount == 0 { return "All changes synced" }
        let n = store.pendingMutationCount
        return "\(n) pending change\(n == 1 ? "" : "s")"
    }

    private var iconColor: Color {
        if !network.isConnected { return .secondary }
        if store.lastSyncError != nil { return .orange }
        if store.pendingMutationCount > 0 { return .blue }
        return .green
    }

    var body: some View {
        Button {
            showingSheet = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "arrow.triangle.2.circlepath.icloud")
                    .foregroundStyle(iconColor)
                    .imageScale(.large)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sync")
                        .foregroundStyle(.primary)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if store.pendingMutationCount > 0 {
                    Text("\(store.pendingMutationCount)")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(iconColor, in: Capsule())
                }
                Image(systemName: "chevron.right")
                    .foregroundStyle(.tertiary)
                    .font(.caption)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showingSheet) {
            PendingChangesSheet()
        }
        .accessibilityLabel("Sync — \(subtitle)")
    }
}

// MARK: - Food Tracker (simplified)

struct FoodTrackerView: View {
    @EnvironmentObject var appState: AppState

    /// Scoped to the active child: mixing siblings' results made one
    /// child's "not today" count read as another's.
    private var recentEntries: [PlanEntry] {
        let kidId = appState.activeKidId
        return appState.planEntries
            .filter { $0.result != nil && (kidId == nil || $0.kidId == kidId) }
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
            if appState.kids.count > 1 {
                Section {
                    KidSelectorView()
                        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                }
            }

            // Stats Summary
            Section {
                HStack(spacing: 16) {
                    TrackerStat(label: "Ate", count: stats.ate, color: .green)
                    TrackerStat(label: "Tasted", count: stats.tasted, color: .orange)
                    TrackerStat(label: "Not today", count: stats.refused, color: .secondary)
                }
                .padding(.vertical, 8)
            }

            // Recent Results
            Section("Recent results") {
                if recentEntries.isEmpty {
                    Text("No meal results logged yet")
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
        .navigationTitle("Meal results")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func resultColor(_ result: MealResult) -> Color {
        result.tint
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
